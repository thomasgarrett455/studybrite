import { Router } from "express";
import multer from "multer";
import { prisma } from "../db/prisma.js";
import requireAuth from "../middleware/requireAuth.js";
import { extractText } from "../lib/extract.js";
import { ingestText } from "../lib/ingest.js";

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

  const text = await extractText({
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
    filename: req.file.originalname,
  });

  if (!text.trim()) {
    return res.status(422).json({ message: "Could not extract any text from this file" })
  }

  const header = await prisma.note_headers.create({
    data: { user_id: userId, classroom_id: classroomId }
  });

  const version = await prisma.note_versions.create({
    data: { header_id: header.id, version_number: 1, title: req.file.originalname, content: text }
  });

  await prisma.note_headers.update({
    where: { id: header.id }, 
    data: { current_version_id: version.id },
  });

  const chunkCount = await ingestText({ text, classroomId, noteId: header.id });

  return res.status(200).json({
    material: { id: header.id, title: req.file.originalname, chunks: chunkCount }
  });
});

export default router;