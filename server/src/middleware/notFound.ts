import type { Request, Response } from 'express';

function notFoundHandler(req: Request, res: Response) {
    return res.status(404).json({ error: "Not Found" })
}

export default notFoundHandler;