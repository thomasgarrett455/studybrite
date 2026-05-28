// config.ts
const { JWT_SECRET, PORT, DB_HOST, DB_USER, DB } = process.env
if (!JWT_SECRET) throw new Error("JWT_SECRET is required")
if (!DB_HOST) throw new Error("DB_HOST is required");
if (!DB_USER) throw new Error("DB_USER is required");
if (!DB) throw new Error("DB is required");
if (!PORT) throw new Error("PORT is required");
export const config = { JWT_SECRET, PORT, DB_HOST, DB_USER, DB }
