import { useState } from "react";
import { submitAttempt, messageFor, type AttemptQuestion } from "../lib/api";

type Props = {
  classroomId: number;
  quizId: number;
  attemptId: number;
  title?: string;
  questions: AttemptQuestion[];
  onExit: () => void;
  onSubmitted: (score: { scoreCorrect: number; scoreTotal: number }) => void;
};

const LETTERS = ["A", "B", "C", "D"];

// The exam experience: one question at a time, Back/Next navigation, answers
// held client-side until a single final Submit. The progress rail fills a
// segment only when its question is ANSWERED (not just visited) — unanswered
// questions grade as wrong, so the rail shows exactly what's still at risk.
export default function QuizTaker({
  classroomId,
  quizId,
  attemptId,
  title,
  questions,
  onExit,
  onSubmitted,
}: Props) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<ReadonlyMap<number, number>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = questions[current];
  const total = questions.length;
  const unanswered = total - answers.size;
  const isLast = current === total - 1;

  function select(optionIndex: number) {
    setAnswers((prev) => new Map(prev).set(q.id, optionIndex));
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = [...answers].map(([questionId, selectedIndex]) => ({
        questionId,
        selectedIndex,
      }));
      const res = await submitAttempt(classroomId, quizId, attemptId, payload);
      onSubmitted({ scoreCorrect: res.scoreCorrect, scoreTotal: res.scoreTotal });
    } catch (err) {
      setError(messageFor(err));
      setSubmitting(false); // only on failure — on success this component unmounts
    }
  }

  return (
    <div className="h-full overflow-y-auto themed-scroll">
      <div className="max-w-2xl mx-auto min-h-full px-6 py-8 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg text-ink-strong truncate">{title ?? "Quiz"}</h2>
          <button
            type="button"
            onClick={onExit}
            className="shrink-0 text-sm text-ink hover:text-ink-strong cursor-pointer"
          >
            Exit
          </button>
        </div>

        {/* Progress rail: one segment per question. Filled = answered,
            mid-tone = where you are, faint = still blank. */}
        <div
          role="img"
          aria-label={`Question ${current + 1} of ${total}. ${answers.size} answered.`}
          className="flex gap-1.5"
        >
          {questions.map((question, i) => (
            <div
              key={question.id}
              className={`h-1 grow rounded-full ${
                answers.has(question.id)
                  ? "bg-accent"
                  : i === current
                    ? "bg-ink/50"
                    : "bg-ink/15"
              }`}
            />
          ))}
        </div>

        {/* The question, with its oversized exam-paper numeral */}
        <div className="grow flex flex-col gap-5">
          <div className="flex items-baseline gap-3">
            <span className="text-6xl font-light leading-none tabular-nums text-ink/15 select-none">
              {String(current + 1).padStart(2, "0")}
            </span>
            <span className="text-xs text-ink/50">of {total}</span>
          </div>

          <p className="text-lg text-ink-strong">{q.question_text}</p>

          <div role="radiogroup" aria-label="Answer options" className="flex flex-col gap-2">
            {q.options.map((opt, i) => {
              const selected = answers.get(q.id) === i;
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => select(i)}
                  className={`text-left rounded-xl border px-4 py-3 text-sm cursor-pointer flex gap-3 ${
                    selected
                      ? "border-accent bg-accent-soft/60 text-ink-strong"
                      : "border-line hover:border-ink/40"
                  }`}
                >
                  <span className={`shrink-0 ${selected ? "text-ink-strong" : "text-ink/50"}`}>
                    {LETTERS[i] ?? i + 1}
                  </span>
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* Navigation. On the last question Next becomes Submit; grading counts
            blanks as wrong, so surface how many are still unanswered. */}
        <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
          <button
            type="button"
            onClick={() => setCurrent((c) => c - 1)}
            disabled={current === 0 || submitting}
            className="rounded-xl px-4 py-1.5 text-sm text-ink hover:text-ink-strong cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Back
          </button>

          {isLast ? (
            <div className="flex items-center gap-3">
              {unanswered > 0 && (
                <span className="text-xs text-ink/50">
                  {unanswered} unanswered
                </span>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-xl bg-accent text-onyx-50 px-4 py-1.5 text-sm cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Submitting…" : "Submit quiz"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCurrent((c) => c + 1)}
              className="rounded-xl bg-accent-soft text-ink-strong px-4 py-1.5 text-sm cursor-pointer"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
