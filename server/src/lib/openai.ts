// Single shared OpenAI client. Models match the project spec:
//   - text-embedding-3-small (1536-dim) for ingestion + query embedding
//   - gpt-4o            (multimodal) for OCR / image extraction
//   - gpt-4o-mini       for text generation (chat, quizzes, plans)
import OpenAI from "openai";
import { config } from "../config.js";

export const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIM = 1536;
export const VISION_MODEL = "gpt-4o";
export const CHAT_MODEL = "gpt-4o-mini";
