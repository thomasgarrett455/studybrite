import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../db/prisma.js";
import requireAuth from "../middleware/requireAuth.js";
import { anthropic, CHAT_MODEL } from "../lib/anthropic.js";
import { retrievedChunks } from "../lib/retrieve.js";
import {
  hasCoverage,
  formatContext,
  buildInMaterialSystem,
  buildOutsideMaterialSystem,
  buildRelevanceSystem,
} from "../lib/prompt.js";

const router = Router();
router.use(requireAuth);

function ownClassroom(userId: number, classroomId: number) {
    return prisma.classrooms.findFirst({
        where: { id: classroomId, owner_id: userId, archived_at: null },
        select: { id: true, name: true },
    });
}

function extractAnswer(content: Anthropic.ContentBlock[]): string {
    return content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
}

function extractSources(content: Anthropic.ContentBlock[]): { url: string; title: string }[] {
    const seen = new Map<string, string>();

    for (const block of content) {
        if (block.type !== "text" || !block.citations) continue;
        for (const c of block.citations) {
            if (c.type === "web_search_result_location" && !seen.has(c.url)) {
                seen.set (c.url, c.title ?? c.url);
            }
        }
    }

    return [...seen].map(([url, title]) => ({ url, title }));
}

async function checkRelevance(opts: {
  question: string;
  classroomName: string;
  context: string;
}): Promise<boolean> {
  const res = await anthropic.messages.create({
    model: CHAT_MODEL,
    max_tokens: 5,
    system: buildRelevanceSystem(),
    messages: [
      {
        role: "user",
        content:
          `Class name: ${opts.classroomName}\n` +
          `Sample of the class's materials:\n${opts.context}\n\n` +
          `Question: ${opts.question}`,
      },
    ],
  });

  const verdict = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .toUpperCase();
 
  return !verdict.startsWith("NO");
}

async function runClaude(opts: { system: string; question: string; useWeb: boolean }) {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.question }];
  const base = {
    model: CHAT_MODEL,
    max_tokens: 2048,
    system: opts.system,
    ...(opts.useWeb
      ? { tools: [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 1 }] }
      : {}),
  };

  let response = await anthropic.messages.create({ ...base, messages });

  let guard = 0;
  while (response.stop_reason === "pause_turn" && guard++ < 5) {
    messages.push({ role: "assistant", content: response.content });
    response = await anthropic.messages.create({ ...base, messages });
  }
  return response;
}

router.post("/:id/chat", async (req, res) => {
    const userId = req.user!.id;
    const classroomId = Number(req.params.id);
    if (!Number.isInteger(classroomId)) {
        return res.status(400).json({message: "Bad classroom id"});
    }

    const question = String(req.body?.question ?? "").trim();
    if (!question) {
        return res.status(400).json({ message: "Question is required" });
    }

    const classroom = await ownClassroom(userId, classroomId);
    if (!classroom) {
        return res.status(404).json({ message: "Classroom not found" });
    }
    const classroomName = classroom.name;

    let conversationId = Number(req.body?.conversationId) || null;
    if (conversationId) {
        const conv = await prisma.ai_conversations.findFirst({
            where: { id: conversationId, user_id: userId, classroom_id: classroomId },
            select: { id: true }
        });
        if (!conv) conversationId = null;
    }
    if (!conversationId) {
        const conv = await prisma.ai_conversations.create({
            data: { user_id: userId, classroom_id: classroomId },
        });
        conversationId = conv.id
    }

    await prisma.chat_messages.create({
        data: { conversation_id: conversationId, sender: "user", message_text: question }
    });

    const chunks = await retrievedChunks({ question, classroomId });
    const fromMaterials = hasCoverage(chunks);
    const context = formatContext(chunks);

    let source: "materials" | "training" | "web" | "off_topic";
    let sources: { url: string; title: string }[] = [];
    let answer: string;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;

    if (fromMaterials) {
        const response = await runClaude({ system: buildInMaterialSystem(context), question, useWeb: false });
        source = "materials";
        answer = extractAnswer(response.content);
        inputTokens = response.usage.input_tokens;
        outputTokens = response.usage.output_tokens;
    } else if (!(await checkRelevance({ question, classroomName, context }))) {
        // Off-topic for this class → decline, no answer call, no web search.
        source = "off_topic";
        answer = "This question doesn't seem to be relevant to the material in this class.";
    } else {
        const response = await runClaude({ system: buildOutsideMaterialSystem(context), question, useWeb: true });
        const webSources = extractSources(response.content);
        source = webSources.length > 0 ? "web" : "training";
        sources = webSources;
        answer = extractAnswer(response.content);
        inputTokens = response.usage.input_tokens;
        outputTokens = response.usage.output_tokens;
    }

    await prisma.chat_messages.create({
        data: {
        conversation_id: conversationId,
        sender: "ai",
        message_text: answer,
        model_used: CHAT_MODEL,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        },
    });
    await prisma.ai_conversations.update({
        where: { id: conversationId },
        data: { updated_at: new Date() },
    });

    return res.json({
        conversationId,
        answer,
        source,    
        sources,
        topScore: chunks[0]?.score ?? 0,
    });

});

export default router;