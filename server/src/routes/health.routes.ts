import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

router.get("/", (req: Request, res: Response) => {
    return res.status(200).json({ status: "ok"})
});

export default router