import { openai, EMBEDDING_MODEL } from "./openai.js";
import { ensureIndex, index } from "./pinecone.js";

const CHUNK_SIZE = 2000;
const OVERLAP = 300;

export function chunkText(text: string): string[] {
  const chunks: string[] = []
  let pos = 0;
  while (pos < text.length) {
    chunks.push(text.slice(pos, pos + CHUNK_SIZE));
    pos += CHUNK_SIZE - OVERLAP
  }
  return chunks;
}

function batch<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export async function ingestText(opts: {
  text: string;
  classroomId: number;
  noteId: number;
}): Promise<number> {
  const chunks = chunkText(opts.text).filter((c) => c.trim().length > 0);
  if (chunks.length === 0) return 0;

  await ensureIndex();
  const idx = index();

  let counter = 0;
  for (const group of batch(chunks, 100)) {
    const emb = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: group});
    const vectors = emb.data.map((e, i) => ({
      id: `note-${opts.noteId}-chunk-${counter + i}`,
      values: e.embedding,
      metadata: {
        classroom_id: opts.classroomId,
        note_id: opts.noteId,
        text: group[i] ?? "",
      },
    }));
    await idx.upsert({ records: vectors });
    counter += group.length;
  }
  return chunks.length
}