import { prisma } from "../db/prisma.js";
import { extractText } from "./extract.js";
import { ingestText } from "./ingest.js";

// Extract text from an uploaded file, save it as a note, and embed it into the
// vector store. Returns null when no text could be extracted. Callers own auth.
export async function ingestMaterial(opts: {
    userId: number;
    classroomId: number;
    buffer: Buffer;
    mimetype: string;
    filename: string;
}) {
    const { userId, classroomId, filename } = opts;

    const text = await extractText({
        buffer: opts.buffer,
        mimetype: opts.mimetype,
        filename,
    });
    if (!text.trim()) return null;

    const header = await prisma.note_headers.create({
        data: { user_id: userId, classroom_id: classroomId },
    });

    const version = await prisma.note_versions.create({
        data: { header_id: header.id, version_number: 1, title: filename, content: text },
    });

    await prisma.note_headers.update({
        where: { id: header.id },
        data: { current_version_id: version.id },
    });

    const chunkCount = await ingestText({ text, classroomId, noteId: header.id });

    return { id: header.id, title: filename, chunks: chunkCount };
}

// Extract text from an uploaded file and set it as the classroom's syllabus
// (the always-included context). Returns null when no text could be extracted.
export async function setSyllabus(opts: {
    classroomId: number;
    buffer: Buffer;
    mimetype: string;
    filename: string;
}) {
    const text = await extractText({
        buffer: opts.buffer,
        mimetype: opts.mimetype,
        filename: opts.filename,
    });
    if (!text.trim()) return null;

    await prisma.classrooms.update({
        where: { id: opts.classroomId },
        data: { syllabus_text: text, syllabus_filename: opts.filename },
    });

    return { filename: opts.filename, length: text.length };
}
