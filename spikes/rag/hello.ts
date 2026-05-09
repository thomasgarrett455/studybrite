import dotenv from "dotenv";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

dotenv.config()

const client = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
const database = new Pinecone({apiKey: process.env.PINECONE_API_KEY!});

async function main() {
    const embedding = await client.embeddings.create({model: "text-embedding-3-small", input: "hello"});

    const pinecone = await database.listIndexes();

    console.log(embedding.data[0].embedding.length, pinecone)
}
 
main()