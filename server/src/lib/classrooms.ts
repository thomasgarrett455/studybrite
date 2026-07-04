import { prisma } from "../db/prisma.js";

// Ownership gate shared by every classroom-scoped route: returns the classroom
// (id, name, syllabus) only if this user owns it and it isn't archived, else null.
// Keeping it in one place means an access-control change lands everywhere at once.
export function ownClassroom(userId: number, classroomId: number) {
    return prisma.classrooms.findFirst({
        where: { id: classroomId, owner_id: userId, archived_at: null },
        select: { id: true, name: true, syllabus_text: true },
    });
}
