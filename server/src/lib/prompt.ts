import type { RetrievedChunk } from "./retrieve.js";

export const COVERAGE_THRESHOLD = 0.35;

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
    "The student's own course materials do NOT contain an answer to this question.",
    "",
    "Answer using EITHER:",
    "- your own general knowledge, if you can answer confidently, OR",
    "- the web_search tool, if the question needs current or factual information you are unsure of.",
    "",
    "Rules:",
    "- Be clear that this answer is NOT from the student's course materials.",
    "- If you use web search, cite the sources you used.",
    "- For well-established academic or textbook topics you know well, answer from your own knowledge and do NOT search. Only search for current, breaking, or uncertain factual information.",
    "- Do not fabricate. If you genuinely don't know and a search finds nothing, say so.",
    "",
    "Closest (non-matching) excerpts from the student's materials, for context:",
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
