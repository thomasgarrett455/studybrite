import Sidebar from "./components/Sidebar";
import ChatArea from "./components/ChatArea";

export default function HomePage() {
  return (
    <div className="flex h-screen bg-canvas text-ink">
      <aside className="w-48 border-r border-line">
        <Sidebar />
      </aside>

      <main className="grow">
        <ChatArea />
      </main>
    </div>
  )
}