import { useEffect, useState } from "react";
import {
  getAttemptReview,
  ApiError,
  type AttemptReview,
  type ReviewQuestion,
  type QuizSourceTier,
} from "../lib/api";

type Props = {
  classroomId: number;
  quizId: number;
  attemptId: number;
  onBack: () => void;
};

const LETTERS = ["A", "B", "C", "D"];

// Where each question was grounded — the M3 requirement says questions trace
// to the materials or to clearly noted outside sources, so say so on each card.
const SOURCE_LABEL: Record<QuizSourceTier, string> = {
  materials: "From your materials",
  general: "General knowledge",
  web: "Web source",
};

// Per-question review of a submitted attempt: every option with the correct
// answer and the user's pick marked, plus the explanation. Read-only.
export default function QuizReview({ classroomId, quizId, attemptId, onBack }: Props) {
  const [review, setReview] = useState<AttemptReview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getAttemptReview(classroomId, quizId, attemptId)
      .then((res) => active && setReview(res))
      .catch(
        (err) =>
          active &&
          setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
      );
    return () => {
      active = false;
    };
  }, [classroomId, quizId, attemptId]);

  return (
    <div className="h-full overflow-y-auto themed-scroll">
      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg text-ink-strong truncate">{review?.title ?? "Review"}</h2>
            {review && (
              <p className="text-sm text-ink/70 tabular-nums">
                {review.scoreCorrect} / {review.scoreTotal} correct
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 rounded-xl bg-accent-soft text-ink-strong px-3 py-1.5 text-sm cursor-pointer"
          >
            Back to quizzes
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {!review && !error && <p className="text-sm text-ink/70">Loading review…</p>}

        {review && (
          <ol className="flex flex-col gap-4">
            {review.questions.map((q, i) => (
              <QuestionCard key={q.id} question={q} number={i + 1} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function QuestionCard({ question: q, number }: { question: ReviewQuestion; number: number }) {
  return (
    <li className="rounded-xl border border-ink/10 px-5 py-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm tabular-nums text-ink/40 select-none">
          {String(number).padStart(2, "0")}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
            q.source === "materials"
              ? "bg-accent-soft text-ink-strong"
              : "border border-line text-ink/60"
          }`}
        >
          {SOURCE_LABEL[q.source] ?? q.source}
        </span>
      </div>

      <p className="text-ink-strong">{q.question_text}</p>

      <ul className="flex flex-col gap-1.5">
        {q.options.map((opt, j) => {
          const isCorrect = j === q.correct_index;
          const isPicked = j === q.selectedIndex;
          return (
            <li
              key={j}
              className={`rounded-lg border px-3 py-2 text-sm flex items-center gap-3 ${
                isCorrect
                  ? "border-charcoal-brown-500/60 bg-charcoal-brown-800/25 text-ink-strong"
                  : isPicked
                    ? "border-red-400/40 bg-red-400/5"
                    : "border-line/40 text-ink/70"
              }`}
            >
              <span className={isCorrect ? "text-charcoal-brown-300" : "text-ink/40"}>
                {LETTERS[j] ?? j + 1}
              </span>
              <span className="grow">{opt}</span>
              {isCorrect && (
                <span className="shrink-0 text-xs text-charcoal-brown-300">
                  ✓ {isPicked ? "Your answer" : "Correct answer"}
                </span>
              )}
              {isPicked && !isCorrect && (
                <span className="shrink-0 text-xs text-red-400">✗ Your answer</span>
              )}
            </li>
          );
        })}
      </ul>

      {q.selectedIndex === null && (
        <p className="text-xs text-red-400">Not answered — counted as incorrect.</p>
      )}

      {q.explanation && (
        <p className="text-sm text-ink/70 border-l-2 border-line pl-3">{q.explanation}</p>
      )}
    </li>
  );
}
