export default function Loading() {
  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_top,_#E6F4FF_0%,_#F8FAFC_45%,_#FFFFFF_100%)] pb-24">
      <div className="h-64 bg-white/70 border-b border-white/60 animate-pulse" />
      <div className="p-4 space-y-4">
        <div className="h-8 w-2/3 rounded-2xl bg-white/80 animate-pulse" />
        <div className="h-20 rounded-2xl bg-white/80 animate-pulse" />
        <div className="h-32 rounded-2xl bg-white/80 animate-pulse" />
      </div>
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[env(safe-area-inset-bottom)] bg-white/80 border-t border-white/60">
        <div className="h-14 rounded-2xl bg-white/80 animate-pulse" />
      </div>
    </div>
  );
}
