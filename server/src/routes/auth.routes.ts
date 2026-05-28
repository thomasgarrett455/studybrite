import { Router } from 'express';
import type { Request, Response } from 'express';
import z from 'zod';
import { prisma } from '../db/prisma.js';
import bcrypt from "bcrypt";
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8iF1Yy7sYjZg1fVh0e7a8Qq9j5yG2a"

function signToken(user: { id: number; email: string; role: 'student' | 'teacher' | 'admin' }) {
    return jwt.sign({ id: user.id, email: user.email, role: user.role }, config.JWT_SECRET, { expiresIn: '7d' })
}


const SignupSchema = z.object({
    name: z.string(),
    email: z.email(),
    password: z.string().min(8)
})

const LoginSchema = z.object({
    email: z.email(),
    password: z.string().min(8)
})

const router = Router();

router.post("/signup", async(req: Request, res: Response) => {
    const body = req.body;
    const parsed = SignupSchema.safeParse(body);
    
    if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid Input' })
    }

    const { name, email, password } = parsed.data

    const exists = await prisma.users.findUnique({ where: { email } })

    if (exists) {
        return res.status(409).json({ message: "Email already in use" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const user = await prisma.users.create({
        data: {
            name, 
            email, 
            password_hash
        },
        select: {
            id: true, name: true, email: true, role: true
        }
    });

    const token = signToken(user);

    return res.status(201).json({ token, user})
});

router.post("/login", async(req: Request, res: Response) => {
    const body = req.body;
    const parsed = LoginSchema.safeParse(body)

    if (!parsed.success) {
        return res.status(401).json({ message: "Unauthorized" })
    }

    const { email, password } = parsed.data;

    const user = await prisma.users.findUnique({ 
        where: { email }, 
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            password_hash: true
        }
    });

    if (!user) {
        await bcrypt.compare(password, DUMMY_HASH)
        return res.status(401).json({ message: "Unauthorized" })
        }

    const password_check = await bcrypt.compare(password, user.password_hash)

    if (!password_check) {
        return res.status(401).json({ message: "Unauthorized" })
    }

    const token = signToken(user)

    const { password_hash, ...safeUser} = user
    return res.status(200).json({ token, user: safeUser })

});

export default router