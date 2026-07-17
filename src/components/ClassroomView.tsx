import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getMaterials, uploadMaterial, uploadSyllabus, messageFor, type Material } from "../lib/api";
import ChatArea from "./ChatArea";
import QuizPanel from "./QuizPanel";
import PlanPanel from "./PlanPanel";
import TeachPanel from "./TeachPanel";
import DiagramPanel from "./DiagramPanel";

// Study modes available inside a classroom. Quiz is M3, Plan is M4, Teach is M5; Cards slots in here later.
type Mode = "chat" | "quiz" | "plan" | "teach" | "diagram";
const MODES: { id: Mode; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "quiz", label: "Quiz" },
  { id: "plan", label: "Plan" },
  { id: "teach", label: "Teach" },
  { id: "diagram", label: "Diagram" },
];

// A single classroom: a materials panel on the left (upload + ingested files)
// and the classroom-scoped study chat on the right.
export default function ClassroomView() {
  const { id } = useParams();
  const classroomId = Number(id);

  const [mode, setMode] = useState<Mode>("chat");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [syllabusUploading, setSyllabusUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const syllabusInput = useRef<HTMLInputElement>(null);

  // Reset loading during render (not in the effect below) when classroomId
  // changes, so the fetch effect only ever calls setState from its callbacks.
  const [loadedFor, setLoadedFor] = useState(classroomId);
  if (classroomId !== loadedFor) {
    setLoadedFor(classroomId);
    setLoading(true);
  }

  useEffect(() => {
    let active = true;
    getMaterials(classroomId)
      .then((res) => active && setMaterials(res.materials))
      .catch((err) => active && setError(messageFor(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [classroomId]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadMaterial(classroomId, file);
      const res = await getMaterials(classroomId);
      setMaterials(res.materials);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = ""; // allow re-uploading the same file
    }
  }

  async function handleSyllabusFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSyllabusUploading(true);
    setError(null);
    try {
      await uploadSyllabus(classroomId, file);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSyllabusUploading(false);
      if (syllabusInput.current) syllabusInput.current.value = ""; // allow re-uploading the same file
    }
  }

  return (
    <div className="h-full flex min-h-0">
      {/* Materials panel */}
      <section className="w-80 shrink-0 border-r border-line flex flex-col gap-4 px-6 py-6 min-h-0">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg text-ink-strong truncate">Syllabus</h1>
          <button
            type="button"
            onClick={() => syllabusInput.current?.click()}
            disabled={syllabusUploading}
            className="shrink-0 rounded-xl bg-accent-soft text-ink-strong px-3 py-1.5 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syllabusUploading ? "Uploading…" : "Upload"}
          </button>
          <input
            ref={syllabusInput}
            type="file"
            accept=".pdf,.docx,.txt"
            className="hidden"
            onChange={handleSyllabusFile}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg text-ink-strong truncate">Materials</h1>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="shrink-0 rounded-xl bg-accent-soft text-ink-strong px-3 py-1.5 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
          <input ref={fileInput} type="file" className="hidden" onChange={handleFile} />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="grow overflow-y-auto themed-scroll min-h-0">
          {loading ? (
            <p className="text-sm text-ink/70">Loading materials…</p>
          ) : materials.length === 0 ? (
            <p className="text-sm text-ink/70">
              No materials yet. Upload a file to get started.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {materials.map((m) => (
                <li
                  key={m.id}
                  className="rounded-xl border border-ink/10 px-4 py-3 text-sm"
                >
                  <span className="block text-ink-strong truncate">
                    {m.currentVersion.title}
                  </span>
                  <span className="text-ink/50 text-xs">
                    {new Date(m.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Mode tabs + the active study mode */}
      <div className="grow min-h-0 flex flex-col">
        <div
          role="tablist"
          aria-label="Study modes"
          className="shrink-0 flex items-center gap-1 border-b border-line px-4 py-2"
        >
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-xl px-4 py-1.5 text-sm cursor-pointer ${
                mode === m.id
                  ? "bg-accent-soft text-ink-strong"
                  : "text-ink hover:text-ink-strong"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Both modes stay mounted (inactive one hidden) so switching tabs never
            loses an in-progress quiz attempt or the chat transcript. Each is keyed
            by classroomId so navigating to another classroom resets its state
            rather than showing the previous classroom's messages/quiz. */}
        <div className={mode === "chat" ? "grow min-h-0" : "hidden"}>
          <ChatArea key={classroomId} classroomId={classroomId} />
        </div>
        <div className={mode === "quiz" ? "grow min-h-0" : "hidden"}>
          <QuizPanel key={classroomId} classroomId={classroomId} />
        </div>
        <div className={mode === "plan" ? "grow min-h-0" : "hidden"}>
          <PlanPanel key={classroomId} classroomId={classroomId} />
        </div>
        <div className={mode === "teach" ? "grow min-h-0" : "hidden"}>
          <TeachPanel key={classroomId} classroomId={classroomId} />
        </div>
        <div className={mode === "diagram" ? "grow min-h-0" : "hidden"}>
          <DiagramPanel key={classroomId} classroomId={classroomId} />
        </div>
      </div>
    </div>
  );
}
