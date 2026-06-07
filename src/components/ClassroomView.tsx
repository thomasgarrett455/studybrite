import { useParams } from "react-router-dom";

// Placeholder for a single classroom. Next: materials, chat, flashcards, quizzes
// scoped to this classroom id.
export default function ClassroomView() {
  const { id } = useParams();

  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 px-12 text-center">
      <h1 className="text-2xl text-ink-strong">Classroom #{id}</h1>
      <p className="text-sm text-ink/70">
        Materials, flashcards, and quizzes for this classroom will live here.
      </p>
    </div>
  );
}
