import fs from "fs/promises";
import dotenv from "dotenv";
import OpenAI from "openai";


dotenv.config()

const embed = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

const CHUNK_SIZE = 2000;
const OVERLAP_SIZE = 300;

const text = await fs.readFile("./docs/bookofmormon.txt", "utf-8")

const chunks: Array<string> = [];



async function main() {
    
    let position = 0;
    while (position < text.length) {
    const end = position + CHUNK_SIZE;
    const chunk = text.slice(position, end)
    chunks.push(chunk)
    position = position + (CHUNK_SIZE - OVERLAP_SIZE)
}
    const embedding = await embed.embeddings.create({model: "text-embedding-3-small", input: chunks[0]});

    console.log("Chunk text:", chunks[0].slice(0, 500));
    console.log("Vector length:", embedding.data[0].embedding.length);
    console.log("First 10 values:", embedding.data[0].embedding.slice(0, 10));
    console.log("Last 5 values:", embedding.data[0].embedding.slice(-5));
}
 
main()

