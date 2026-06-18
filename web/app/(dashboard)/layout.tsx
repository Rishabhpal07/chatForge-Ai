import { Sidebar } from "@/src/components/Sidebar";
import { Icon } from "@/src/components/Icon";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-base">
      <Sidebar />

      {/* Top app bar */}
      <header className="sticky top-0 z-40 ml-0 flex w-full items-center justify-between border-b border-white/5 bg-surface/70 px-lg py-sm backdrop-blur-xl md:ml-64 md:w-[calc(100%-16rem)]">
        <div className="flex items-center gap-4">
          <h2 className="font-display text-headline-md font-bold text-on-surface">Dashboard</h2>
          <div className="linear-border flex cursor-pointer items-center gap-2 rounded-full bg-surface-container-highest px-3 py-1 transition-colors hover:bg-surface-bright">
            <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
            <span className="font-label-mono text-xs uppercase tracking-wider text-on-surface-variant">
              Live
            </span>
          </div>
        </div>
        <div className="flex items-center gap-lg">
          <div className="relative hidden sm:block">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
            />
            <input
              className="w-64 rounded-lg border border-outline-variant bg-surface-container-low py-2 pl-10 pr-4 text-body-sm outline-none transition-all focus:ring-2 focus:ring-primary-container"
              placeholder="Search bots or data..."
              type="text"
            />
          </div>
          <button className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high">
            <Icon name="notifications" />
          </button>
          <button className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high">
            <Icon name="help" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="ml-0 max-w-[1600px] space-y-lg p-lg md:ml-64">{children}</main>
    </div>
  );
}
