import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";

function validate(schema: ZodType) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const err = new Error(
                result.error.issues.map((i) => i.message).join(", ")
            ) as Error & { status?: number };
            err.status = 400;
            return next(err)
        }

        req.body = result.data;
        return next();
    };
}

export default validate;