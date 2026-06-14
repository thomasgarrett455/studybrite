import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getMaterials, uploadMaterial, ApiError, type Material } from "../lib/api";
import ChatArea from "./ChatArea";

// A single classroom: a materials panel on the left (upload + ingested files)
// and the classroom-scoped study chat on the right.
export default function ClassroomView() {
  const { id } = useParams();
  const classroomId = Number(id);

  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
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

  return (
    <div className="h-full flex min-h-0">
      {/* Materials panel */}
      <section className="w-80 shrink-0 border-r border-line flex flex-col gap-4 px-6 py-6 min-h-0">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg text-ink-strong truncate">Materials</h1>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="shrink-0 rounded-xl bg-accent-soft text-ink-strong px-3 py-1.5 text-sm disabled:opacity-50"
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

      {/* Classroom chat */}
      <div className="grow min-h-0">
        <ChatArea classroomId={classroomId} />
      </div>
    </div>
  );
}

function messageFor(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Something went wrong. Please try again.";
}
