import fs from "fs/promises";
import dotenv from "dotenv";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

dotenv.config()

const embed = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

const CHUNK_SIZE = 2000;
const OVERLAP_SIZE = 300;

// const text = await fs.readFile("./docs/bookofmormon.txt", "utf-8")


// function batch<T>(arr: T[], size: number): T[][] {
//   const batches: T[][] = [];
//   for (let i = 0; i < arr.length; i += size) {
//     batches.push(arr.slice(i, i + size));
//   }
//   return batches;
// }

// async function main() {
    
//     const chunks: Array<string> = [];
//     let position = 0;
//     while (position < text.length) {
//     const end = position + CHUNK_SIZE;
//     const chunk = text.slice(position, end)
//     chunks.push(chunk)
//     position = position + (CHUNK_SIZE - OVERLAP_SIZE)
// }
// try{
//     await pinecone.createIndex({
//         name: "book-of-mormon",
//         dimension: 1536,
//         metric: "cosine",
//         spec: { serverless: { cloud: "aws", region: "us-east-1" }}
//     });
//     console.log("Index created");
// } catch (e: unknown) {
//   const error = e as Error;
//   if (error.message.includes("already exists")) {
//     console.log("Index already exists");
//   } else {
//     throw e;
//   }
// }
//     let counter = 0;
//     for (const chunk_batch of batch(chunks, 100)){
//         const embedding = await embed.embeddings.create({
//             model: "text-embedding-3-small", 
//             input: chunk_batch});
        
//         const vectors = embedding.data.map((e, idx) => ({
//             id: `chunk-${counter + idx}`,
//             values: e.embedding,
//             metadata: { text: chunk_batch[idx]}
//         }),
        
//     );
    
//     const index = pinecone.Index("book-of-mormon");
//     // eslint-disable-next-line @typescript-eslint/no-explicit-any
//     await index.upsert({ records: vectors } as any);

//     counter += 100;
//     }

async function main() {
    const question = "Who is Noah in the book of mormon?";
    const response = await embed.embeddings.create({
      model: "text-embedding-3-small",
      input: question
    })

    const index = pinecone.Index("book-of-mormon");

    const query = await index.query({ 
      vector: response.data[0].embedding,
      topK: 5,
      includeMetadata: true
     })
//  console.log(query)
query.matches.forEach(m => console.log(m.score, (m.metadata?.text as string).slice(0, 200)))

}
 
main()