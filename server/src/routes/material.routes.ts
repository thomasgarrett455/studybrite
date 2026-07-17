import { Router } from "express";
import multer from "multer";
import { prisma } from "../db/prisma.js";
import requireAuth from "../middleware/requireAuth.js";
import { ingestMaterial, setSyllabus } from "../lib/materials.js";

const router = Router()
router.use(requireAuth)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

function ownClassroom(userId: number, classroomId: number) {
  return prisma.classrooms.findFirst({
    where: { id: classroomId, owner_id: userId, archived_at: null },
    select: { id: true }
  });
}

router.get("/:id/materials", async (requireAuth, res) => {
  const userId = requireAuth.user!.id;
  const classroomId = Number(requireAuth.params.id);
  if (!Number.isInteger(classroomId)) {
    return res.status(400).json({ message: "Bad classroom id"})
  }

  if (!(await ownClassroom(userId, classroomId))) {
    return res.status(404).json({ message: "Classroom not found" })
  }

  const notes = await prisma.note_headers.findMany({
    where: { classroom_id: classroomId, archived_at: null },
    orderBy: { created_at: "desc" },
    select: { id: true, created_at: true, currentVersion: {select: { title: true} } }
  });
  return res.json({ materials: notes})
});

router.post("/:id/materials", upload.single("file"), async (req, res) => {
  const userId = req.user!.id;
  const classroomId = Number(req.params.id);

  if (!Number.isInteger(classroomId)) {
    return res.status(400).json({ message: "Bad classroom id" })
  }

  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" })
  }

  if (!(await ownClassroom(userId, classroomId))) {
    return res.status(404).json({ message: "Classroom not found" })
  }

    const material = await ingestMaterial({
    userId,
    classroomId,
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
    filename: req.file.originalname,
  });
  if (!material) {
    return res.status(422).json({ message: "Could not extract any text from this file" });
  }

  return res.status(200).json({ material });

});

router.put("/:id/syllabus", upload.single("file"), async (req, res) => {
  const userId = req.user!.id;
  const classroomId = Number(req.params.id)

  if (!Number.isInteger(classroomId)) {
    return res.status(400).json({ message: "Bad Classroom id" })
  }

  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" })
  }

  if (!(await ownClassroom(userId, classroomId))) {
    return res.status(404).json({ message: "Classroom not found" })
  }

  const syllabus = await setSyllabus({
    classroomId,
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
    filename: req.file.originalname,
  });
  if (!syllabus) {
    return res.status(422).json({ message: "Could not extract any text from this file" });
  }

  return res.status(200).json({ syllabus });
});

export default router;