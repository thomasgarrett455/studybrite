// Landing surface for "/" — chat is classroom-scoped, so prompt the user to
// pick or create a classroom from the sidebar before starting a study chat.
export default function Home() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 px-12 text-center">
      <h1 className="text-2xl text-ink-strong">Welcome to StudyBrite</h1>
      <p className="text-sm text-ink/70">
        Select a classroom from the sidebar — or create one — to upload materials
        and start a study chat.
      </p>
    </div>
  );
}
