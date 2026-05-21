export default function ChatArea() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-12 py-6 grow overflow-y-auto">
        {/* <MessageThread />*/}
      </div>
      <div className="flex border border-line rounded-md">
          <input type="text" placeholder="Words go here..."/>
        <div>
          <button className="w-2.5 border border-line rounded-md px-1">Send</button>
        </div>
      </div>
    </div>
  )
}