import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../db/prisma.js";
import requireAuth from "../middleware/requireAuth.js";
import { anthropic, CHAT_MODEL } from "../lib/anthropic.js";
import { retrievedChunks } from "../lib/retrieve.js";
import {
  formatContext,
  buildTeachSystem,
  buildAssessSystem,
  buildTeachSummarySystem,
  ASSESS_TOOL,
  type GeneratedAssessment,
} from "../lib/prompt.js";
import { ownClassroom } from "../lib/classrooms.js";

const router = Router();
router.use(requireAuth);

function extractAnswer(content: Anthropic.ContentBlock[]): string {
    return content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
}

// The verbatim window: every message newer than the summarized_up_to pointer.
// Older messages live in the conversation's rolling summary instead.
async function loadWindowRows(conversationId: number, summarizedUpTo: number) {
    return prisma.chat_messages.findMany({
        where: { conversation_id: conversationId, id: { gt: summarizedUpTo } },
        orderBy: { id: "asc" },
        select: { id: true, sender: true, message_text: true },
    });
}

// The API requires alternating roles starting with "user": merge consecutive
// same-role rows, drop a leading assistant row.
function toApiMessages(
    rows: { sender: "user" | "ai"; message_text: string }[]
): Anthropic.MessageParam[] {
    const messages: Anthropic.MessageParam[] = [];
    for (const row of rows) {
        const role = row.sender === "user" ? "user" : "assistant";
        const last = messages[messages.length - 1];
        if (last && last.role === role) {
            last.content = `${last.content}\n\n${row.message_text}`;
        } else if (messages.length || role === "user") {
            messages.push({ role, content: row.message_text });
        }
    }
    return messages;
}

// Rolling-summary fold: once the verbatim window exceeds WINDOW_MAX messages,
// compress the oldest into the claim-ledger summary, keeping the newest
// WINDOW_KEEP verbatim. Runs fire-and-forget after the reply is sent, so the
// user never waits on it; a failed fold simply retries after the next turn.
const WINDOW_MAX = 20;
const WINDOW_KEEP = 10;

async function foldSummary(conversationId: number) {
    const conv = await prisma.ai_conversations.findUnique({
        where: { id: conversationId },
        select: { summary: true, summarized_up_to: true },
    });
    if (!conv) return;

    const rows = await loadWindowRows(conversationId, conv.summarized_up_to ?? 0);
    if (rows.length <= WINDOW_MAX) return;

    // Cut so the kept window starts on a user message (user-first alternation).
    let keepStart = rows.length - WINDOW_KEEP;
    while (keepStart > 0 && rows[keepStart]!.sender !== "user") keepStart--;
    if (keepStart <= 0) return;

    const folded = rows.slice(0, keepStart);
    const transcript = folded
        .map((r) => `${r.sender === "user" ? "Student" : "Bot"}: ${r.message_text}`)
        .join("\n");

    const response = await anthropic.messages.create({
        model: CHAT_MODEL,
        max_tokens: 500,
        system: buildTeachSummarySystem(),
        messages: [
            {
                role: "user",
                content:
                    `Existing ledger:\n${conv.summary?.trim() || "(empty)"}\n\n` +
                    `Messages to fold in:\n${transcript}`,
            },
        ],
    });

    const summary = extractAnswer(response.content).trim();
    if (!summary) return;

    await prisma.ai_conversations.update({
        where: { id: conversationId },
        data: { summary, summarized_up_to: folded[folded.length - 1]!.id },
    });
}

router.post("/:id/teach", async (req, res) => {
    const userId = req.user!.id;
    const classroomId = Number(req.params.id);
    if (!Number.isInteger(classroomId)) {
        return res.status(400).json({ message: "Bad classroom id" })
    }

    const message = String(req.body?.message ?? "").trim();
    if (!message) {
        return res.status(400).json({ message: "Message is required" })
    }

    const classroom = await ownClassroom(userId, classroomId);
    if (!classroom) {
        return res.status(404).json({ message: "Classroom not found" })
    }

     // Resolve the session. No conversationId = this message declares the topic.
    let conversationId = Number(req.body?.conversationId) || null
    let topic: string;
    let summary: string | undefined
    let summarizedUpTo = 0;

    if (conversationId) {
        const conv = await prisma.ai_conversations.findFirst({
            where: { id: conversationId, user_id: userId, classroom_id: classroomId, mode: "teach" },
            select: { topic: true, summary: true, summarized_up_to: true, assessed_at: true }
    });

    if (!conv) {
        return res.status(404).json({ message: "Teach session not found" });
    }

    if (conv.assessed_at) {
        return res.status(409).json({ message: 'This session has already been assessed' })
    }

    topic = conv.topic ?? message.slice(0,255);
    summary = conv.summary ?? undefined;
    summarizedUpTo = conv.summarized_up_to ?? 0;
    } else {
        topic = message.slice(0, 255);
        const conv = await prisma.ai_conversations.create({
            data: { user_id: userId, classroom_id: classroomId, mode: "teach", topic },
        });
        conversationId = conv.id;
    }

    await prisma.chat_messages.create({
        data: { conversation_id: conversationId, sender: "user", message_text: message },
    });

    const chunks = await retrievedChunks({ question: topic, classroomId });
    const context = formatContext(chunks, classroom.syllabus_text ?? undefined)

    const rows = await loadWindowRows(conversationId, summarizedUpTo);
    const messages = toApiMessages(rows);

    const response = await anthropic.messages.create({
        model: CHAT_MODEL,
        max_tokens: 1024,
        system: buildTeachSystem({
            classroomName: classroom.name,
            topic,
            context,
            ...(summary ? { summary } : {})
        }),
        messages,
    });

    const answer = extractAnswer(response.content);

    await prisma.chat_messages.create({
        data: {
            conversation_id: conversationId,
            sender: "ai",
            message_text: answer,
            model_used: CHAT_MODEL,
            input_tokens: response.usage.input_tokens,
            output_tokens: response.usage.output_tokens,
        },
    });

    await prisma.ai_conversations.update({
        where: { id: conversationId },
        data: { updated_at: new Date() },
    });

    res.json({ conversationId, answer, topic });

    // Step 5, fire-and-forget: fold older turns into the rolling summary after
    // the user already has their reply. A failure just retries next turn.
    foldSummary(conversationId).catch((err) =>
        console.error("teach summary fold failed:", err)
    );
});

router.get("/:id/teach/sessions", async (req, res) => {
    const userId = req.user!.id;
    const classroomId = Number(req.params.id);
    if (!Number.isInteger(classroomId)) {
        return res.status(400).json({ message: "Bad classroom id" });
    }

    if (!(await ownClassroom(userId, classroomId))) {
        return res.status(404).json({ message: "Classroom not found" });
    }

    const sessions = await prisma.ai_conversations.findMany({
        where: { user_id: userId, classroom_id: classroomId, mode: "teach" },
        orderBy: {updated_at: "desc"},
        select: { id: true, topic: true, assessed_at: true, updated_at: true }
    });

    return res.json({
        sessions: sessions.map((s) => ({
            conversationId: s.id, 
            topic: s.topic, 
            assessedAt: s.assessed_at, 
            updatedAt: s.updated_at,
        })),
    });
});

async function sessionPayload(conv: {id: number; topic: string | null; assessed_at: Date | null}) {
    const rows =  await prisma.chat_messages.findMany({
        where: { conversation_id: conv.id },
        orderBy: { id: "asc" },
        select: { id: true, sender: true, message_text: true }, 
    });

    let assessment: GeneratedAssessment | null = null;
    let transcript = rows;
    const lastRow = rows[rows.length - 1];
    if (conv.assessed_at && lastRow?.sender === "ai") {
        try {
            assessment = JSON.parse(lastRow.message_text) as GeneratedAssessment;
            transcript = rows.slice(0, -1)
        } catch {
            /* not JSON — leave it in the transcript */
        }
    }

    return {
        conversationId: conv.id,
        topic: conv.topic, 
        assessedAt: conv.assessed_at, 
        messages: transcript.map((r) => ({ id: r.id, sender: r.sender, text: r.message_text })), 
        assessment,
    }
}

router.get("/:id/teach/latest", async (req, res) => {
    const userId = req.user!.id;
    const classroomId = Number(req.params.id);
    if (!Number.isInteger(classroomId)) {
        return res.status(400).json({ message: "Bad classroom id" });
    }
    if (!(await ownClassroom(userId, classroomId))) {
        return res.status(404).json({ message: "Classroom not found" });
    }

    const conv = await prisma.ai_conversations.findFirst({
        where: { user_id: userId, classroom_id: classroomId, mode: "teach" },
        orderBy: { updated_at: "desc" },
        select: { id: true, topic: true, assessed_at: true },
    });
    if (!conv) {
        return res.json({ session: null });
    }

    return res.json({ session: await sessionPayload(conv) })
});

router.post("/:id/teach/:conversationId/assess", async (req, res) => {
    const userId = req.user!.id;
    const classroomId = Number(req.params.id);
    const conversationId = Number(req.params.conversationId);
    if (![classroomId, conversationId].every(Number.isInteger)) {
        return res.status(400).json({ message: "Bad id" });
    }

    const classroom = await ownClassroom(userId, classroomId);
    if (!classroom) {
        return res.status(404).json({ message: "Classroom not found" });
    }

    const conv = await prisma.ai_conversations.findFirst({
        where: { id: conversationId, user_id: userId, classroom_id: classroomId, mode: "teach" },
        select: { topic: true, summary: true, summarized_up_to: true, assessed_at: true },
    });
    if (!conv) {
        return res.status(404).json({ message: "Teach session not found" });
    }
    if (conv.assessed_at) {
        return res.status(409).json({ message: "This session has already been assessed" });
    }

    const topic = conv.topic ?? "(unknown topic)";
    const summary = conv.summary ?? undefined;

    const rows = await loadWindowRows(conversationId, conv.summarized_up_to ?? 0);
    if (!summary && !rows.some((r) => r.sender === "ai")) {
        return res.status(400).json({ message: "Nothing to assess yet — explain the topic first" });
    }

    const chunks = await retrievedChunks({ question: topic, classroomId });
    const context = formatContext(chunks, classroom.syllabus_text ?? undefined);

    // The transcript ends on the bot's reply; close it with the grading request
    // (which also keeps the required user-last alternation).
    const messages = toApiMessages(rows);
    const closing = "The session is over. Assess my explanation now.";
    const last = messages[messages.length - 1];
    if (last && last.role === "user") {
        last.content = `${last.content}\n\n${closing}`;
    } else {
        messages.push({ role: "user", content: closing });
    }

    const response = await anthropic.messages.create({
        model: CHAT_MODEL,
        max_tokens: 2048,
        system: buildAssessSystem({ topic, context, ...(summary ? { summary } : {}) }),
        tools: [ASSESS_TOOL],
        tool_choice: { type: "tool", name: "emit_assessment" },
        messages,
    });

    const block = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "emit_assessment"
    );
    if (!block) {
        return res.status(502).json({ message: "Assessment generation failed" });
    }

    // A cast checks nothing at runtime — normalize the shape ourselves.
    const raw = block.input as Partial<GeneratedAssessment>;
    const strings = (v: unknown) =>
        Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
    const assessment: GeneratedAssessment = {
        verdict: typeof raw.verdict === "string" ? raw.verdict : "",
        correct: strings(raw.correct),
        incorrect: strings(raw.incorrect),
        missing: strings(raw.missing),
    };
    if (!assessment.verdict) {
        return res.status(502).json({ message: "Assessment generation returned no verdict" });
    }

    // Claim the session before persisting: the updateMany only matches while
    // assessed_at is null, so of two racing assess calls exactly one wins.
    const claimed = await prisma.ai_conversations.updateMany({
        where: { id: conversationId, assessed_at: null },
        data: { assessed_at: new Date(), updated_at: new Date() },
    });
    if (claimed.count === 0) {
        return res.status(409).json({ message: "This session has already been assessed" });
    }

    await prisma.chat_messages.create({
        data: {
            conversation_id: conversationId,
            sender: "ai",
            message_text: JSON.stringify(assessment),
            model_used: CHAT_MODEL,
            input_tokens: response.usage.input_tokens,
            output_tokens: response.usage.output_tokens,
        },
    });

    return res.json({ conversationId, assessment });
});

router.get("/:id/teach/sessions/:conversationId", async (req, res) => {
    const userId = req.user!.id;
    const classroomId = Number(req.params.id);
    const conversationId = Number(req.params.conversationId);

    if (![classroomId, conversationId].every(Number.isInteger)) {
        return res.status(400).json({ message: "Bad id" });
    }
    if (!(await ownClassroom(userId, classroomId))) {
        return res.status(404).json({ message: "Classroom not found" });
    }

    const conv = await prisma.ai_conversations.findFirst({
        where: { id: conversationId, user_id: userId, classroom_id: classroomId, mode: "teach" },
        select: { id: true, topic: true, assessed_at: true },
    });
    if (!conv) {
        return res.json({ session: await sessionPayload });
    }
    return res.json({ session: await sessionPayload(conv) })
});

export default router;