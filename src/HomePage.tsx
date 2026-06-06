import { useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import ChatArea from "./components/ChatArea";

export default function HomePage() {
  const navigate = useNavigate();

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex h-screen bg-canvas text-ink">
      <aside className="w-48 border-r border-line">
        <Sidebar />
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
          <ChatArea />
        </div>
      </main>
    </div>
  );
}
