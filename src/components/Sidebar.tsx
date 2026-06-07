import { useState } from "react";
import type { FormEvent } from "react";
import { NavLink } from "react-router-dom";
import { useClassrooms } from "../lib/useClassrooms";
import { getUser } from "../lib/api";

export default function Sidebar() {
  const user = getUser();
  const { classrooms, loading, error, create } = useClassrooms();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setCreateError(null);
    try {
      await create(trimmed);
      setName("");
      setAdding(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Couldn't create classroom");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full p-3 gap-4">
      {/* Brand */}
      <div className="flex items-center justify-between px-1">
        <span className="text-ink-strong font-semibold">StudyBrite</span>
        <button
          title="Settings"
          aria-label="Settings"
          className="text-ink hover:text-ink-strong cursor-pointer"
        >
          ⚙
        </button>
      </div>

      {/* Primary nav */}
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `w-full flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-accent-soft hover:text-ink-strong ${
            isActive ? "bg-accent-soft text-ink-strong" : ""
          }`
        }
      >
        <span>+</span>New chat
      </NavLink>

      {/* Classrooms */}
      <div className="flex flex-col min-h-0 grow">
        <div className="flex items-center justify-between px-2 mb-1">
          <span className="text-xs uppercase tracking-wide text-ink/70">Classrooms</span>
          <button
            onClick={() => {
              setAdding((v) => !v);
              setCreateError(null);
            }}
            title="New classroom"
            aria-label="New classroom"
            className="text-ink hover:text-ink-strong cursor-pointer leading-none"
          >
            +
          </button>
        </div>

        {/* Inline create form */}
        {adding && (
          <form onSubmit={handleCreate} className="px-2 mb-2 flex flex-col gap-1">
            <input
              autoFocus
              value={name}
              disabled={saving}
              onChange={(e) => setName(e.target.value)}
              placeholder="Classroom name"
              className="w-full rounded border border-line bg-canvas px-2 py-1 text-sm text-ink-strong placeholder:text-ink/40 focus:outline-none focus:border-accent disabled:opacity-50"
            />
            {createError && <p className="text-xs text-red-400">{createError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="rounded bg-accent px-2 py-1 text-xs text-onyx-50 hover:bg-bitter-chocolate-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Adding…" : "Add"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setName("");
                  setCreateError(null);
                }}
                className="rounded px-2 py-1 text-xs text-ink hover:text-ink-strong cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* List / states */}
        <div className="overflow-y-auto themed-scroll">
          {loading ? (
            <p className="px-2 py-1 text-sm text-ink/60">Loading…</p>
          ) : error ? (
            <p className="px-2 py-1 text-sm text-red-400">{error}</p>
          ) : classrooms.length === 0 ? (
            <p className="px-2 py-1 text-sm text-ink/60">
              No classrooms yet. Click + to create one.
            </p>
          ) : (
            <ul className="flex flex-col">
              {classrooms.map((c) => (
                <li key={c.id}>
                  <NavLink
                    to={`/classrooms/${c.id}`}
                    className={({ isActive }) =>
                      `block px-2 py-1 rounded text-sm truncate cursor-pointer hover:bg-accent-soft hover:text-ink-strong ${
                        isActive ? "bg-accent-soft text-ink-strong" : ""
                      }`
                    }
                  >
                    {c.name}
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* User footer */}
      <div className="border-t border-line pt-3 px-1 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-xs text-ink-strong shrink-0">
          {(user?.name ?? "?").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-ink-strong truncate">{user?.name ?? "Signed in"}</p>
          {user?.email && <p className="text-xs text-ink/60 truncate">{user.email}</p>}
        </div>
      </div>
    </div>
  );
}
