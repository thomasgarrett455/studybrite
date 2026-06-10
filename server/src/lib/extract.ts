import { openai, VISION_MODEL } from "./openai.js";

export type ExtractInput = {
  buffer: Buffer;
  mimetype: string;
  filename: string;
}

const OCR_PROMPT =   `Convert this image into clean markdown. 
The image may be a photo of handwritten notes and may be rotated — 
orient it correctly first. Transcribe every problem, table, equation, and 
label faithfully. Do not invent or merge content. If there are diagrams 
or graphs, represent them using mermaid.`;
async function extractImage(input: ExtractInput): Promise<string> {
  const b64 = input.buffer.toString("base64");
  const res = await openai.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: OCR_PROMPT },
          {
            type: "image_url",
            image_url: { url: `data:${input.mimetype};base64,${b64}`, detail: "high" },
          },
        ],
      },
    ],
  });
  return res.choices[0]?.message.content ?? "";
}

async function extractPdf(input: ExtractInput): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: input.buffer });
  const result = await parser.getText();
  return result.text;
}

export async function extractText(input: ExtractInput): Promise<string> {
  const { mimetype, filename } = input
  if (mimetype.startsWith("image/")) return extractImage(input)
  if (mimetype === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
    return extractPdf(input)
  }

  return input.buffer.toString("utf-8"); 
}