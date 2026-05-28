import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from 'express';
import { config } from "../config.js";

export default function requireAuth(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.header('authorization');

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: 'Unauthorized' });

    }

    const token = authHeader.split(' ')[1];

    if (!token){
        return res.status(401).json({ message: 'Unauthorized' });

    }

    try {
        const decoded = jwt.verify(token, config.JWT_SECRET) as unknown as { id: number; email: string; role: 'student' | 'teacher' | 'admin' }

        req.user = { id: decoded.id, email: decoded.email, role: decoded.role }
        next();
    } catch {
        return res.status(401).json({ message: 'Unauthorized' });
    }


}