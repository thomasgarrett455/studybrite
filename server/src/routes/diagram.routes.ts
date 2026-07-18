import { Router } from "express";
import { prisma } from "../db/prisma.js";
import requireAuth from "../middleware/requireAuth.js";
import type {
    GeneratedDiagramNode,
    GeneratedDiagramEdge,
} from "../lib/prompt.js";
import { ownClassroom } from "../lib/classrooms.js";
import { generateDiagramForClassroom } from "../lib/diagramGen.js";

const router = Router();
router.use(requireAuth);

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

    const result = await generateDiagramForClassroom({
        userId,
        classroomId,
        classroomName: classroom.name,
        topic,
        syllabusText: classroom.syllabus_text ?? undefined,
    });

    if (!result.ok) {
        return res.status(502).json({
            message:
                result.reason === "insufficient"
                    ? "The materials didn't give enough connected concepts for a diagram — try a broader topic."
                    : "Diagram generation failed",
        });
    }

    return res.json({ diagramId: result.diagramId, title: result.title });
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
