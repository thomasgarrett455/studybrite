import type { Request, Response, NextFunction } from "express";

function errorHandler(err: Error & { status?: number }, req: Request, res: Response, _next: NextFunction) {
    return res.status(err.status || 500).json({ error: err.message || "Internal Server Error" })
}

export default errorHandler;