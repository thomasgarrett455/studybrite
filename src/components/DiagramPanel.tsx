import { useEffect, useRef, useState, type SubmitEvent } from "react";
import mermaid from "mermaid";
import {
  generateDiagram,
  listDiagrams,
  getDiagram,
  messageFor,
  type DiagramSummary,
  type Diagram,
} from "../lib/api";
import { toMermaid } from "../lib/mermaid";

// Render SVG text, not interactive HTML; keep labels as plain text.
mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });

type View = { kind: "browse" } | { kind: "viewing"; diagramId: number };

// Diagram mode (S3): generate a concept map of a topic from the classroom's
// materials, browse saved maps, and view one rendered as an SVG.
export default function DiagramPanel({ classroomId }: { classroomId: number }) {
  const [view, setView] = useState<View>({ kind: "browse" });
  const [diagrams, setDiagrams] = useState<DiagramSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);

  // Reset loading during render (not in the effect below) when classroomId
  // changes, so the fetch effect only ever calls setState from its callbacks.
  const [loadedFor, setLoadedFor] = useState(classroomId);
  if (classroomId !== loadedFor) {
    setLoadedFor(classroomId);
    setLoading(true);
  }

  useEffect(() => {
    let active = true;
    listDiagrams(classroomId)
      .then((res) => active && setDiagrams(res.diagrams))
      .catch((err) => active && setError(messageFor(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [classroomId]);

  async function onGenerate(e: SubmitEvent) {
    e.preventDefault();
    const t = topic.trim();
    if (!t || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await generateDiagram(classroomId, t);
      setTopic("");
      try {
        const list = await listDiagrams(classroomId);
        setDiagrams(list.diagrams);
      } catch {
        /* list refetches on next mount; viewing still works */
      }
      setView({ kind: "viewing", diagramId: res.diagramId });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setGenerating(false);
    }
  }

  if (view.kind === "viewing") {
    return (
      <DiagramView
        classroomId={classroomId}
        diagramId={view.diagramId}
        onBack={() => setView({ kind: "browse" })}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto themed-scroll">
      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
        <header>
          <h2 className="text-lg text-ink-strong">Diagrams</h2>
          <p className="text-sm text-ink/70">
            A concept map of a topic, built from this classroom's materials.
          </p>
        </header>

        <form onSubmit={onGenerate} className="flex gap-2">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topic to diagram, e.g. mitosis"
            maxLength={200}
            className="grow rounded-xl bg-surface border border-edge px-3 py-1.5 text-sm text-ink"
          />
          <button
            type="submit"
            disabled={generating || !topic.trim()}
            className="shrink-0 rounded-xl bg-accent-soft text-ink-strong px-4 py-1.5 text-sm cursor-pointer disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate"}
          </button>
        </form>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {loading && <p className="text-sm text-ink/60">Loading…</p>}
        {!loading && diagrams.length === 0 && (
          <p className="text-sm text-ink/60">No diagrams yet — generate your first one above.</p>
        )}

        <ul className="flex flex-col gap-2">
          {diagrams.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setView({ kind: "viewing", diagramId: d.id })}
                className="w-full text-left rounded-xl bg-surface border border-edge px-4 py-3 cursor-pointer hover:border-accent-soft"
              >
                <div className="text-sm text-ink-strong">{d.title}</div>
                <div className="text-xs text-ink/60">
                  {d.topic} · {d.nodeCount} concepts ·{" "}
                  {new Date(d.created_at).toLocaleDateString()}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DiagramView({
  classroomId,
  diagramId,
  onBack,
}: {
  classroomId: number;
  diagramId: number;
  onBack: () => void;
}) {
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getDiagram(classroomId, diagramId)
      .then((d) => active && setDiagram(d))
      .catch((err) => active && setError(messageFor(err)));
    return () => {
      active = false;
    };
  }, [classroomId, diagramId]);

  return (
    <div className="h-full overflow-y-auto themed-scroll">
      <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg text-ink-strong">{diagram?.title ?? "Diagram"}</h2>
            {diagram && <p className="text-sm text-ink/70">Topic: {diagram.topic}</p>}
          </div>
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 rounded-xl bg-surface border border-edge text-ink px-4 py-1.5 text-sm cursor-pointer"
          >
            Back
          </button>
        </header>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {!diagram && !error && <p className="text-sm text-ink/60">Loading…</p>}

        {diagram && (
          <div className="rounded-xl bg-surface border border-edge p-4 overflow-x-auto">
            <MermaidGraph id={diagram.id} code={toMermaid(diagram.nodes, diagram.edges)} />
          </div>
        )}
      </div>
    </div>
  );
}

// mermaid.render is async and hands back an SVG string, so this can't be
// plain JSX — render into a ref'd div when the code changes.
function MermaidGraph({ id, code }: { id: number; code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    mermaid
      .render(`diagram-svg-${id}`, code)
      .then(({ svg }) => {
        if (active && ref.current) ref.current.innerHTML = svg;
      })
      .catch(() => active && setRenderError("This diagram couldn't be rendered."));
    return () => {
      active = false;
    };
  }, [id, code]);

  if (renderError) return <p className="text-sm text-red-400">{renderError}</p>;
  return <div ref={ref} className="flex justify-center [&_svg]:max-w-full" />;
}
