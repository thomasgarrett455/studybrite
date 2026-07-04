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
        select: { id: true, name: true, syllabus_text: true },
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

// True if the model actually ran a web search, regardless of whether it cited.
function webSearchRan(content: Anthropic.ContentBlock[]): boolean {
    return content.some((b) => b.type === "web_search_tool_result");
}

// Every page the web search returned (the pages the model read), deduped by URL.
function extractSearchResults(content: Anthropic.ContentBlock[]): { url: string; title: string }[] {
    const seen = new Map<string, string>();

    for (const block of content) {
        if (block.type !== "web_search_tool_result") continue;
        // .content is either an error object or an array of result blocks.
        if (!Array.isArray(block.content)) continue;
        for (const r of block.content) {
            if (r.type === "web_search_result" && !seen.has(r.url)) {
                seen.set(r.url, r.title ?? r.url);
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

async function syllabusCovers(opts: { question: string; syllabus: string }): Promise<boolean> {
  const res = await anthropic.messages.create({
    model: CHAT_MODEL,
    max_tokens: 5,
        system: [
      "You decide whether a student's question can be answered from a class syllabus.",
      "Answer YES if the syllabus contains what the question asks for. This includes:",
      "- a request for the syllabus itself, or a summary/overview of the course;",
      "- course logistics: policies (late work, attendance, grading weights), dates,",
      "  deadlines, the schedule of topics, required textbooks/materials, the course",
      "  description, or instructor/contact info.",
      "Answer NO only if the question asks you to EXPLAIN or TEACH a subject-matter topic.",
      "Merely listing a topic name in the schedule (e.g. 'Week 6: Evolution') does NOT",
      "mean the syllabus explains that topic — that case is NO.",
      "Reply with exactly one word: YES if the syllabus answers the question, NO otherwise.",
    ].join("\n"),

    messages: [
      { role: "user", content: `Syllabus:\n${opts.syllabus}\n\nQuestion: ${opts.question}` },
    ],
  });

  const verdict = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .toUpperCase();

  return verdict.startsWith("YES");
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
    const context = formatContext(chunks, classroom.syllabus_text ?? undefined);

    const syllabusText = classroom.syllabus_text?.trim() ?? "";
    const fromSyllabus = !fromMaterials && syllabusText
    ? await syllabusCovers({ question, syllabus: syllabusText })
    : false;


    let source: "materials" | "training" | "web" | "off_topic";
    let sources: { url: string; title: string }[] = [];
    let answer: string;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;

    if (fromMaterials || fromSyllabus) {
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

        // Inline citations are the precise, claim-level signal; the search-result list
        // is every page the model actually read. Merge them so no consulted source is
        // dropped just because the model paraphrased without attaching a citation.
        const cited = extractSources(response.content);
        const consulted = extractSearchResults(response.content);
        const byUrl = new Map<string, string>();
        for (const s of [...cited, ...consulted]) {
            if (!byUrl.has(s.url)) byUrl.set(s.url, s.title);
        }
        sources = [...byUrl].map(([url, title]) => ({ url, title }));

        // "web" whenever a search actually ran, even if the model failed to cite inline.
        source = webSearchRan(response.content) ? "web" : "training";
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