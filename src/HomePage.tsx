import Sidebar from "./components/Sidebar"

export default function HomePage() {
  return (
    <div className="flex h-screen bg-canvas text-ink">
      <aside className="w-64 border-r border-line">
        <Sidebar />
      </aside>

      <main className="grow">
        {/* Chat area */}
      </main>
    </div>
  )
}