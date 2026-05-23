import { useRef } from "react"

type Props = {
    placeholder?: string
}

const MAX_HEIGHT = 160 // px — cap before it scrolls

export default function InputBar({ placeholder = "Ask anything..." }: Props) {
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

    return (
        <div className="flex items-end border border-line rounded-md w-105 mx-auto">
            <textarea
                ref={textareaRef}
                onInput={handleInput}
                rows={1}
                placeholder={placeholder}
                className="themed-scroll grow px-3 py-1.5 outline-none text-sm resize-none bg-transparent overflow-hidden"
            />
            <button className="shrink-0 text-ink-strong text-sm rounded-md px-3 py-1.5 hover:opacity-90 cursor-pointer">Send</button>
        </div>
    )
}
