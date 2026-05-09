import dotenv from "dotenv";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

dotenv.config()

const embed = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

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
query.matches.forEach(m => console.log(m.score, (m.metadata?.text as string).slice(0, 500)))

}
 
main()