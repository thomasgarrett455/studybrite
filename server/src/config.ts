// config.ts
import "dotenv/config";
const {
  JWT_SECRET, PORT, DB_HOST, DB_USER, DB, DB_PASSWORD,
  OPENAI_API_KEY, PINECONE_API_KEY, PINECONE_INDEX, ANTHROPIC_API_KEY,
} = process.env
if (!JWT_SECRET) throw new Error("JWT_SECRET is required")
if (!DB_HOST) throw new Error("DB_HOST is required");
if (!DB_USER) throw new Error("DB_USER is required");
if (!DB) throw new Error("DB is required");
if (!PORT) throw new Error("PORT is required");
if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");
if (!PINECONE_API_KEY) throw new Error("PINECONE_API_KEY is required");
if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required");
if (!DB_PASSWORD) throw new Error("DB_PASSWORD is required");

export const config = {
  JWT_SECRET, PORT, DB_HOST, DB_USER, DB, DB_PASSWORD,
  OPENAI_API_KEY,
  ANTHROPIC_API_KEY,
  PINECONE_API_KEY,
  PINECONE_INDEX: PINECONE_INDEX ?? "studybrite",
}
