import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../db/prisma.js";
import requireAuth from "../middleware/requireAuth.js";
import { anthropic, CHAT_MODEL } from "../lib/anthropic.js";
import { retrievedChunks } from "../lib/retrieve.js";
import {
    formatContext,
    buildTopicsSystem,
    buildPlanSystem,
    TOPICS_TOOL,
    PLAN_TOOL,
    PLAN_MODALITIES,
    type GeneratedPlan,
    type GeneratedPlanDay,
    type GeneratedPlanSession,
    type TopicRating,
    type PlanModality,
} from "../lib/prompt.js";
import { ownClassroom } from "../lib/classrooms.js";

const router = Router();
router.use(requireAuth);

// The user-selectable preference sets. Sessions can also use "quiz"/"review"
// (see PLAN_MODALITIES) but those aren't preferences the form offers.
const PACING_OPTIONS = ["long_infrequent", "short_frequent"] as const;
const MODALITY_PREFS = ["reading", "practice", "video", "flashcards"] as const;
const RATING_OPTIONS = ["know_it", "shaky", "new"] as const;

type Pacing = (typeof PACING_OPTIONS)[number];

// The stored shape of study_plans.preferences / plan_data (Prisma Json).
type StoredPreferences = {
    pacing: Pacing;
    modalities: string[];
    topic_ratings: TopicRating[];
};
type StoredPlanData = {
    overview: string;
    days: GeneratedPlanDay[];
};

// Today's date as YYYY-MM-DD in the server's local timezone (toISOString would
// shift the date for anyone west of UTC in the evening).
function localIsoDate(d = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

// Inclusive day count between two YYYY-MM-DD strings (1 = deadline is today).
function inclusiveDayCount(fromIso: string, toIso: string): number {
    const from = Date.UTC(
        Number(fromIso.slice(0, 4)), Number(fromIso.slice(5, 7)) - 1, Number(fromIso.slice(8, 10))
    );
    const to = Date.UTC(
        Number(toIso.slice(0, 4)), Number(toIso.slice(5, 7)) - 1, Number(toIso.slice(8, 10))
    );
    return Math.round((to - from) / 86_400_000) + 1;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// GET plan-setup: everything the "new plan" form needs — the topics currently
// available in the classroom's materials (extracted by the model) and the
// preferences from this user's most recent plan here, to pre-fill the form.
router.get("/:id/plan-setup", async (req, res) => {
    const userId = req.user!.id;
    const classroomId = Number(req.params.id);
    if (!Number.isInteger(classroomId)) {
        return res.status(400).json({ message: "Bad classroom id" });
    }

    const classroom = await ownClassroom(userId, classroomId);
    if (!classroom) {
        return res.status(404).json({ message: "Classroom not found" });
    }

    // Sample the classroom's material text: an excerpt of each note plus the
    // syllabus. Excerpts keep the extraction call cheap while still giving the
    // model real content (titles alone are often just file names).
    const notes = await prisma.note_headers.findMany({
        where: { classroom_id: classroomId, archived_at: null },
        orderBy: { created_at: "desc" },
        take: 8,
        select: { currentVersion: { select: { title: true, content: true } } },
    });

    const parts: string[] = [];
    if (classroom.syllabus_text?.trim()) {
        parts.push(`[Syllabus]\n${classroom.syllabus_text.slice(0, 2000)}`);
    }
    for (const n of notes) {
        const v = n.currentVersion;
        if (v?.content?.trim()) {
            parts.push(`[${v.title ?? "Material"}]\n${v.content.slice(0, 1500)}`);
        }
    }

    // Last preferences regardless of whether there is any material — the form
    // can pre-fill pacing/modalities even in an empty classroom.
    const lastPlan = await prisma.study_plans.findFirst({
        where: { user_id: userId, classroom_id: classroomId, archived_at: null },
        orderBy: { created_at: "desc" },
        select: { preferences: true },
    });
    const lastPreferences = (lastPlan?.preferences as StoredPreferences | undefined) ?? null;

    if (parts.length === 0) {
        return res.json({ topics: [], lastPreferences });
    }

    const ai = await anthropic.messages.create({
        model: CHAT_MODEL,
        max_tokens: 1024,
        system: buildTopicsSystem(),
        tools: [TOPICS_TOOL],
        tool_choice: { type: "tool", name: "emit_topics" },
        messages: [{ role: "user", content: parts.join("\n\n") }],
    });

    const block = ai.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "emit_topics"
    );
    if (!block) {
        return res.status(502).json({ message: "Topic extraction failed" });
    }

    // Verify the shape ourselves: strings only, trimmed, deduped, capped.
    const raw = (block.input as { topics?: unknown }).topics;
    const seen = new Set<string>();
    const topics: string[] = [];
    for (const t of Array.isArray(raw) ? raw : []) {
        if (typeof t !== "string") continue;
        const trimmed = t.trim();
        if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
        seen.add(trimmed.toLowerCase());
        topics.push(trimmed);
        if (topics.length >= 15) break;
    }

    return res.json({ topics, lastPreferences });
});

// POST plans: generate a study plan from the form's inputs and persist it.
router.post("/:id/plans", async (req, res) => {
    const userId = req.user!.id;
    const classroomId = Number(req.params.id);
    if (!Number.isInteger(classroomId)) {
        return res.status(400).json({ message: "Bad classroom id" });
    }

    const classroom = await ownClassroom(userId, classroomId);
    if (!classroom) {
        return res.status(404).json({ message: "Classroom not found" });
    }

    // --- Validate the form inputs ---
    const deadline = String(req.body?.deadline ?? "").trim();
    if (!ISO_DATE.test(deadline)) {
        return res.status(400).json({ message: "Deadline must be a YYYY-MM-DD date" });
    }
    const todayIso = localIsoDate();
    const dayCount = inclusiveDayCount(todayIso, deadline);
    if (dayCount < 1) {
        return res.status(400).json({ message: "Deadline must be today or later" });
    }
    if (dayCount > 365) {
        return res.status(400).json({ message: "Deadline must be within a year" });
    }

    const pacing = String(req.body?.pacing ?? "");
    if (!(PACING_OPTIONS as readonly string[]).includes(pacing)) {
        return res.status(400).json({ message: "Bad pacing preference" });
    }

    const modalities = (Array.isArray(req.body?.modalities) ? req.body.modalities : [])
        .filter((m: unknown): m is string =>
            typeof m === "string" && (MODALITY_PREFS as readonly string[]).includes(m)
        );

    const rawRatings = Array.isArray(req.body?.topicRatings) ? req.body.topicRatings : [];
    const topicRatings: TopicRating[] = [];
    const seenTopics = new Set<string>();
    for (const r of rawRatings) {
        const topic = typeof r?.topic === "string" ? r.topic.trim() : "";
        const rating = String(r?.rating ?? "");
        if (!topic || seenTopics.has(topic.toLowerCase())) continue;
        if (!(RATING_OPTIONS as readonly string[]).includes(rating)) continue;
        seenTopics.add(topic.toLowerCase());
        topicRatings.push({ topic, rating: rating as TopicRating["rating"] });
        if (topicRatings.length >= 15) break;
    }
    if (topicRatings.length === 0) {
        return res.status(400).json({ message: "At least one topic is required" });
    }

    // --- Ground the plan in the classroom's materials ---
    // Query the vector store with the weak topics first so the activity
    // suggestions reference the material the student most needs to study.
    const query = [...topicRatings]
        .sort((a, b) => (a.rating === "know_it" ? 1 : 0) - (b.rating === "know_it" ? 1 : 0))
        .map((t) => t.topic)
        .join("; ");
    const chunks = await retrievedChunks({ question: query, classroomId, topK: 6 });
    const context = formatContext(chunks, classroom.syllabus_text ?? undefined);

    // Size the output budget to the horizon so a long plan's tool JSON isn't
    // truncated mid-array; short plans stay cheap.
    const maxTokens = Math.min(8192, 2048 + dayCount * 120);

    const ai = await anthropic.messages.create({
        model: CHAT_MODEL,
        max_tokens: maxTokens,
        system: buildPlanSystem({
            classroomName: classroom.name,
            context,
            todayIso,
            deadlineIso: deadline,
            dayCount,
            pacing: pacing as Pacing,
            modalities,
            topicRatings,
        }),
        tools: [PLAN_TOOL],
        tool_choice: { type: "tool", name: "emit_plan" },
        messages: [
            { role: "user", content: `Generate my study plan from ${todayIso} through ${deadline}.` },
        ],
    });

    const block = ai.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "emit_plan"
    );
    if (!block) {
        return res.status(502).json({ message: "Plan generation failed" });
    }

    // --- Validate the model's output before persisting ---
    const plan = block.input as GeneratedPlan;
    const validDays: GeneratedPlanDay[] = [];
    for (const day of Array.isArray(plan.days) ? plan.days : []) {
        if (!day || typeof day.date !== "string" || !ISO_DATE.test(day.date)) continue;
        // Lexicographic compare is safe for YYYY-MM-DD strings.
        if (day.date < todayIso || day.date > deadline) continue;
        if (typeof day.focus !== "string") continue;

        const sessions: GeneratedPlanSession[] = [];
        for (const s of Array.isArray(day.sessions) ? day.sessions : []) {
            if (
                s &&
                typeof s.topic === "string" && s.topic.trim() &&
                typeof s.activity === "string" && s.activity.trim() &&
                (PLAN_MODALITIES as readonly string[]).includes(s.modality) &&
                Number.isFinite(s.minutes)
            ) {
                sessions.push({
                    topic: s.topic.trim(),
                    activity: s.activity.trim(),
                    modality: s.modality as PlanModality,
                    minutes: Math.max(10, Math.min(180, Math.round(s.minutes))),
                });
            }
        }
        if (sessions.length > 0) {
            validDays.push({ date: day.date, focus: day.focus.trim(), sessions });
        }
    }
    validDays.sort((a, b) => (a.date < b.date ? -1 : 1));

    if (validDays.length === 0) {
        // TEMP diagnostic: capture what the model actually emitted so we can see
        // why every day was filtered out.
        console.error("[plan] no valid days. today=%s deadline=%s raw=%s",
            todayIso, deadline, JSON.stringify(plan).slice(0, 2000));
        return res.status(502).json({ message: "Plan generation returned no valid days" });
    }

    const title =
        typeof plan.title === "string" && plan.title.trim()
            ? plan.title.trim().slice(0, 255)
            : `Study plan: ${classroom.name}`;
    const overview = typeof plan.overview === "string" ? plan.overview.trim() : "";

    const preferences: StoredPreferences = {
        pacing: pacing as Pacing,
        modalities,
        topic_ratings: topicRatings,
    };
    const planData: StoredPlanData = { overview, days: validDays };

    const created = await prisma.study_plans.create({
        data: {
            user_id: userId,
            classroom_id: classroomId,
            title,
            // Midday UTC so the DATE column holds the intended day in any TZ.
            deadline_date: new Date(`${deadline}T12:00:00Z`),
            // Prisma's Json input type wants an index signature our interfaces
            // don't have; the shapes are plain JSON, so the cast is safe.
            preferences: preferences as unknown as Prisma.InputJsonValue,
            plan_data: planData as unknown as Prisma.InputJsonValue,
        },
    });

    return res.json({ planId: created.id, title });
});

// GET plans: list the classroom's saved plans (newest first) for the browse view.
router.get("/:id/plans", async (req, res) => {
    const userId = req.user!.id;
    const classroomId = Number(req.params.id);
    if (!Number.isInteger(classroomId)) {
        return res.status(400).json({ message: "Bad classroom id" });
    }
    if (!(await ownClassroom(userId, classroomId))) {
        return res.status(404).json({ message: "Classroom not found" });
    }

    const rows = await prisma.study_plans.findMany({
        where: { user_id: userId, classroom_id: classroomId, archived_at: null },
        orderBy: { created_at: "desc" },
        select: { id: true, title: true, deadline_date: true, created_at: true, plan_data: true },
    });

    const plans = rows.map((p: (typeof rows)[number]) => {
        const data = p.plan_data as unknown as StoredPlanData;
        const days = Array.isArray(data?.days) ? data.days : [];
        return {
            id: p.id,
            title: p.title,
            deadline: p.deadline_date.toISOString().slice(0, 10),
            created_at: p.created_at,
            dayCount: days.length,
            sessionCount: days.reduce((n, d) => n + d.sessions.length, 0),
        };
    });

    return res.json({ plans });
});

// GET one plan: the full saved schedule for the plan view.
router.get("/:id/plans/:planId", async (req, res) => {
    const userId = req.user!.id;
    const classroomId = Number(req.params.id);
    const planId = Number(req.params.planId);
    if (![classroomId, planId].every(Number.isInteger)) {
        return res.status(400).json({ message: "Bad id" });
    }
    if (!(await ownClassroom(userId, classroomId))) {
        return res.status(404).json({ message: "Classroom not found" });
    }

    const plan = await prisma.study_plans.findFirst({
        where: { id: planId, user_id: userId, classroom_id: classroomId, archived_at: null },
        select: {
            id: true,
            title: true,
            deadline_date: true,
            created_at: true,
            preferences: true,
            plan_data: true,
        },
    });
    if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
    }

    const data = plan.plan_data as unknown as StoredPlanData;
    return res.json({
        id: plan.id,
        title: plan.title,
        deadline: plan.deadline_date.toISOString().slice(0, 10),
        created_at: plan.created_at,
        preferences: plan.preferences as StoredPreferences,
        overview: data.overview ?? "",
        days: Array.isArray(data.days) ? data.days : [],
    });
});

export default router;
