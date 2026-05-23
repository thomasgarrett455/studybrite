import ChatInput from "./ChatInput"

export default function ChatArea() {
  const hasMessages = false

  return (
    <div className="flex flex-col h-full">
      {hasMessages ? (
        <>
          <div className="grow overflow-y-auto px-12 py-6">
            <div className="max-w-3xl mx-auto">{/* messages later */}</div>
          </div>
          <div className="px-12 py-6">
            <ChatInput placeholder="Ask anything..." />
          </div>
        </>
      ) : (
        <div className="grow flex flex-col items-center justify-center gap-6 px-12">
          <h1 className="text-2xl text-ink-strong">Where should we get started?</h1>
          <ChatInput  />
        </div>
      )}
    </div>
  )
}
