import { openai, EMBEDDING_MODEL } from "./openai.js";
import { ensureIndex, index } from "./pinecone.js";

export type RetrievedChunk = { 
    text: string;
    score: number;
    noteId: number;
};

export async function retrievedChunks(opts: {
    question: string;
    classroomId: number;
    topK?: number;
}): Promise<RetrievedChunk[]> {
    const topK = opts.topK ?? 5;

    const emb = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: opts.question
    });

    const queryVector = emb.data[0]?.embedding;
    if (!queryVector) return [];

    await ensureIndex();
    const idx = index();
    const res = await idx.query({
        vector: queryVector,
        topK,
        includeMetadata: true,
        filter: { classroom_id: opts.classroomId }
    });

    return (res.matches ?? []).map((m) => ({
        text: String(m.metadata?.text ?? ""),
        score: m.score ?? 0,
        noteId: Number(m.metadata?.note_id ?? 0),
    }));

}