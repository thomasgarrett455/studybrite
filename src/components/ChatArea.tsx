import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import ChatInput from "./ChatInput"
import { sendChat, ApiError, type ChatSourceKind, type ChatCitation } from "../lib/api"

type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; source: ChatSourceKind; sources: ChatCitation[] }

type Props = {
  classroomId: number
}

// Small label shown above an assistant answer to signal where it came from.
const SOURCE_BADGE: Record<ChatSourceKind, string> = {
  materials: "From your materials",
  training: "General knowledge",
  web: "Web search",
  off_topic: "Off topic",
}

export default function ChatArea({ classroomId }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationId, setConversationId] = useState<number | undefined>(undefined)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const hasMessages = messages.length > 0

  // Keep the latest message in view as the thread grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function handleSend(text: string) {
    setError(null)
    setMessages((prev) => [...prev, { role: "user", content: text }])
    setSending(true)
    try {
      const res = await sendChat(classroomId, text, conversationId)
      setConversationId(res.conversationId)
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.answer, source: res.source, sources: res.sources },
      ])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    } finally {
      setSending(false)
    }
  }

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
                  <div key={i} className="self-start max-w-[90%] flex flex-col gap-2">
                    <span className="text-xs uppercase tracking-wide text-ink/50">
                      {SOURCE_BADGE[message.source]}
                    </span>
                    <div className="markdown prose prose-sm max-w-none leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                    {message.source === "web" && message.sources.length > 0 && (
                      <div className="flex flex-col gap-1 mt-1">
                        <span className="text-xs text-ink/50">Sources</span>
                        <ol className="flex flex-col gap-1">
                          {message.sources.map((s, j) => (
                            <li key={j} className="text-xs">
                              <a
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent underline underline-offset-2 hover:opacity-80"
                              >
                                {s.title || s.url}
                              </a>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                )
              )}
              {sending && (
                <div className="self-start max-w-[90%] text-sm text-ink/50">Thinking…</div>
              )}
              {error && <div className="self-start max-w-[90%] text-sm text-red-600">{error}</div>}
              <div ref={bottomRef} />
            </div>
          </div>
          <div className="px-12 py-6">
            <ChatInput disabled={sending} onSend={handleSend} />
          </div>
        </>
      ) : (
        <div className="grow flex flex-col items-center justify-center gap-6 px-12">
          <h1 className="text-2xl text-ink-strong">Where should we get started?</h1>
          <div className="flex flex-col items-center gap-2">
            <ChatInput disabled={sending} onSend={handleSend} />
            {error ? (
              <p className="text-xs text-red-600">{error}</p>
            ) : (
              <p className="text-xs italic text-ink">
                "Imagination is more important than knowledge" — Albert Einstein
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}