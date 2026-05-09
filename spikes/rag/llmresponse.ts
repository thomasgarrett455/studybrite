import dotenv from "dotenv";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

dotenv.config()

const embed = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

async function main() {
    const question = "Who is bilbo baggins";
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
     const completion = await embed.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {role: "system", content: "You answer questions the user gives you. Only answer the question with the information that you are given, do not fall back to your training. If you cannot answer a question with information provided to you then you should say so."},
            {role: "user", content: question + query.matches.map((m) => m.metadata?.text as string).join("<chunk>")}
         ]
     });

     console.log(completion.choices[0].message.content)
}
 
main()