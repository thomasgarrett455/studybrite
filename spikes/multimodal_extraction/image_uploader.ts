import OpenAI, { APIError } from "openai";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config()

const imagesFolder = "./images";
const images = fs.readdirSync(imagesFolder);

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const sections: string[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function transcribeImage(img: string): Promise<string> {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await client.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "Convert this image into clean markdown. The image may be a photo of handwritten notes and may be rotated — orient it correctly first. Transcribe every problem, table, equation, and label faithfully. Do not invent or merge content. If there are diagrams or graphs, represent them using mermaid."
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/jpeg;base64,${fs.readFileSync(path.join(imagesFolder, img)).toString("base64")}`,
                                    detail: "high"
                                }
                            }
                        ]
                    }
                ]
            });
            return response.choices[0].message.content ?? "";
        } catch (err) {
            const isRateLimit = err instanceof APIError && (err.status === 403 || err.status === 429);
            if (isRateLimit && attempt < maxRetries) {
                console.log(`  Rate limited on ${img}, waiting 60s (attempt ${attempt}/${maxRetries})...`);
                await sleep(60000);
                continue;
            }
            throw err;
        }
    }
    throw new Error(`Failed to process ${img} after ${maxRetries} attempts`);
}

for (let i = 0; i < images.length; i++) {
    const img = images[i];
    console.log(`Processing ${img}...`);

    const content = await transcribeImage(img);
    sections.push(`## ${img}\n\n${content}`);

    fs.writeFileSync("./responses/output.md", sections.join("\n\n---\n\n"));

    if (i < images.length - 1) {
        await sleep(8000);
    }
}

console.log("Done. Wrote ./responses/output.md");