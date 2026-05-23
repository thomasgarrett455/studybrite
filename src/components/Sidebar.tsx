export default function Sidebar() {
  return (
    <div className="flex flex-col h-full p-3 gap-4">
      <div className="w-full flex items-center">
        <div className="flex-1" />
          <span className="text-ink-strong font-semibold">StudyBrite</span>
          <div className="flex-[2.5] flex justify-end">
          <button className="hover:text-ink-strong pr-2">⚙</button>
          </div>
        </div>
      <div className="h-full">
        <button className="w-full flex items-center gap-2 px-2 py-1 hover:bg-accent-soft hover:text-ink-strong">
          <span>+</span>New chat
          </button>
        <details className="group">
          <summary className="w-full flex items-center gap-2 px2 py-1 rounded cursor-pointer
                              list-none [&::-webkit-details-marker]:hidden
                              hover:bg-accent-soft hover:text-ink-strong">
            <span className="transition-transform group-open:rotate-90">▸</span>
            Chats
          </summary>
          <ul className="mt-1 pl-4">
            <li className="px-2 py-1 rounded cursor-pointer hover:bg-accent-soft hover:text-ink-strong">Chat 1</li>
            <li className="px-2 py-1 rounded cursor-pointer hover:bg-accent-soft hover:text-ink-strong">Chat 2</li>
            <li className="px-2 py-1 rounded cursor-pointer hover:bg-accent-soft hover:text-ink-strong">Chat 3</li>
          </ul>
        </details>
      </div>
    </div>
  )
}