import type { RetrievedChunk } from "./retrieve.js";
import Anthropic from "@anthropic-ai/sdk";

export const COVERAGE_THRESHOLD = 0.35;

export interface GeneratedQuestion {
  question_text: string,
  options: string[],
  correct_index: 0 | 1 | 2 | 3,
  explanation: string, 
  source: "materials" | "general" | "web"
  
}
export const QUIZ_TOOL: Anthropic.Tool = {
  name: "emit_quiz",
  description: "Return the generated quiz as a structured list of multiple-choice questions.",          
  input_schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question_text: { type: "string" },
            options:       { type: "array", items: { type: "string" } },
            correct_index: { type: "integer", minimum: 0, maximum: 3 },
            explanation: {type: "string"},
            source: {type: "string", enum: ["materials", "general", "web"] }
          },
          required: ["question_text", "options", "correct_index", "explanation", "source"],
        },
      },
    },
    required: ["questions"],
  },
};


export function hasCoverage(chunks: RetrievedChunk[]): boolean {
    const top = chunks[0]?.score ?? 0;
    return top >= COVERAGE_THRESHOLD;
}

export function formatContext(chunks: RetrievedChunk[], syllabus?: string): string {
    const parts: string[] = [];

    if (syllabus?.trim()) {
        parts.push(`[Syllabus]\n${syllabus.trim()}`);
    }

    chunks.forEach((c, i) => {
        parts.push(`[Material excerpt ${i + 1}]\n${c.text}`);
    });

     return parts.length ? parts.join("\n\n") : "(no relevant material found)";
}


export function buildInMaterialSystem(context: string): string {
  return [
    "You are StudyBrite's AI study partner for one specific classroom.",
    "Answer the student's question using ONLY the course materials provided below.",
    "These are the student's own uploaded notes and syllabus for THIS classroom.",
    "",
    "Rules:",
    "- Base your answer solely on the materials below. Do not use outside or general knowledge.",
    "- If the materials do not contain enough information to answer, say plainly that the uploaded materials don't cover it. Do not guess or invent.",
    "- Be concise and clear.",
    "",
    "Course materials:",
    context,
  ].join("\n");
}

export function buildOutsideMaterialSystem(context: string): string {
  return [
    "You are StudyBrite's AI study partner for one specific classroom.",
    "The student's uploaded NOTES for this class did not directly cover this question.",
    "However, the class syllabus (if present) is included below and counts as the student's own class material.",
    "",
    "Answer using, in order of preference:",
    "- the class syllabus below, if it answers the question, OR",
    "- your own general knowledge, if you can answer confidently, OR",
    "- the web_search tool, if the question needs current or factual information you are unsure of.",
    "",
    "Rules:",
    "- If the answer comes from the syllabus, treat it as course material — do NOT call it an outside source.",
    "- If you answer from general knowledge or web search, make clear it is NOT from the student's course materials.",
    "- You may paraphrase and summarize freely, but EVERY statement of fact you draw from a web search MUST carry an inline citation to the specific source it came from. Do not present web-derived information without citing it.",
    "- When in doubt about whether a claim came from a search result, cite it. It is better to over-cite than to leave a web-sourced claim uncited.",
    "- For well-established academic or textbook topics you know well, answer from your own knowledge and do NOT search. Only search for current, breaking, or uncertain factual information.",
    "- Do not fabricate. If you genuinely don't know and a search finds nothing, say so.",
    "",
    "Class materials (syllabus and closest note excerpts):",
    context,
  ].join("\n");
}


export function buildRelevanceSystem(): string {
  return [
    "You are a classifier for StudyBrite. Decide whether a student's question falls within the SUBJECT AREA of a specific class.",
    "You are given the class name and a sample of the class's own materials.",
    "A question is RELEVANT if it concerns the same subject or discipline as the class, even if the exact answer is not in the materials.",
    "A question is NOT RELEVANT if it is clearly about a different subject (for example, a calculus question in a biology class).",
    "Questions about THIS class's logistics (exam dates, deadlines, schedule, grading, syllabus) ARE relevant — answer YES for those.",
    "Reply with exactly one word: YES if relevant, NO if not relevant. If you are unsure, reply YES.",
  ].join("\n");
}

export function buildQuizSystem(context: string, count: number): string {
return [
  "You are an expert quiz generator.",
  `Your only job is to create quizzes with ${count} amount of questions.`,
  "Each question you generate should come from context, if you think that there is insufficient context you may use General Knowledge, and if General Knowledge is also insufficient, only then can you use a web search.",
  "Each question will have 4 answer choices attached and you will need to send the index of the correct answer.",
  "Each question should also come with a 1-2 sentence explanation.",
  "Each question should have a source tag of where you got that question from.",
  "Keep questions answerable and unambiguous, no trick questions.",
  "Materials:", context
].join("\n");
} 
