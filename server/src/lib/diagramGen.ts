import Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../db/prisma.js";
import { anthropic, CHAT_MODEL } from "./anthropic.js";
import { retrievedChunks } from "./retrieve.js";
import {
    formatContext,
    buildDiagramSystem,
    DIAGRAM_TOOL,
    type GeneratedDiagram,
    type GeneratedDiagramNode,
    type GeneratedDiagramEdge,
} from "./prompt.js";

const MAX_NODES = 20;
const MAX_EDGES = 30;

// The stored shape of diagrams.diagram_data (Prisma Json).
type StoredDiagramData = {
    nodes: GeneratedDiagramNode[];
    edges: GeneratedDiagramEdge[];
};

// Either a persisted diagram, or a typed reason it couldn't be built. Callers map
// the reason to their own surface (HTTP status vs. tool-result text).
export type DiagramResult =
    | { ok: true; diagramId: number; title: string }
    | { ok: false; reason: "generation_failed" | "insufficient" };

// Generate a concept map from a classroom's materials and persist it. Callers own
// auth and input validation (topic non-empty, classroom ownership).
export async function generateDiagramForClassroom(opts: {
    userId: number;
    classroomId: number;
    classroomName: string;
    topic: string;
    syllabusText?: string | undefined;
}): Promise<DiagramResult> {
    const { userId, classroomId, classroomName, topic } = opts;

    // Ground the map in this classroom's materials.
    const chunks = await retrievedChunks({ question: topic, classroomId, topK: 6 });
    const context = formatContext(chunks, opts.syllabusText);

    const ai = await anthropic.messages.create({
        model: CHAT_MODEL,
        max_tokens: 2048,
        system: buildDiagramSystem({ classroomName, topic, context }),
        tools: [DIAGRAM_TOOL],
        tool_choice: { type: "tool", name: "emit_diagram" },
        messages: [{ role: "user", content: `Build a concept map of: ${topic}` }],
    });

    const block = ai.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "emit_diagram"
    );
    if (!block) return { ok: false, reason: "generation_failed" };

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
        return { ok: false, reason: "insufficient" };
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

    return { ok: true, diagramId: created.id, title };
}