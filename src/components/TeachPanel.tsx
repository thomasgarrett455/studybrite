import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import ChatInput from "./ChatInput"
import {
  sendTeach,
  assessTeach,
  getTeachSession,
  listTeachSessions,
  messageFor,
  type TeachAssessment,
  type TeachSessionSummary,
} from "../lib/api"

type Message = { role: "user" | "assistant"; content: string }

// Which screen teach mode is showing. Browse is the hub; chat is one session —
// brand new (no conversationId) or an existing one being resumed/reviewed.
type View =
  | { kind: "browse" }
  | { kind: "chat"; conversationId?: number }

// One colored section of the assessment card; hidden entirely when empty.
function AssessmentList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <span className={`text-xs font-medium ${tone}`}>{title}</span>
      <ul className="flex flex-col gap-1 list-disc pl-5">
        {items.map((item, i) => (
          <li key={i} className="text-sm">
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function AssessmentCard({ assessment }: { assessment: TeachAssessment }) {
  return (
    <div className="rounded-2xl border border-ink/10 p-4 flex flex-col gap-3">
      <span className="text-xs uppercase tracking-wide text-ink/50">Assessment</span>
      <p className="text-sm text-ink-strong">{assessment.verdict}</p>
      <AssessmentList title="What you got right" items={assessment.correct} tone="text-green-600" />
      <AssessmentList title="What was incorrect" items={assessment.incorrect} tone="text-red-600" />
      <AssessmentList title="What you didn't mention" items={assessment.missing} tone="text-amber-600" />
    </div>
  )
}

// M5 teach-the-bot: the user teaches; the bot plays curious student and probes.
// The hub lists past sessions; opening one (or starting fresh) shows the chat.
export default function TeachPanel({ classroomId }: { classroomId: number }) {
  const [view, setView] = useState<View>({ kind: "browse" })
  const [sessions, setSessions] = useState<TeachSessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Refetch whenever the hub is shown so a session started/assessed in the
  // chat view appears in the list on the way back.
  useEffect(() => {
    if (view.kind !== "browse") return
    let active = true
    setLoading(true)
    listTeachSessions(classroomId)
      .then((res) => active && setSessions(res.sessions))
      .catch((err) => active && setError(messageFor(err)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [classroomId, view])

  if (view.kind === "chat") {
    return (
      <TeachChat
        classroomId={classroomId}
        conversationId={view.conversationId}
        onBack={() => setView({ kind: "browse" })}
      />
    )
  }

  return (
    <div className="h-full overflow-y-auto themed-scroll">
      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg text-ink-strong">Teach sessions</h2>
            <p className="text-sm text-ink/70">
              Explain a topic to a curious AI student, then get graded on your explanation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setView({ kind: "chat" })}
            className="shrink-0 rounded-xl bg-accent-soft text-ink-strong px-4 py-1.5 text-sm cursor-pointer"
          >
            New session
          </button>
        </header>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {loading ? (
          <p className="text-sm text-ink/70">Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-ink/70">
            No sessions yet. Start one and teach the bot something from this classroom.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li
                key={s.conversationId}
                className="rounded-xl border border-ink/10 px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <span className="block text-sm text-ink-strong truncate">
                    {s.topic ?? "Untitled session"}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-ink/50">
                    {new Date(s.updatedAt).toLocaleDateString()}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                        s.assessedAt
                          ? "border border-line text-ink/70"
                          : "bg-accent-soft text-ink-strong"
                      }`}
                    >
                      {s.assessedAt ? "Assessed" : "In progress"}
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setView({ kind: "chat", conversationId: s.conversationId })}
                  className="shrink-0 rounded-xl bg-accent-soft text-ink-strong px-3 py-1.5 text-sm cursor-pointer"
                >
                  {s.assessedAt ? "Review" : "Resume"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// One teach session: the first message declares the topic; "Assess me" ends
// and grades it. With a conversationId the transcript is loaded from the server.
function TeachChat({
  classroomId,
  conversationId: initialId,
  onBack,
}: {
  classroomId: number
  conversationId?: number
  onBack: () => void
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationId, setConversationId] = useState<number | undefined>(initialId)
  const [topic, setTopic] = useState<string | null>(null)
  const [assessment, setAssessment] = useState<TeachAssessment | null>(null)
  const [loading, setLoading] = useState(Boolean(initialId))
  const [sending, setSending] = useState(false)
  const [assessing, setAssessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!initialId) return
    let active = true
    getTeachSession(classroomId, initialId)
      .then((res) => {
        if (!active) return
        setTopic(res.session.topic)
        setAssessment(res.session.assessment)
        setMessages(
          res.session.messages.map((m) => ({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.text,
          }))
        )
      })
      .catch((err) => active && setError(messageFor(err)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [classroomId, initialId])

  // Keep the latest message (or the assessment) in view as the thread grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, assessment])

  const hasMessages = messages.length > 0
  // Gradeable once at least one full exchange exists and it isn't graded yet.
  const canAssess = Boolean(conversationId) && !assessment && messages.length >= 2

  async function handleSend(text: string) {
    setError(null)
    setMessages((prev) => [...prev, { role: "user", content: text }])
    setSending(true)
    try {
      const res = await sendTeach(classroomId, text, conversationId)
      setConversationId(res.conversationId)
      setTopic(res.topic)
      setMessages((prev) => [...prev, { role: "assistant", content: res.answer }])
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setSending(false)
    }
  }

  async function handleAssess() {
    if (!conversationId) return
    setError(null)
    setAssessing(true)
    try {
      const res = await assessTeach(classroomId, conversationId)
      setAssessment(res.assessment)
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setAssessing(false)
    }
  }

  function startNewSession() {
    setMessages([])
    setConversationId(undefined)
    setTopic(null)
    setAssessment(null)
    setError(null)
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-ink/50">
        Loading…
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between gap-2 px-12 pt-4">
        <div className="min-w-0 flex items-center gap-1">
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 rounded-xl px-3 py-1.5 text-sm text-ink hover:text-ink-strong cursor-pointer"
          >
            ← Sessions
          </button>
          <span className="text-sm text-ink/70 truncate">
            {topic ? `Teaching: ${topic}` : hasMessages ? "Teach session" : ""}
          </span>
        </div>
        {canAssess && (
          <button
            type="button"
            onClick={handleAssess}
            disabled={assessing || sending}
            className="shrink-0 rounded-xl bg-accent-soft text-ink-strong px-4 py-1.5 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {assessing ? "Assessing…" : "Assess me"}
          </button>
        )}
      </div>
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
                <div className="self-start max-w-[90%] text-sm text-ink/50">Thinking…</div>
              )}
              {assessing && (
                <div className="self-start max-w-[90%] text-sm text-ink/50">
                  Grading your explanation…
                </div>
              )}
              {assessment && (
                <>
                  <AssessmentCard assessment={assessment} />
                  <button
                    type="button"
                    onClick={startNewSession}
                    className="self-start rounded-xl bg-accent-soft text-ink-strong px-4 py-1.5 text-sm cursor-pointer"
                  >
                    Start a new session
                  </button>
                </>
              )}
              {error && <div className="self-start max-w-[90%] text-sm text-red-600">{error}</div>}
              <div ref={bottomRef} />
            </div>
          </div>
          {!assessment && (
            <div className="px-12 py-6">
              <ChatInput disabled={sending || assessing} onSend={handleSend} />
            </div>
          )}
        </>
      ) : (
        <div className="grow flex flex-col items-center justify-center gap-6 px-12">
          <h1 className="text-2xl text-ink-strong">Teach me something</h1>
          <div className="flex flex-col items-center gap-2">
            <ChatInput disabled={sending} onSend={handleSend} />
            {error ? (
              <p className="text-xs text-red-600">{error}</p>
            ) : (
              <p className="text-xs italic text-ink">
                Tell me the topic you want to be assessed on, then explain it like I've never
                heard of it.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}