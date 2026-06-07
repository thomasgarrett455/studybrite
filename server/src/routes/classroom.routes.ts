import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import z from 'zod';
import { prisma } from '../db/prisma.js';
import requireAuth from '../middleware/requireAuth.js';

const router = Router();

// Every route here requires a logged-in user.
router.use(requireAuth);

const CreateClassroomSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(255),
});

// Generate a short, URL-friendly invite code (e.g. "K7QXM2A9").
function generateInviteCode() {
    return randomBytes(6).toString('base64url').slice(0, 8).toUpperCase();
}

// GET /api/classrooms — list the classrooms this user owns (newest first).
router.get('/', async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const classrooms = await prisma.classrooms.findMany({
        where: { owner_id: userId, archived_at: null },
        orderBy: { created_at: 'desc' },
        select: { id: true, name: true, invite_code: true, created_at: true },
    });

    return res.status(200).json({ classrooms });
});

// POST /api/classrooms — create a classroom owned by this user.
router.post('/', async (req: Request, res: Response) => {
    const parsed = CreateClassroomSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid Input' });
    }

    const userId = req.user!.id;
    const { name } = parsed.data;

    // Retry a few times in case of an invite_code collision (very unlikely).
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const classroom = await prisma.classrooms.create({
                data: { owner_id: userId, name, invite_code: generateInviteCode() },
                select: { id: true, name: true, invite_code: true, created_at: true },
            });
            return res.status(201).json({ classroom });
        } catch (err: unknown) {
            // Prisma unique-constraint violation → regenerate code and retry.
            if (err && typeof err === 'object' && (err as { code?: string }).code === 'P2002') {
                continue;
            }
            throw err;
        }
    }

    return res.status(500).json({ message: 'Could not create classroom, please try again' });
});

export default router;
