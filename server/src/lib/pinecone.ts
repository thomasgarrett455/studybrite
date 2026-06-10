import { Pinecone } from "@pinecone-database/pinecone";
import { config } from "../config.js";
import { EMBEDDING_DIM } from "./openai.js";

export const pinecone = new Pinecone({ apiKey: config.PINECONE_API_KEY })

let indexReady: Promise<void> | null = null;

export function ensureIndex(): Promise<void> {
  if (!indexReady) {
    indexReady = (async () => {
      const existing = await pinecone.listIndexes();
      const found = existing.indexes?.some((i) => i.name === config.PINECONE_INDEX);
      if (!found) {
        await pinecone.createIndex({
          name: config.PINECONE_INDEX,
          dimension: EMBEDDING_DIM,
          metric: "cosine",
          spec: { serverless: { cloud: "aws", region: "us-east-1" } },
          waitUntilReady: true,
        });
      }
    })().catch((err) => {
      indexReady = null; // don't permanently cache a transient failure
      throw err;
    });
  }
  return indexReady;
}

export function index() {
  return pinecone.Index(config.PINECONE_INDEX);
}