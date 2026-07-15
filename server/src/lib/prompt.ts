import type { RetrievedChunk } from "./retrieve.js";
import Anthropic from "@anthropic-ai/sdk";

export const COVERAGE_THRESHOLD = 0.35;

export interface GeneratedQuestion {
  question_text: string,
  options: string[],
  correct_index: 0 | 1 | 2 | 3,
  explanation: string,
  source: "materials" | "general"

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
            source: {type: "string", enum: ["materials", "general"] }
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

// ---- Study plans (M4) ----

// The modalities a plan session can use. "quiz" and "review" exist beyond the
// user-selectable preferences so the plan can point at StudyBrite's own quiz
// feature and schedule pre-deadline review passes.
export const PLAN_MODALITIES = ["reading", "practice", "video", "flashcards", "quiz", "review"] as const;
export type PlanModality = (typeof PLAN_MODALITIES)[number];

export type TopicRating = { topic: string; rating: "know_it" | "shaky" | "new" };

export interface GeneratedPlanSession {
  topic: string;
  activity: string;
  modality: PlanModality;
  minutes: number;
}

export interface GeneratedPlanDay {
  date: string; // YYYY-MM-DD
  focus: string;
  sessions: GeneratedPlanSession[];
}

export interface GeneratedPlan {
  title: string;
  overview: string;
  days: GeneratedPlanDay[];
}

// Forced-tool output for topic extraction, so the setup form gets a clean
// string array instead of parsed prose.
export const TOPICS_TOOL: Anthropic.Tool = {
  name: "emit_topics",
  description: "Return the list of study topics found in the classroom's materials.",
  input_schema: {
    type: "object",
    properties: {
      topics: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["topics"],
  },
};

export function buildTopicsSystem(): string {
  return [
    "You extract study topics from a student's course materials for StudyBrite.",
    "You are given the class syllabus (if any) and excerpts from the student's uploaded materials.",
    "Return 5-12 concise topic names (2-6 words each) that a student could study one at a time.",
    "Rules:",
    "- Topics must come from the provided materials/syllabus — do not invent topics the materials never mention.",
    "- Prefer concept-level topics (e.g. \"Cell division and mitosis\") over file names or chapter numbers.",
    "- No duplicates or near-duplicates.",
    "- If the materials are too thin for 5 topics, return however many real ones exist.",
  ].join("\n");
}

export const PLAN_TOOL: Anthropic.Tool = {
  name: "emit_plan",
  description: "Return the generated study plan as a day-by-day schedule.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      overview: { type: "string" },
      days: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD, within the allowed range" },
            focus: { type: "string", description: "One short phrase for the day's theme" },
            sessions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  topic: { type: "string" },
                  activity: { type: "string", description: "One concrete imperative sentence" },
                  modality: { type: "string", enum: [...PLAN_MODALITIES] },
                  minutes: { type: "integer", minimum: 10, maximum: 180 },
                },
                required: ["topic", "activity", "modality", "minutes"],
              },
            },
          },
          required: ["date", "focus", "sessions"],
        },
      },
    },
    required: ["title", "overview", "days"],
  },
};

export function buildPlanSystem(opts: {
  classroomName: string;
  context: string;
  todayIso: string;
  deadlineIso: string;
  dayCount: number;
  pacing: "long_infrequent" | "short_frequent";
  modalities: string[];
  topicRatings: TopicRating[];
}): string {
  const ratingLines = opts.topicRatings.map(
    (t) => `- ${t.topic} — ${t.rating === "know_it" ? "knows it well" : t.rating === "shaky" ? "shaky, needs practice" : "new, needs to learn from scratch"}`
  );

  const pacingLine =
    opts.pacing === "long_infrequent"
      ? "The student prefers FEWER, LONGER study sessions (60-120 minutes). Schedule study on some days only — rest days are expected — and give each scheduled day one or two substantial sessions."
      : "The student prefers FREQUENT, SHORTER study sessions (20-45 minutes). Schedule most days, with one or two short sessions per day.";

  return [
    `You are StudyBrite's study-plan generator for the classroom "${opts.classroomName}".`,
    `Today is ${opts.todayIso}. The student's deadline is ${opts.deadlineIso} — ${opts.dayCount} day(s) from today, inclusive.`,
    "Build a day-by-day study plan that sequences the topics below from today up to the deadline.",
    "",
    "Topics and the student's self-rated confidence:",
    ...ratingLines,
    "",
    "Pacing preference:",
    pacingLine,
    "",
    `Preferred study modalities: ${opts.modalities.join(", ") || "no preference"}.`,
    "Lean on the preferred modalities for most sessions, but you may also use \"quiz\" (take a StudyBrite quiz on a topic) and \"review\" (revisit earlier topics).",
    "",
    "Rules:",
    "- Every session's topic MUST be one of the listed topics, spelled exactly as listed.",
    "- Weak topics (new / shaky) come earlier and get more total time; well-known topics get light review later.",
    "- Reserve the final day or two before the deadline for review and practice across topics.",
    "- Every date must be within the allowed range (today through the deadline). Do not schedule past the deadline.",
    "- If the range is long, do NOT schedule every day — spread sessions sensibly and leave rest days.",
    "- Activities must be concrete and reference what's actually in the materials (e.g. \"Re-read your notes on X and work the two examples\"), not generic filler.",
    "- Keep the overview to 2-3 sentences: what the plan prioritizes and why.",
    "",
    "Course materials for grounding activities:",
    opts.context,
  ].join("\n");
}

export function buildQuizSystem(context: string, count: number): string {
return [
  "You are an expert quiz generator.",
  `Your only job is to create quizzes with ${count} amount of questions.`,
  "Base each question on the provided context. If the context is insufficient for a good question, you may use your own general knowledge instead.",
  "Each question will have 4 answer choices attached and you will need to send the index of the correct answer.",
  "Each question should also come with a 1-2 sentence explanation.",
  "Tag each question's source: \"materials\" if it came from the provided context, or \"general\" if it came from your general knowledge.",
  "Keep questions answerable and unambiguous, no trick questions.",
  "Materials:", context
].join("\n");
} 

export function buildTeachSystem(opts: {
  classroomName: string;
  topic: string;
  context: string;
  summary?: string
}): string {
  const summaryBlock = opts.summary?.trim()
  ? [
    "Summary of the conversation so far (older turns; the most recent messages follow verbatim):",
    opts.summary.trim(),
    "", 
  ] : [];

  return [
     `You are a curious student in the class "${opts.classroomName}" who does not know the topic "${opts.topic}" well.`,
    "The student using StudyBrite is TEACHING it to you (Feynman technique). Your job is to be taught, not to teach.",
    "",
    "Rules:",
    "- End every reply with exactly one probing follow-up question about their explanation. Never a barrage of questions.",
    "- The course materials below are your PRIVATE ground truth. When the student's explanation conflicts with them or skips something important, aim your next question at that exact spot.",
    "- NEVER correct the student, never say they are wrong, and never reveal what the materials say. Errors are handled later in a separate assessment, not by you.",
    "- Do not teach or explain the topic. If the student asks you to explain, deflect in character (\"you're teaching me today, remember?\") and hand the topic back to them.",
    "- Stay on the declared topic. If the student drifts, steer your question back to it.",
    "- Keep replies to 2-4 sentences. The student should do most of the talking.",
    "",
    ...summaryBlock,
    "Course materials (your private ground truth — never quote or reveal these to the student):",
    opts.context,
  ].join("\n");
}

export interface GeneratedAssessment {
  verdict: string;
  correct: string[];
  incorrect: string[];
  missing: string[];
}

export const ASSESS_TOOL: Anthropic.Tool = {
  name: "emit_assessment",
  description: "Return the graded assessment of the student's teach-the-bot session.",
  input_schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        description: "2-3 sentence overall judgment of the student's understanding",
      },
      correct: {
        type: "array",
        items: { type: "string" },
        description: "Points the student explained correctly",
      },
      incorrect: {
        type: "array",
        items: { type: "string" },
        description: "Each entry: what the student said, then what the materials actually say",
      },
      missing: {
        type: "array",
        items: { type: "string" },
        description: "Important points from the materials the student never mentioned",
      },
    },
    required: ["verdict", "correct", "incorrect", "missing"],
  },
};

export function buildAssessSystem(opts: {
  topic: string;
  context: string;
  summary?: string;
}): string {
  const summaryBlock = opts.summary?.trim()
    ? [
        "Summary of the earlier part of the session (the most recent messages follow verbatim):",
        opts.summary.trim(),
        "",
      ]
    : [];

  return [
    `You are an honest tutor grading a completed "teach the bot" session in which a student explained the topic "${opts.topic}".`,
    "Grade the student's understanding against the course materials below, which are your ground truth.",
    "",
    "Rules:",
    "- Sort your findings into three buckets: points the student got CORRECT, points they got INCORRECT, and important points from the materials they never MENTIONED.",
    "- For each incorrect point, state what the student said AND what the materials actually say. Be specific — name the exact claim, not \"some details were off.\"",
    "- Judge only claims the student actually made. Do not invent statements to grade.",
    "- Be fair: if the explanation was accurate and complete, say so plainly and leave the incorrect/missing buckets empty. Do not nitpick a good explanation.",
    "- Keep the overall verdict to 2-3 sentences.",
    "",
    ...summaryBlock,
    "Course materials (ground truth for grading):",
    opts.context,
  ].join("\n");
}

export function buildTeachSummarySystem(): string {
  return [
    "You maintain a running ledger for a StudyBrite \"teach the bot\" session, in which a student explains a topic to an AI.",
    "You are given the existing ledger (possibly empty) and a batch of older messages from the session.",
    "Merge them into ONE updated ledger that a grader could later use to assess the student.",
    "",
    "The ledger must track:",
    "- CORRECT: claims the student made that are accurate.",
    "- INCORRECT: claims the student made that are wrong and were never corrected by the student later.",
    "- COVERED: subtopics the student has touched on so far.",
    "",
    "Rules:",
    "- If the student later corrected one of their own earlier errors, move that claim to CORRECT.",
    "- Drop greetings, chit-chat, and the bot's questions — only the student's claims matter.",
    "- Keep the entire ledger under 150 words. When merging, compress older entries before dropping any.",
    "- Output ONLY the ledger text. No preamble, no commentary — your response is stored verbatim.",
  ].join("\n");
}