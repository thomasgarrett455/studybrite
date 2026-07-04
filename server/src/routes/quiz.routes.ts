import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../db/prisma.js";
import requireAuth from "../middleware/requireAuth.js";
import { anthropic, CHAT_MODEL } from "../lib/anthropic.js";
import { retrievedChunks } from "../lib/retrieve.js";
import { formatContext, buildQuizSystem, QUIZ_TOOL, type GeneratedQuestion } from "../lib/prompt.js";
import { ownClassroom } from "../lib/classrooms.js";

const router = Router();
router.use(requireAuth);

// Thrown inside the submit transaction when another request already claimed the
// attempt, so we can roll back and answer 409 without a second set of responses.
class AttemptAlreadySubmitted extends Error {}

// The stored shape of quiz_questions.answer_data (Prisma Json). One place so the
// take/submit/review casts don't each invent their own partial shape.
type AnswerData = {
    options: string[];
    correct_index: number;
    explanation: string;
    source: "materials" | "general";
};

// URLs reference the quiz HEADER id; every take/submit/review endpoint needs its
// current version. Resolve it (and the title) once here, returning null when the
// quiz doesn't exist in this classroom so the caller can 404.
async function resolveCurrentVersion(quizId: number, classroomId: number) {
    const header = await prisma.quiz_headers.findFirst({
        where: { id: quizId, classroom_id: classroomId, archived_at: null },
        select: { current_version_id: true, currentVersion: { select: { title: true } } },
    });
    if (!header || !header.current_version_id) return null;
    return { versionId: header.current_version_id, title: header.currentVersion?.title ?? null };
}

router.post("/:id/quizzes", async (req, res) => {
    const userId = req.user!.id;
    const classroomId = Number(req.params.id);
    if (!Number.isInteger(classroomId)) {
        return res.status(400).json({ message: "Bad classroom id" });
    }
    
    const topic = String(req.body?.topic ?? "").trim();
    if (!topic) {
        return res.status(400).json({ message: "Topic is required" });
    }
    
    
    let count = Number(req.body?.count) || 5;
    count = Math.max(1, Math.min(20, Math.floor(count)));
    
    const classroom = await ownClassroom(userId, classroomId);
    if (!classroom) {
        return res.status(404).json({ message: "Classroom not found" });
    }
    
    
    const chunks = await retrievedChunks({ question: topic, classroomId });
    const context = formatContext(chunks, classroom.syllabus_text ?? undefined);

    // Size the output budget to the quiz length so a large quiz's tool JSON isn't
    // truncated mid-array (which drops questions or fails parsing). Sonnet 4.6
    // allows far more; this keeps the request non-streaming and well under limits.
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
    if (!block) {
        return res.status(502).json({ message: "Quiz generation failed" });
    }
    
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
    
        if (valid.length === 0) {
        return res.status(502).json({ message: "Quiz generation returned no valid questions" });
    }

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

    return res.json({
        quizId: created.headerId,
        versionId: created.versionId,
        title: created.title,
        questionCount: valid.length,
    });
});  // <-- this closes the router.post handler

// List the classroom's quizzes (newest first) for the quiz panel in the UI.
router.get("/:id/quizzes", async (req, res) => {
    const userId = req.user!.id;
    const classroomId = Number(req.params.id);
    if (!Number.isInteger(classroomId)) {
        return res.status(400).json({ message: "Bad classroom id" });
    }
    if (!(await ownClassroom(userId, classroomId))) {
        return res.status(404).json({ message: "Classroom not found" });
    }

    const headers = await prisma.quiz_headers.findMany({
        where: { classroom_id: classroomId, archived_at: null },
        orderBy: { created_at: "desc" },
        select: {
            id: true,
            created_at: true,
            currentVersion: {
                select: { title: true, topic: true, _count: { select: { quiz_questions: true } } },
            },
        },
    });

    const quizzes = headers.map((h) => ({
        id: h.id,
        title: h.currentVersion?.title ?? "Untitled quiz",
        topic: h.currentVersion?.topic ?? null,
        created_at: h.created_at,
        questionCount: h.currentVersion?._count.quiz_questions ?? 0,
    }));

    return res.json({ quizzes });
});

// Start an attempt: open a quiz_attempts row and return the questions WITHOUT
// the answer key (no correct_index/explanation), so the client can't peek.
router.post("/:id/quizzes/:quizId/attempts", async (req, res) => {
    const userId = req.user!.id;
    const classroomId = Number(req.params.id);
    const quizId = Number(req.params.quizId);
    if (!Number.isInteger(classroomId) || !Number.isInteger(quizId)) {
        return res.status(400).json({ message: "Bad id" });
    }

    if (!(await ownClassroom(userId, classroomId))) {
        return res.status(404).json({ message: "Classroom not found" });
    }

    const quiz = await resolveCurrentVersion(quizId, classroomId);
    if (!quiz) {
        return res.status(404).json({ message: "Quiz not found" });
    }
    const versionId = quiz.versionId;

    const questions = await prisma.quiz_questions.findMany({
        where: { version_id: versionId },
        orderBy: { display_order: "asc" },
        select: { id: true, question_text: true, answer_data: true },
    });

    // Strip the answer key: send options only, never correct_index/explanation.
    const safe = questions.map((q) => ({
        id: q.id,
        question_text: q.question_text,
        options: (q.answer_data as AnswerData).options,
    }));

    const attempt = await prisma.quiz_attempts.create({
        data: { user_id: userId, version_id: versionId },
    });

    return res.json({
        attemptId: attempt.id,
        title: quiz.title,
        questions: safe,
    });
});

// Submit an attempt: grade each answer against the stored answer key, persist
// the responses, store the score, and return the score summary. The full review
// (correct answers + explanations) is a separate endpoint so it can be revisited.
router.post("/:id/quizzes/:quizId/attempts/:attemptId/submit", async (req, res) => {
    const userId = req.user!.id;
    const classroomId = Number(req.params.id);
    const quizId = Number(req.params.quizId);
    const attemptId = Number(req.params.attemptId);
    if (![classroomId, quizId, attemptId].every(Number.isInteger)) {
        return res.status(400).json({ message: "Bad id" });
    }

    if (!(await ownClassroom(userId, classroomId))) {
        return res.status(404).json({ message: "Classroom not found" });
    }

    const quiz = await resolveCurrentVersion(quizId, classroomId);
    if (!quiz) {
        return res.status(404).json({ message: "Quiz not found" });
    }
    const versionId = quiz.versionId;

    // The attempt must belong to this user and to this quiz's version.
    const attempt = await prisma.quiz_attempts.findFirst({
        where: { id: attemptId, user_id: userId, version_id: versionId },
        select: { id: true, submitted_at: true },
    });
    if (!attempt) {
        return res.status(404).json({ message: "Attempt not found" });
    }
    if (attempt.submitted_at) {
        return res.status(409).json({ message: "Attempt already submitted" });
    }

    // The client sends [{ questionId, selectedIndex }]; build a quick lookup.
    const rawAnswers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const picked = new Map<number, number>();
    for (const a of rawAnswers) {
        const qid = Number(a?.questionId);
        const sel = Number(a?.selectedIndex);
        if (Number.isInteger(qid) && Number.isInteger(sel)) picked.set(qid, sel);
    }

    // Load the full answer key (correct_index) for this version's questions.
    const questions = await prisma.quiz_questions.findMany({
        where: { version_id: versionId },
        select: { id: true, answer_data: true },
    });

    // Grade: a question is correct only if the picked index matches the key.
    // Unanswered questions stay incorrect with a null selection.
    let scoreCorrect = 0;
    const responses = questions.map((q) => {
        const correctIndex = (q.answer_data as AnswerData).correct_index;
        const selected = picked.has(q.id) ? picked.get(q.id)! : null;
        const isCorrect = selected === correctIndex;
        if (isCorrect) scoreCorrect++;
        return {
            attempt_id: attemptId,
            question_id: q.id,
            response_data: { selectedIndex: selected },
            is_correct: isCorrect,
        };
    });
    const scoreTotal = questions.length;

    // Claim-then-write atomically. The updateMany only matches while submitted_at
    // is still null, so exactly one of two racing submits flips it and reaches
    // createMany — the other matches 0 rows and 409s, never inserting a second set
    // of responses. Wrapped in a transaction so a failed response-write rolls the
    // claim back (never a submitted attempt with no responses).
    try {
        await prisma.$transaction(async (tx) => {
            const claimed = await tx.quiz_attempts.updateMany({
                where: { id: attemptId, version_id: versionId, submitted_at: null },
                data: { submitted_at: new Date(), score_correct: scoreCorrect, score_total: scoreTotal },
            });
            if (claimed.count === 0) throw new AttemptAlreadySubmitted();
            await tx.quiz_responses.createMany({ data: responses });
        });
    } catch (err) {
        if (err instanceof AttemptAlreadySubmitted) {
            return res.status(409).json({ message: "Attempt already submitted" });
        }
        throw err;
    }

    return res.json({ attemptId, scoreCorrect, scoreTotal });
});

// Review a submitted attempt: each question with its options, the correct answer,
// the explanation, the user's pick, and correctness — plus the score. Read-only,
// so it can be revisited any time after submitting.
router.get("/:id/quizzes/:quizId/attempts/:attemptId/review", async (req, res) => {
    const userId = req.user!.id;
    const classroomId = Number(req.params.id);
    const quizId = Number(req.params.quizId);
    const attemptId = Number(req.params.attemptId);
    if (![classroomId, quizId, attemptId].every(Number.isInteger)) {
        return res.status(400).json({ message: "Bad id" });
    }

    if (!(await ownClassroom(userId, classroomId))) {
        return res.status(404).json({ message: "Classroom not found" });
    }

    const quiz = await resolveCurrentVersion(quizId, classroomId);
    if (!quiz) {
        return res.status(404).json({ message: "Quiz not found" });
    }
    const versionId = quiz.versionId;

    const attempt = await prisma.quiz_attempts.findFirst({
        where: { id: attemptId, user_id: userId, version_id: versionId },
        select: { submitted_at: true, score_correct: true, score_total: true },
    });
    if (!attempt) {
        return res.status(404).json({ message: "Attempt not found" });
    }
    if (!attempt.submitted_at) {
        return res.status(409).json({ message: "Attempt not submitted yet" });
    }

    const questions = await prisma.quiz_questions.findMany({
        where: { version_id: versionId },
        orderBy: { display_order: "asc" },
        select: { id: true, question_text: true, answer_data: true },
    });

    // Map the user's responses by question for a quick join below.
    const responses = await prisma.quiz_responses.findMany({
        where: { attempt_id: attemptId },
        select: { question_id: true, response_data: true, is_correct: true },
    });
    const byQuestion = new Map(responses.map((r) => [r.question_id, r]));

    const review = questions.map((q) => {
        const a = q.answer_data as AnswerData;
        const r = byQuestion.get(q.id);
        const selectedIndex = (r?.response_data as { selectedIndex: number | null } | undefined)?.selectedIndex ?? null;
        return {
            id: q.id,
            question_text: q.question_text,
            options: a.options,
            correct_index: a.correct_index,
            explanation: a.explanation,
            source: a.source,
            selectedIndex,
            is_correct: r?.is_correct ?? false,
        };
    });

    return res.json({
        attemptId,
        title: quiz.title,
        scoreCorrect: attempt.score_correct,
        scoreTotal: attempt.score_total,
        questions: review,
    });
});

export default router;



