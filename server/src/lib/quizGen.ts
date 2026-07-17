import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../db/prisma.js";
import { anthropic, CHAT_MODEL } from "./anthropic.js";
import { retrievedChunks } from "./retrieve.js";
import { formatContext, buildQuizSystem, QUIZ_TOOL, type GeneratedQuestion } from "./prompt.js";

// Generate a quiz from a classroom's materials and persist it. Returns null when
// the model produced no valid questions. Callers own auth and input validation.
export async function generateQuizForClassroom(opts: {
    userId: number;
    classroomId: number;
    topic: string;
    count: number;
    syllabusText?: string | undefined;
}) {
    const { userId, classroomId, topic, count } = opts;

    const chunks = await retrievedChunks({ question: topic, classroomId });
    const context = formatContext(chunks, opts.syllabusText);

    // Size the output budget to the quiz length so a large quiz's tool JSON isn't
    // truncated mid-array (which drops questions or fails parsing).
    const maxTokens = Math.min(8192, 1024 + count * 350);

    const ai = await anthropic.messages.create({
        model: CHAT_MODEL,
        max_tokens: maxTokens,
        system: buildQuizSystem(context, count),
        tools: [QUIZ_TOOL],
        tool_choice: { type: "tool", name: "emit_quiz" },
        messages: [
            { role: "user", content: `Topic: ${topic}\nGenerate ${count} multiple-choice questions.` },
        ],
    });

    const block = ai.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "emit_quiz"
    );
    if (!block) return null;

    const { questions } = block.input as { questions: GeneratedQuestion[] };

    // a cast checks nothing at runtime — verify the shape ourselves
    const valid = (Array.isArray(questions) ? questions : []).filter(
        (q) =>
            q &&
            typeof q.question_text === "string" &&
            Array.isArray(q.options) &&
            q.options.length === 4 &&
            Number.isInteger(q.correct_index) &&
            q.correct_index >= 0 &&
            q.correct_index <= 3 &&
            typeof q.explanation === "string" &&
            (q.source === "materials" || q.source === "general")
    );

    if (valid.length === 0) return null;

    // One transaction: either the header, its v1, the current-version pointer, and
    // all questions all commit, or none do — never a listable quiz with 0 questions.
    const created = await prisma.$transaction(async (tx) => {
        const header = await tx.quiz_headers.create({
            data: { creator_id: userId, classroom_id: classroomId },
        });

        const version = await tx.quiz_versions.create({
            data: { header_id: header.id, version_number: 1, title: `Quiz: ${topic}`, topic },
        });

        await tx.quiz_headers.update({
            where: { id: header.id },
            data: { current_version_id: version.id },
        });

        await tx.quiz_questions.createMany({
            data: valid.map((q, i) => ({
                version_id: version.id,
                question_text: q.question_text,
                answer_data: {
                    options: q.options,
                    correct_index: q.correct_index,
                    explanation: q.explanation,
                    source: q.source,
                },
                display_order: i,
            })),
        });

        return { headerId: header.id, versionId: version.id, title: version.title };
    });

    return {
        quizId: created.headerId,
        versionId: created.versionId,
        title: created.title,
        questionCount: valid.length,
    };
}
