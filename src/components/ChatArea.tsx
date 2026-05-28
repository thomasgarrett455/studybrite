import ChatInput from "./ChatInput"

type Message = {
  role: "user" | "assistant"
  content: string
}

const messages: Message[] = [
  { role: "user", content: "Can you summarize the main causes of World War I?" },
  {
    role: "assistant",
    content:
      "Sure! They're often grouped under the acronym MAIN: Militarism, Alliances, Imperialism, and Nationalism. The spark was the assassination of Archduke Franz Ferdinand in 1914, which set off the alliance system and pulled the major powers into war.",
  },
  { role: "user", content: "Quiz me on those four causes." },
  {
    role: "assistant",
    content:
      "Great — question 1 of 4: Which cause refers to the buildup of armed forces and the glorification of military power?",
  },
]

export default function ChatArea() {
  const hasMessages =  messages.length >0 //false messages.length >0

  return (
    <div className="flex flex-col h-full">
      {hasMessages ? (
        <>
          <div className="grow overflow-y-auto px-12 py-6">
            <div className="max-w-3xl mx-auto flex flex-col gap-6">
              {messages.map((message, i) => (
                <div
                  key={i}
                  className={
                    message.role === "user"
                      ? "self-end max-w-[80%] rounded-2xl bg-accent-soft text-ink-strong px-4 py-2 text-sm"
                      : "self-start max-w-[90%] text-sm leading-relaxed"
                  }
                >
                  {message.content}
                </div>
              ))}
            </div>
          </div>
          <div className="px-12 py-6">
            <ChatInput />
          </div>
        </>
      ) : (
        <div className="grow flex flex-col items-center justify-center gap-6 px-12">
          <h1 className="text-2xl text-ink-strong">Where should we get started?</h1>
          <div className="flex flex-col items-center gap-2">
            <ChatInput />
            <p className="text-xs italic text-ink">
              "Imagination is more important than knowledge" — Albert Einstein
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

