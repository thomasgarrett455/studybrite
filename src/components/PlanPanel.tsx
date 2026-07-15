import { useEffect, useState, type SubmitEvent } from "react";
import {
  getPlanSetup,
  generatePlan,
  listPlans,
  getPlan,
  messageFor,
  type PlanSummary,
  type StudyPlan,
  type PlanPacing,
  type PlanRating,
  type PlanModality,
  type PlanPreferences,
} from "../lib/api";

// Which screen plan mode is showing. Browse is the hub; setup collects the
// deadline + preferences and generates; viewing renders one saved plan.
type View =
  | { kind: "browse" }
  | { kind: "setup" }
  | { kind: "viewing"; planId: number };

// A "YYYY-MM-DD" string parsed as a LOCAL date (new Date("YYYY-MM-DD") parses
// as UTC and shifts the day for anyone west of Greenwich).
function localDate(iso: string): Date {
  return new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function formatDay(iso: string): string {
  return localDate(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const MODALITY_LABELS: Record<PlanModality, string> = {
  reading: "Reading",
  practice: "Practice",
  video: "Video",
  flashcards: "Flashcards",
  quiz: "Quiz",
  review: "Review",
};

// Plan mode for a classroom: generate an AI study plan from the classroom's
// topics + a deadline, browse saved plans, and view one day by day.
export default function PlanPanel({ classroomId }: { classroomId: number }) {
  const [view, setView] = useState<View>({ kind: "browse" });
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listPlans(classroomId)
      .then((res) => active && setPlans(res.plans))
      .catch((err) => active && setError(messageFor(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [classroomId]);

  if (view.kind === "setup") {
    return (
      <PlanSetup
        classroomId={classroomId}
        onCancel={() => setView({ kind: "browse" })}
        onGenerated={async (planId) => {
          // Refresh the list so the new plan is there when the user goes back.
          try {
            const res = await listPlans(classroomId);
            setPlans(res.plans);
          } catch {
            /* the list refetches on next mount; viewing still works */
          }
          setView({ kind: "viewing", planId });
        }}
      />
    );
  }

  if (view.kind === "viewing") {
    return (
      <PlanView
        classroomId={classroomId}
        planId={view.planId}
        onBack={() => setView({ kind: "browse" })}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto themed-scroll">
      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg text-ink-strong">Study plans</h2>
            <p className="text-sm text-ink/70">
              A day-by-day schedule built from this classroom's topics and your deadline.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setView({ kind: "setup" })}
            className="shrink-0 rounded-xl bg-accent-soft text-ink-strong px-4 py-1.5 text-sm cursor-pointer"
          >
            New plan
          </button>
        </header>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {loading ? (
          <p className="text-sm text-ink/70">Loading plans…</p>
        ) : plans.length === 0 ? (
          <p className="text-sm text-ink/70">
            No plans yet. Set a deadline and generate your first one.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {plans.map((p) => (
              <li
                key={p.id}
                className="rounded-xl border border-ink/10 px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <span className="block text-sm text-ink-strong truncate">{p.title}</span>
                  <span className="text-xs text-ink/50">
                    Due {formatDay(p.deadline)} · {p.dayCount} study days · {p.sessionCount}{" "}
                    sessions
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setView({ kind: "viewing", planId: p.id })}
                  className="shrink-0 rounded-xl bg-accent-soft text-ink-strong px-3 py-1.5 text-sm cursor-pointer"
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// The "new plan" form: deadline, pacing, modality preferences, and a
// self-rating for each topic the classroom's materials cover.
function PlanSetup({
  classroomId,
  onCancel,
  onGenerated,
}: {
  classroomId: number;
  onCancel: () => void;
  onGenerated: (planId: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topics, setTopics] = useState<string[]>([]);

  const [deadline, setDeadline] = useState("");
  const [pacing, setPacing] = useState<PlanPacing>("short_frequent");
  const [modalities, setModalities] = useState<Set<string>>(
    () => new Set(["reading", "practice"])
  );
  const [ratings, setRatings] = useState<Map<string, PlanRating>>(new Map());
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getPlanSetup(classroomId)
      .then((res) => {
        if (!active) return;
        setTopics(res.topics);
        // Every topic starts "shaky"; the last plan's ratings pre-fill any
        // topic that still exists, and pacing/modalities carry over whole.
        const prefs: PlanPreferences | null = res.lastPreferences;
        const initial = new Map<string, PlanRating>();
        for (const t of res.topics) {
          const prev = prefs?.topic_ratings.find(
            (r) => r.topic.toLowerCase() === t.toLowerCase()
          );
          initial.set(t, prev?.rating ?? "shaky");
        }
        setRatings(initial);
        if (prefs) {
          setPacing(prefs.pacing);
          setModalities(new Set(prefs.modalities));
        }
      })
      .catch((err) => active && setError(messageFor(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [classroomId]);

  function toggleModality(m: string) {
    setModalities((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  async function handleGenerate(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (generating || !deadline || topics.length === 0) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await generatePlan(classroomId, {
        deadline,
        pacing,
        modalities: [...modalities],
        topicRatings: topics.map((t) => ({ topic: t, rating: ratings.get(t) ?? "shaky" })),
      });
      onGenerated(res.planId);
    } catch (err) {
      setError(messageFor(err));
      setGenerating(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto themed-scroll">
      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg text-ink-strong">New study plan</h2>
            <p className="text-sm text-ink/70">
              Tell the AI when your deadline is and how you like to study.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={generating}
            className="shrink-0 rounded-xl px-3 py-1.5 text-sm text-ink hover:text-ink-strong cursor-pointer disabled:opacity-50"
          >
            Back
          </button>
        </header>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {loading ? (
          <div className="rounded-xl border border-line px-4 py-3 animate-pulse">
            <span className="block text-sm text-ink-strong">Reading your materials…</span>
            <span className="text-xs text-ink/50">
              Finding the topics this classroom covers — this takes a few seconds.
            </span>
          </div>
        ) : topics.length === 0 ? (
          <p className="text-sm text-ink/70">
            This classroom has no materials yet. Upload notes or a syllabus first so the plan
            has real topics to schedule.
          </p>
        ) : (
          <form onSubmit={handleGenerate} className="flex flex-col gap-6">
            {/* Deadline */}
            <section className="flex flex-col gap-2">
              <label htmlFor="plan-deadline" className="text-sm text-ink-strong">
                Deadline
              </label>
              <input
                id="plan-deadline"
                type="date"
                value={deadline}
                min={todayIso()}
                onChange={(e) => setDeadline(e.target.value)}
                disabled={generating}
                className="w-fit border border-line rounded-md bg-canvas px-3 py-1.5 text-sm text-ink-strong outline-none cursor-pointer disabled:opacity-50 [color-scheme:dark]"
              />
              <p className="text-xs text-ink/50">
                The plan covers every day from today through this date.
              </p>
            </section>

            {/* Pacing */}
            <section className="flex flex-col gap-2">
              <span className="text-sm text-ink-strong">Pacing</span>
              <div className="flex gap-2">
                {(
                  [
                    ["short_frequent", "Frequent short sessions", "20–45 min, most days"],
                    ["long_infrequent", "Fewer long sessions", "60–120 min, some days"],
                  ] as const
                ).map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPacing(value)}
                    disabled={generating}
                    aria-pressed={pacing === value}
                    className={`grow rounded-xl border px-4 py-3 text-left cursor-pointer disabled:opacity-50 ${
                      pacing === value
                        ? "border-accent bg-accent-soft"
                        : "border-ink/10 hover:border-line"
                    }`}
                  >
                    <span className="block text-sm text-ink-strong">{label}</span>
                    <span className="text-xs text-ink/50">{hint}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Modalities */}
            <section className="flex flex-col gap-2">
              <span className="text-sm text-ink-strong">How do you like to study?</span>
              <div className="flex flex-wrap gap-2">
                {(["reading", "practice", "video", "flashcards"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleModality(m)}
                    disabled={generating}
                    aria-pressed={modalities.has(m)}
                    className={`rounded-xl border px-3 py-1.5 text-sm cursor-pointer disabled:opacity-50 ${
                      modalities.has(m)
                        ? "border-accent bg-accent-soft text-ink-strong"
                        : "border-ink/10 text-ink hover:border-line"
                    }`}
                  >
                    {MODALITY_LABELS[m]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-ink/50">
                Pick any that work for you — the plan leans on these for its sessions.
              </p>
            </section>

            {/* Topic ratings */}
            <section className="flex flex-col gap-2">
              <span className="text-sm text-ink-strong">
                How well do you know each topic?
              </span>
              <p className="text-xs text-ink/50 -mt-1">
                Weak topics get scheduled earlier and get more time.
              </p>
              <ul className="flex flex-col gap-2">
                {topics.map((t) => (
                  <li
                    key={t}
                    className="rounded-xl border border-ink/10 px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
                  >
                    <span className="text-sm text-ink-strong min-w-0">{t}</span>
                    <div
                      role="radiogroup"
                      aria-label={`Confidence for ${t}`}
                      className="flex rounded-lg border border-line overflow-hidden shrink-0"
                    >
                      {(
                        [
                          ["new", "New to me"],
                          ["shaky", "Shaky"],
                          ["know_it", "Know it"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={ratings.get(t) === value}
                          onClick={() =>
                            setRatings((prev) => new Map(prev).set(t, value))
                          }
                          disabled={generating}
                          className={`px-3 py-1 text-xs cursor-pointer disabled:opacity-50 ${
                            ratings.get(t) === value
                              ? "bg-accent-soft text-ink-strong"
                              : "text-ink/70 hover:text-ink-strong"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Generation takes several seconds of AI time — show what's happening. */}
            {generating && (
              <div className="rounded-xl border border-line px-4 py-3 animate-pulse">
                <span className="block text-sm text-ink-strong">Building your plan…</span>
                <span className="text-xs text-ink/50">
                  Sequencing your topics from today to {formatDay(deadline)}.
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={generating || !deadline}
              className="self-start rounded-xl bg-accent text-onyx-50 px-5 py-2 text-sm cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? "Generating…" : "Generate plan"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// One saved plan rendered as a vertical timeline of study days.
function PlanView({
  classroomId,
  planId,
  onBack,
}: {
  classroomId: number;
  planId: number;
  onBack: () => void;
}) {
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setPlan(null);
    getPlan(classroomId, planId)
      .then((res) => active && setPlan(res))
      .catch((err) => active && setError(messageFor(err)));
    return () => {
      active = false;
    };
  }, [classroomId, planId]);

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-6">
        <p className="text-sm text-red-400">{error}</p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl px-4 py-1.5 text-sm text-ink hover:text-ink-strong cursor-pointer"
        >
          Back to plans
        </button>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-ink/70">Loading plan…</p>
      </div>
    );
  }

  const today = todayIso();

  return (
    <div className="h-full overflow-y-auto themed-scroll">
      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg text-ink-strong">{plan.title}</h2>
            <p className="text-sm text-ink/70">
              Due {formatDay(plan.deadline)} · created{" "}
              {new Date(plan.created_at).toLocaleDateString()}
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 rounded-xl px-3 py-1.5 text-sm text-ink hover:text-ink-strong cursor-pointer"
          >
            Back
          </button>
        </header>

        {plan.overview && <p className="text-sm text-ink">{plan.overview}</p>}

        {/* Timeline: a left rail connects the study days in date order. */}
        <ol className="relative flex flex-col gap-4 pl-6 border-l border-line ml-2">
          {plan.days.map((day) => {
            const isToday = day.date === today;
            const isPast = day.date < today;
            const totalMin = day.sessions.reduce((n, s) => n + s.minutes, 0);
            return (
              <li key={day.date} className="relative">
                {/* Node on the rail */}
                <span
                  aria-hidden="true"
                  className={`absolute -left-6 top-1.5 -translate-x-1/2 size-2.5 rounded-full ${
                    isToday ? "bg-accent" : isPast ? "bg-ink/20" : "bg-line"
                  }`}
                />
                <div className={`flex flex-col gap-2 ${isPast && !isToday ? "opacity-60" : ""}`}>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm text-ink-strong">{formatDay(day.date)}</span>
                    {isToday && (
                      <span className="rounded-full bg-accent text-onyx-50 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                        Today
                      </span>
                    )}
                    <span className="text-xs text-ink/50">
                      {day.focus} · {totalMin} min
                    </span>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {day.sessions.map((s, i) => (
                      <li key={i} className="rounded-xl border border-ink/10 px-4 py-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-sm text-ink-strong">{s.topic}</span>
                          <span className="shrink-0 flex items-center gap-2">
                            <span className="rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink/70">
                              {MODALITY_LABELS[s.modality] ?? s.modality}
                            </span>
                            <span className="text-xs text-ink/50 tabular-nums">
                              {s.minutes} min
                            </span>
                          </span>
                        </div>
                        <p className="text-sm text-ink mt-1">{s.activity}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}

          {/* Deadline marker closes the timeline. */}
          <li className="relative">
            <span
              aria-hidden="true"
              className="absolute -left-6 top-1 -translate-x-1/2 size-2.5 rounded-full bg-accent"
            />
            <span className="text-sm text-ink-strong">
              {formatDay(plan.deadline)} — deadline
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}
