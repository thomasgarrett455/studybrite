import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import requireAuth from "../middleware/requireAuth.js";
import { anthropic, CHAT_MODEL } from "../lib/anthropic.js";
import { prisma } from "../db/prisma.js";
import { generateInviteCode } from "../lib/inviteCode.js";
import { ownClassroom } from "../lib/classrooms.js";
import { generateQuizForClassroom } from "../lib/quizGen.js";
import { generateDiagramForClassroom } from "../lib/diagramGen.js";
import multer from "multer";
import { ingestMaterial, setSyllabus } from "../lib/materials.js";

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024, files: 5 },
});



const router = Router();
router.use(requireAuth);

const SYSTEM = [
    "You are StudyBrite's home-page command assistant.",
    "You route the user's natural-language commands to the correct action and classroom using your tools.",
    "Rules:",
    "- When a command targets a classroom by name, call list_classrooms first and match case-insensitively.",
    "- If no classroom matches, or more than one could match, do NOT guess. Ask the user a clarifying question instead.",
    "- After performing an action, confirm in one or two sentences exactly what you did and where.",
    "- If asked for something you have no tool for, say you can't do that yet and list what you can do.",
].join("\n");

const TOOLS: Anthropic.Tool[] = [
    {
        name: "list_classrooms",
        description:
            "List the user's classrooms (id and name). Call this before any action that targets a classroom by name.",
        input_schema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "create_classroom",
        description:
            "Create a new classroom owned by the user. Only call this when the user clearly asked to create a new class.",
        input_schema: {
            type: "object",
            properties: {
                name: { type: "string", description: "The classroom name, e.g. 'Bio 101'" },
            },
            required: ["name"],
        },
    },
    {
        name: "generate_quiz",
        description:
            "Generate a multiple-choice quiz from a classroom's uploaded materials. " +
            "Requires the classroom's numeric id — resolve it with list_classrooms first. " +
            "If the user didn't say what topic the quiz should cover, ask them before calling this.",
        input_schema: {
            type: "object",
            properties: {
                classroom_id: { type: "number", description: "The classroom's id from list_classrooms" },
                topic: { type: "string", description: "What the quiz should cover, e.g. 'mitosis'" },
                count: { type: "number", description: "Number of questions, 1-20. Default 5." },
            },
            required: ["classroom_id", "topic"],
        },

    },
    {
        name: "generate_diagram",
        description:
            "Generate a concept map (diagram) from a classroom's uploaded materials for a topic. " +
            "Requires the classroom's numeric id — resolve it with list_classrooms first. " +
            "If the user didn't say what topic the diagram should cover, ask them before calling this.",
        input_schema: {
            type: "object",
            properties: {
                classroom_id: { type: "number", description: "The classroom's id from list_classrooms" },
                topic: { type: "string", description: "What the concept map should cover, e.g. 'photosynthesis'" },
            },
            required: ["classroom_id", "topic"],
        },
    },
    {
        name: "ingest_attached_files",
        description:
            "File the documents attached to the user's current message into a classroom: " +
            "extracts their text and adds them to that classroom's study materials. " +
            "Only call this when the message says files are attached. " +
            "Requires the classroom's numeric id — resolve it with list_classrooms first.",
        input_schema: {
            type: "object",
            properties: {
                classroom_id: { type: "number", description: "The classroom's id from list_classrooms" },
            },
            required: ["classroom_id"],
        },
    },
    {
        name: "set_syllabus",
        description:
            "Set the attached file as a classroom's syllabus. A syllabus (course outline, " +
            "weekly schedule, grading policies) is stored separately from study materials — " +
            "use this instead of ingest_attached_files whenever the user says the attachment " +
            "is a syllabus. Expects exactly one attached file. " +
            "Requires the classroom's numeric id — resolve it with list_classrooms first.",
        input_schema: {
            type: "object",
            properties: {
                classroom_id: { type: "number", description: "The classroom's id from list_classrooms" },
            },
            required: ["classroom_id"],
        },
    },

];

// What the tools need from the request: who is asking, and any files attached
// to the message being processed.
type ToolContext = {
    userId: number;
    files: Express.Multer.File[];
};

async function executeTool(
    name: string,
    input: Record<string, unknown>,
    ctx: ToolContext
): Promise<string> {
    if (name === "list_classrooms") {
        const classrooms = await prisma.classrooms.findMany({
            where: { owner_id: ctx.userId, archived_at: null },
            select: { id: true, name: true },
        });
        return JSON.stringify({ classrooms });
    }

    if (name === "create_classroom") {
        const className = String(input?.name ?? "").trim();
        if (!className) return JSON.stringify({ error: "name is required" });

        const classroom = await prisma.classrooms.create({
            data: { owner_id: ctx.userId, name: className, invite_code: generateInviteCode() },
            select: { id: true, name: true },
        });
        return JSON.stringify({ created: classroom });
    }

        if (name === "generate_quiz") {
        const classroomId = Number(input?.classroom_id);
        const topic = String(input?.topic ?? "").trim();
        let count = Number(input?.count) || 5;
        count = Math.max(1, Math.min(20, Math.floor(count)));

        if (!Number.isInteger(classroomId) || !topic) {
            return JSON.stringify({ error: "classroom_id and topic are required" });
        }

        const classroom = await ownClassroom(ctx.userId, classroomId);
        if (!classroom) {
            return JSON.stringify({ error: "Classroom not found" });
        }

        const quiz = await generateQuizForClassroom({
            userId: ctx.userId,
            classroomId,
            topic,
            count,
            syllabusText: classroom.syllabus_text ?? undefined,
        });
        if (!quiz) return JSON.stringify({ error: "Quiz generation failed" });

        return JSON.stringify({ created: quiz });
    }

    if (name === "generate_diagram") {
        const classroomId = Number(input?.classroom_id);
        const topic = String(input?.topic ?? "").trim();

        if (!Number.isInteger(classroomId) || !topic) {
            return JSON.stringify({ error: "classroom_id and topic are required" });
        }

        const classroom = await ownClassroom(ctx.userId, classroomId);
        if (!classroom) {
            return JSON.stringify({ error: "Classroom not found" });
        }

        const result = await generateDiagramForClassroom({
            userId: ctx.userId,
            classroomId,
            classroomName: classroom.name,
            topic,
            syllabusText: classroom.syllabus_text ?? undefined,
        });
        if (!result.ok) {
            return JSON.stringify({
                error:
                    result.reason === "insufficient"
                        ? "The materials didn't give enough connected concepts for a diagram — try a broader topic."
                        : "Diagram generation failed",
            });
        }

        return JSON.stringify({ created: { diagramId: result.diagramId, title: result.title } });
    }

        if (name === "ingest_attached_files") {
        const classroomId = Number(input?.classroom_id);
        if (!Number.isInteger(classroomId)) {
            return JSON.stringify({ error: "classroom_id is required" });
        }
        if (ctx.files.length === 0) {
            return JSON.stringify({ error: "No files are attached to this message" });
        }

        if (!(await ownClassroom(ctx.userId, classroomId))) {
            return JSON.stringify({ error: "Classroom not found" });
        }

        const results = [];
        for (const file of ctx.files) {
            const material = await ingestMaterial({
                userId: ctx.userId,
                classroomId,
                buffer: file.buffer,
                mimetype: file.mimetype,
                filename: file.originalname,
            });
            results.push(
                material
                    ? { filename: file.originalname, status: "ingested", chunks: material.chunks }
                    : { filename: file.originalname, status: "could_not_extract_text" }
            );
        }
        return JSON.stringify({ results });
    }

    if (name === "set_syllabus") {
        const classroomId = Number(input?.classroom_id);
        if (!Number.isInteger(classroomId)) {
            return JSON.stringify({ error: "classroom_id is required" });
        }
        if (ctx.files.length !== 1) {
            return JSON.stringify({ error: "Attach exactly one file to set as the syllabus" });
        }

        if (!(await ownClassroom(ctx.userId, classroomId))) {
            return JSON.stringify({ error: "Classroom not found" });
        }

        const file = ctx.files[0];
        if (!file) {
            return JSON.stringify({ error: "Attach exactly one file to set as the syllabus" });
        }
        const syllabus = await setSyllabus({
            classroomId,
            buffer: file.buffer,
            mimetype: file.mimetype,
            filename: file.originalname,
        });
        if (!syllabus) {
            return JSON.stringify({ error: "Could not extract text from this file" });
        }

        return JSON.stringify({ syllabus_set: syllabus });
    }

    return JSON.stringify({ error: `Unknown tool: ${name}` });
}

router.post("/chat", upload.array("files", 5), async (req, res) => {
    const userId = req.user!.id;
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    // Multipart requests carry `messages` as a JSON string field; plain JSON
    // requests (Bruno tests) still arrive as a real array. Accept both.
    let clientMessages: unknown = req.body?.messages;
    if (typeof clientMessages === "string") {
        try {
            clientMessages = JSON.parse(clientMessages);
        } catch {
            return res.status(400).json({ message: "messages must be valid JSON" });
        }
    }
    if (!Array.isArray(clientMessages) || clientMessages.length === 0) {
        return res.status(400).json({ message: "messages array is required" });
    }

    const messages: Anthropic.MessageParam[] = [...clientMessages];

    // The model can't see binary files — tell it what's attached in text.
    if (files.length > 0) {
        const names = files.map((f) => f.originalname).join(", ");
        const last = messages[messages.length - 1];
        if (last && last.role === "user" && typeof last.content === "string") {
            messages[messages.length - 1] = {
                role: "user",
                content: `${last.content}\n\n[The user attached ${files.length} file(s): ${names}]`,
            };
        }
    }

    const ctx: ToolContext = { userId, files };
    const base = { model: CHAT_MODEL, max_tokens: 2048, system: SYSTEM, tools: TOOLS };

    let response = await anthropic.messages.create({ ...base, messages });

    // Agent loop: run requested tools, feed results back, repeat until final text.
    let guard = 0;
    while (response.stop_reason === "tool_use" && guard++ < 8) {
        messages.push({ role: "assistant", content: response.content });

        const toolUses = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );

        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const tu of toolUses) {
            results.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: await executeTool(tu.name, tu.input as Record<string, unknown>, ctx),
            });
        }
        messages.push({ role: "user", content: results });

        response = await anthropic.messages.create({ ...base, messages });
    }

    const answer = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

    return res.json({ answer });
});


export default router;
