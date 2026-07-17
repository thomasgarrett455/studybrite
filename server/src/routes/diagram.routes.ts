import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../db/prisma.js";
import requireAuth from "../middleware/requireAuth.js";
import { anthropic, CHAT_MODEL } from "../lib/anthropic.js";
import { retrievedChunks } from "../lib/retrieve.js";
import {
    formatContext,
    buildDiagramSystem,
    DIAGRAM_TOOL,
    type GeneratedDiagram,
    type GeneratedDiagramNode,
    type GeneratedDiagramEdge,
} from "../lib/prompt.js";
import { ownClassroom } from "../lib/classrooms.js";

const router = Router();
router.use(requireAuth);

const MAX_NODES = 20;
const MAX_EDGES = 30;

// The stored shape of diagrams.diagram_data (Prisma Json).
type StoredDiagramData = {
    nodes: GeneratedDiagramNode[];
    edges: GeneratedDiagramEdge[];
};

// POST diagrams: generate a concept map for a topic and persist it.
router.post("/:id/diagrams", async (req, res) => {
    const userId = req.user!.id;
    const classroomId = Number(req.params.id);
    if (!Number.isInteger(classroomId)) {
        return res.status(400).json({ message: "Bad classroom id" });
    }

    const classroom = await ownClassroom(userId, classroomId);
    if (!classroom) {
        return res.status(404).json({ message: "Classroom not found" });
    }

    const topic = String(req.body?.topic ?? "").trim();
    if (!topic || topic.length > 200) {
        return res.status(400).json({ message: "Topic is required (max 200 chars)" });
    }

    // Ground the map in this classroom's materials.
    const chunks = await retrievedChunks({ question: topic, classroomId, topK: 6 });
    const context = formatContext(chunks, classroom.syllabus_text ?? undefined);

    const ai = await anthropic.messages.create({
        model: CHAT_MODEL,
        max_tokens: 2048,
        system: buildDiagramSystem({ classroomName: classroom.name, topic, context }),
        tools: [DIAGRAM_TOOL],
        tool_choice: { type: "tool", name: "emit_diagram" },
        messages: [{ role: "user", content: `Build a concept map of: ${topic}` }],
    });

    const block = ai.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "emit_diagram"
    );
    if (!block) {
        return res.status(502).json({ message: "Diagram generation failed" });
    }

    // --- Validate the model's output before persisting ---
    const raw = block.input as GeneratedDiagram;

    // Nodes: unique non-empty ids, trimmed labels, capped.
    const nodes: GeneratedDiagramNode[] = [];
    const nodeIds = new Set<string>();
    for (const n of Array.isArray(raw.nodes) ? raw.nodes : []) {
        const id = typeof n?.id === "string" ? n.id.trim() : "";
        const label = typeof n?.label === "string" ? n.label.trim() : "";
        if (!id || !label || nodeIds.has(id)) continue;
        nodeIds.add(id);
        nodes.push({ id, label: label.slice(0, 80) });
        if (nodes.length >= MAX_NODES) break;
    }

    // Edges: both endpoints must be surviving nodes; no self-loops or dupes.
    const edges: GeneratedDiagramEdge[] = [];
    const seenEdges = new Set<string>();
    for (const e of Array.isArray(raw.edges) ? raw.edges : []) {
        const from = typeof e?.from === "string" ? e.from.trim() : "";
        const to = typeof e?.to === "string" ? e.to.trim() : "";
        if (!nodeIds.has(from) || !nodeIds.has(to) || from === to) continue;
        const key = `${from}->${to}`;
        if (seenEdges.has(key)) continue;
        seenEdges.add(key);
        const label = typeof e?.label === "string" ? e.label.trim().slice(0, 60) : "";
        edges.push(label ? { from, to, label } : { from, to });
        if (edges.length >= MAX_EDGES) break;
    }

    // Drop orphan nodes (no edge touches them) so the render has no floating boxes.
    const connected = new Set<string>();
    for (const e of edges) {
        connected.add(e.from);
        connected.add(e.to);
    }
    const finalNodes = nodes.filter((n) => connected.has(n.id));

    if (finalNodes.length < 3 || edges.length < 2) {
        return res.status(502).json({
            message: "The materials didn't give enough connected concepts for a diagram — try a broader topic.",
        });
    }

    const title =
        typeof raw.title === "string" && raw.title.trim()
            ? raw.title.trim().slice(0, 255)
            : `Concept map: ${topic}`;

    const diagramData: StoredDiagramData = { nodes: finalNodes, edges };

    const created = await prisma.diagrams.create({
        data: {
            user_id: userId,
            classroom_id: classroomId,
            topic: topic.slice(0, 255),
            title,
            diagram_data: diagramData as unknown as Prisma.InputJsonValue,
        },
    });

    return res.json({ diagramId: created.id, title });
});

// GET diagrams: list the classroom's saved diagrams (newest first).
router.get("/:id/diagrams", async (req, res) => {
    const userId = req.user!.id;
    const classroomId = Number(req.params.id);
    if (!Number.isInteger(classroomId)) {
        return res.status(400).json({ message: "Bad classroom id" });
    }
    if (!(await ownClassroom(userId, classroomId))) {
        return res.status(404).json({ message: "Classroom not found" });
    }

    const rows = await prisma.diagrams.findMany({
        where: { user_id: userId, classroom_id: classroomId, archived_at: null },
        orderBy: { created_at: "desc" },
        select: { id: true, title: true, topic: true, created_at: true, diagram_data: true },
    });

    const diagrams = rows.map((d: (typeof rows)[number]) => {
        const data = d.diagram_data as unknown as StoredDiagramData;
        return {
            id: d.id,
            title: d.title,
            topic: d.topic,
            created_at: d.created_at,
            nodeCount: Array.isArray(data?.nodes) ? data.nodes.length : 0,
        };
    });

    return res.json({ diagrams });
});

// GET one diagram: the full node/edge graph for rendering.
router.get("/:id/diagrams/:diagramId", async (req, res) => {
    const userId = req.user!.id;
    const classroomId = Number(req.params.id);
    const diagramId = Number(req.params.diagramId);
    if (![classroomId, diagramId].every(Number.isInteger)) {
        return res.status(400).json({ message: "Bad id" });
    }
    if (!(await ownClassroom(userId, classroomId))) {
        return res.status(404).json({ message: "Classroom not found" });
    }

    const diagram = await prisma.diagrams.findFirst({
        where: { id: diagramId, user_id: userId, classroom_id: classroomId, archived_at: null },
        select: { id: true, title: true, topic: true, created_at: true, diagram_data: true },
    });
    if (!diagram) {
        return res.status(404).json({ message: "Diagram not found" });
    }

    const data = diagram.diagram_data as unknown as StoredDiagramData;
    return res.json({
        id: diagram.id,
        title: diagram.title,
        topic: diagram.topic,
        created_at: diagram.created_at,
        nodes: Array.isArray(data?.nodes) ? data.nodes : [],
        edges: Array.isArray(data?.edges) ? data.edges : [],
    });
});

export default router;
