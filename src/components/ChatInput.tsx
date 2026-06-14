import { useRef } from "react"

type Props = {
    placeholder?: string
    disabled?: boolean
    onSend?: (text: string) => void
}

const MAX_HEIGHT = 160 // px — cap before it scrolls

export default function InputBar({ placeholder = "Ask anything...", disabled = false, onSend }: Props) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    function handleInput() {
        const el = textareaRef.current
        if (!el) return
        el.style.height = "auto"
        if (el.scrollHeight > MAX_HEIGHT) {
            el.style.height = `${MAX_HEIGHT}px`
            el.style.overflowY = "auto"
        } else {
            el.style.height = `${el.scrollHeight}px`
            el.style.overflowY = "hidden"
        }
    }

    function send() {
        const el = textareaRef.current
        if (!el) return
        const text = el.value.trim()
        if (!text || disabled) return
        onSend?.(text)
        el.value = ""
        el.style.height = "auto" // reset the auto-grow
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            send()
        }
    }

    return (
        <div className="flex items-end border border-line rounded-md w-105 mx-auto">
            <textarea
                ref={textareaRef}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                rows={1}
                placeholder={placeholder}
                className="themed-scroll grow px-3 py-1.5 outline-none text-sm resize-none bg-transparent overflow-hidden disabled:opacity-50"
            />
            <button
                onClick={send}
                disabled={disabled}
                className="shrink-0 text-ink-strong text-sm rounded-md px-3 py-1.5 hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-default"
            >
                Send
            </button>
        </div>
    )
}