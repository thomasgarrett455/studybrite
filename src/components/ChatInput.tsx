type Props = {
    placeholder?: string
}

export default function InputBar({ placeholder = "\"Imagination is more important than knowledge\" -Albert Einstein" }: Props) {
    return (
        <div className="flex border border-line rounded-md w-105 mx-auto items-center">
            <input className="grow px-2 py-1 outline-none text-xs" type="text" placeholder={placeholder}/>
            <button className="shrink-0 text-ink-strong rounded-md px-3 py-1.5 hover:opacity-90 cursor-pointer">Send</button>
        </div>
    )
}
