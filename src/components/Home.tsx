import { useEffect, useRef, useState } from "react"
import { useOutletContext } from "react-router-dom"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import ChatInput from "./ChatInput"
import { sendAssistant, messageFor, type AssistantMessage } from "../lib/api"
import type { AppOutletContext } from "../AppShell"

// Home-page command assistant (S4). Ephemeral: history lives in component
// state and is resent in full on every turn; a reload starts fresh.
export default function Home() {
  const { refreshClassrooms } = useOutletContext<AppOutletContext>()
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasMessages = messages.length > 0

  // Keep the latest message in view as the thread grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function handleSend(text: string) {
    setError(null)
    // Build the next history first — the API call needs the full array
    // including this message, not the stale `messages` from before setState.
    const next: AssistantMessage[] = [...messages, { role: "user", content: text }]
    setMessages(next)
    setSending(true)
    try {
      const res = await sendAssistant(next, pendingFiles)
      // Clear attachments only on success so a failed send keeps them for retry.
      setPendingFiles([])
      setMessages([...next, { role: "assistant", content: res.answer }])
      // The assistant may have created a classroom — keep the sidebar in sync.
      void refreshClassrooms()
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setSending(false)
    }
  }

  function handleFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    setPendingFiles((prev) => [...prev, ...picked].slice(0, 5))
    e.target.value = "" // allow re-picking the same file after removing it
  }

  function removeFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  // Attach button + pending-file chips wrapped around the shared ChatInput.
  // Lives here (not in ChatInput) so the classroom chat stays attachment-free.
  const composer = (
    <div className="flex flex-col items-center gap-2">
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {pendingFiles.map((f, i) => (
            <span
              key={i}
              className="flex items-center gap-1.5 text-xs bg-accent-soft text-ink-strong rounded-full px-2.5 py-1"
            >
              {f.name}
              <button
                onClick={() => removeFile(i)}
                className="cursor-pointer hover:opacity-70"
                aria-label={`Remove ${f.name}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
          title="Attach files"
          className="shrink-0 text-sm border border-line rounded-md px-2.5 py-1.5 hover:opacity-80 cursor-pointer disabled:opacity-50"
        >
          📎
        </button>
        <ChatInput disabled={sending} onSend={handleSend} />
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.docx,.pptx,.txt,.md"
        className="hidden"
        onChange={handleFilesPicked}
      />
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {hasMessages ? (
        <>
          <div className="grow overflow-y-auto px-12 py-6">
            <div className="max-w-3xl mx-auto flex flex-col gap-6">
              {messages.map((message, i) =>
                message.role === "user" ? (
                  <div
                    key={i}
                    className="self-end max-w-[80%] rounded-2xl bg-accent-soft text-ink-strong px-4 py-2 text-sm"
                  >
                    {message.content}
                  </div>
                ) : (
                  <div key={i} className="self-start max-w-[90%]">
                    <div className="markdown prose prose-sm max-w-none leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                )
              )}
              {sending && (
                <div className="self-start max-w-[90%] text-sm text-ink/50">Working…</div>
              )}
              {error && <div className="self-start max-w-[90%] text-sm text-red-600">{error}</div>}
              <div ref={bottomRef} />
            </div>
          </div>
          <div className="px-12 py-6">
            {composer}
          </div>
        </>
      ) : (
        <div className="grow flex flex-col items-center justify-center gap-6 px-12">
          <h1 className="text-2xl text-ink-strong">What should we do?</h1>
          <div className="flex flex-col items-center gap-2">
            {composer}
            {error ? (
              <p className="text-xs text-red-600">{error}</p>
            ) : (
              <p className="text-xs italic text-ink">
                Try: "create a class called Bio 101" or "make me a quiz on mitosis for Math"
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

