import { Outlet, useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { clearAuth } from "./lib/api";
import { useClassrooms } from "./lib/useClassrooms";

// What routed pages can reach via useOutletContext — lets the home assistant
// tell the sidebar to refetch after it creates a classroom.
export type AppOutletContext = {
  refreshClassrooms: () => Promise<void>;
};

// Persistent app frame: sidebar + a main panel that swaps via <Outlet />.
export default function AppShell() {
  const navigate = useNavigate();
  // Owned here (not in Sidebar) so routed pages can trigger a refresh.
  const classroomsState = useClassrooms();

  function handleLogout() {
    clearAuth();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex h-screen bg-canvas text-ink">
      <aside className="w-60 border-r border-line shrink-0">
        <Sidebar {...classroomsState} />
      </aside>

      <main className="grow flex flex-col min-h-0">
        <header className="flex items-center justify-end h-12 px-4 border-b border-line shrink-0">
          <button
            onClick={handleLogout}
            title="Log out"
            aria-label="Log out"
            className="flex items-center gap-1.5 text-sm text-ink hover:text-ink-strong transition-colors cursor-pointer"
          >
            <span>Log out</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18" height="18" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" x2="9" y1="12" y2="12" />
            </svg>
          </button>
        </header>

        <div className="grow min-h-0">
          <Outlet context={{ refreshClassrooms: classroomsState.refresh } satisfies AppOutletContext} />
        </div>
      </main>
    </div>
  );
}
