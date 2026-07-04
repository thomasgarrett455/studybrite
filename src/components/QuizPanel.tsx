import { useEffect, useState, type SubmitEvent } from "react";
import {
  listQuizzes,
  generateQuiz,
  startAttempt,
  messageFor,
  type QuizSummary,
  type AttemptQuestion,
} from "../lib/api";
import QuizTaker from "./QuizTaker";
import QuizReview from "./QuizReview";

// Which screen quiz mode is showing. Browse is the hub; taking hands off to
// QuizTaker; score is the reveal after submit; review breaks down each question.
type View =
  | { kind: "browse" }
  | {
      kind: "taking";
      quizId: number;
      attemptId: number;
      title?: string;
      questions: AttemptQuestion[];
    }
  | { kind: "score"; quizId: number; attemptId: number; scoreCorrect: number; scoreTotal: number }
  | { kind: "review"; quizId: number; attemptId: number };

// Quiz mode for a classroom: generate a quiz from the classroom's materials,
// pick one from the list, take it one question at a time, and review results.
export default function QuizPanel({ classroomId }: { classroomId: number }) {
  const [view, setView] = useState<View>({ kind: "browse" });
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generate form
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [generating, setGenerating] = useState(false);

  // Which quiz's Take button is mid-request, so only that card shows "Starting…"
  const [startingId, setStartingId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listQuizzes(classroomId)
      .then((res) => active && setQuizzes(res.quizzes))
      .catch((err) => active && setError(messageFor(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [classroomId]);

  async function handleGenerate(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const t = topic.trim();
    if (!t || generating) return;
    setGenerating(true);
    setError(null);
    try {
      await generateQuiz(classroomId, t, count);
      const res = await listQuizzes(classroomId); // refresh so the new quiz appears on top
      setQuizzes(res.quizzes);
      setTopic("");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setGenerating(false);
    }
  }

  async function handleStart(quizId: number) {
    if (startingId !== null) return;
    setStartingId(quizId);
    setError(null);
    try {
      const res = await startAttempt(classroomId, quizId);
      setView({
        kind: "taking",
        quizId,
        attemptId: res.attemptId,
        title: res.title,
        questions: res.questions,
      });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setStartingId(null);
    }
  }

  if (view.kind === "taking") {
    return (
      <QuizTaker
        classroomId={classroomId}
        quizId={view.quizId}
        attemptId={view.attemptId}
        title={view.title}
        questions={view.questions}
        onExit={() => setView({ kind: "browse" })}
        onSubmitted={({ scoreCorrect, scoreTotal }) =>
          setView({
            kind: "score",
            quizId: view.quizId,
            attemptId: view.attemptId,
            scoreCorrect,
            scoreTotal,
          })
        }
      />
    );
  }

  if (view.kind === "score") {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-6 px-6">
        <p className="text-sm text-ink/70">Quiz complete</p>
        <ScoreRing correct={view.scoreCorrect} total={view.scoreTotal} />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              setView({ kind: "review", quizId: view.quizId, attemptId: view.attemptId })
            }
            className="rounded-xl bg-accent text-onyx-50 px-4 py-1.5 text-sm cursor-pointer hover:opacity-90"
          >
            Review answers
          </button>
          <button
            type="button"
            onClick={() => setView({ kind: "browse" })}
            className="rounded-xl px-4 py-1.5 text-sm text-ink hover:text-ink-strong cursor-pointer"
          >
            Back to quizzes
          </button>
        </div>
      </div>
    );
  }

  if (view.kind === "review") {
    return (
      <QuizReview
        classroomId={classroomId}
        quizId={view.quizId}
        attemptId={view.attemptId}
        onBack={() => setView({ kind: "browse" })}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto themed-scroll">
      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
        <header>
          <h2 className="text-lg text-ink-strong">Quizzes</h2>
          <p className="text-sm text-ink/70">
            Questions are written from this classroom's materials.
          </p>
        </header>

        {/* Generate form */}
        <form onSubmit={handleGenerate} className="flex items-center gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={generating}
            placeholder="Topic — e.g. mitosis, chapter 3, limits…"
            className="grow border border-line rounded-md bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-ink/40 disabled:opacity-50"
          />
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            disabled={generating}
            aria-label="Number of questions"
            className="shrink-0 border border-line rounded-md bg-canvas px-2 py-1.5 text-sm outline-none cursor-pointer disabled:opacity-50"
          >
            {[3, 5, 10, 15, 20].map((n) => (
              <option key={n} value={n}>
                {n} questions
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={generating || !topic.trim()}
            className="shrink-0 rounded-xl bg-accent-soft text-ink-strong px-4 py-1.5 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? "Generating…" : "Generate"}
          </button>
        </form>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* Generation takes a few seconds of AI time — show where the quiz will land. */}
        {generating && (
          <div className="rounded-xl border border-line px-4 py-3 animate-pulse">
            <span className="block text-sm text-ink-strong">Writing questions…</span>
            <span className="text-xs text-ink/50">
              Reading your materials on “{topic.trim()}” — this takes a few seconds.
            </span>
          </div>
        )}

        {/* Quiz list */}
        {loading ? (
          <p className="text-sm text-ink/70">Loading quizzes…</p>
        ) : quizzes.length === 0 && !generating ? (
          <p className="text-sm text-ink/70">
            No quizzes yet. Name a topic above and generate your first one.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {quizzes.map((q) => (
              <li
                key={q.id}
                className="rounded-xl border border-ink/10 px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <span className="block text-sm text-ink-strong truncate">{q.title}</span>
                  <span className="text-xs text-ink/50">
                    {q.questionCount} questions · {new Date(q.created_at).toLocaleDateString()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleStart(q.id)}
                  disabled={startingId !== null}
                  className="shrink-0 rounded-xl bg-accent-soft text-ink-strong px-3 py-1.5 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {startingId === q.id ? "Starting…" : "Take quiz"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// The score reveal: an SVG ring that sweeps from empty to the earned fraction
// on mount. Pure CSS transition on stroke-dashoffset; the numbers are always
// present, so reduced-motion users just see the final state instantly.
function ScoreRing({ correct, total }: { correct: number; total: number }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    // Paint one frame at zero first so the transition has somewhere to go.
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const fraction = total > 0 ? correct / total : 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative size-40">
      <svg viewBox="0 0 120 120" className="size-40 -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="6" className="stroke-ink/10" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={drawn ? circumference * (1 - fraction) : circumference}
          className="stroke-accent transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl text-ink-strong tabular-nums">
          {correct} / {total}
        </span>
        <span className="text-xs text-ink/50 tabular-nums">{Math.round(fraction * 100)}%</span>
      </div>
    </div>
  );
}
