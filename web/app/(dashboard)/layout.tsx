import { auth } from "@clerk/nextjs/server";
import { CreateOrganization } from "@clerk/nextjs";
import { Sidebar } from "@/src/components/Sidebar";
import { Icon } from "@/src/components/Icon";

// Dark theme for Clerk's prebuilt widgets so they match the Forge design.
const clerkDark = {
  variables: {
    colorPrimary: "#4f46e5",
    colorBackground: "#13121b",
    colorInputBackground: "#1c1b26",
    colorInputText: "#f4f4f5",
    colorText: "#f4f4f5",
    colorTextSecondary: "#a1a1aa",
    borderRadius: "0.75rem",
  },
  elements: {
    card: "bg-transparent shadow-none",
    rootBox: "w-full",
  },
} as const;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId, orgId } = await auth();

  // A tenant is a Clerk Organization. If the signed-in user has no active org,
  // gate the dashboard behind workspace creation so requireTenant() never errors.
  if (userId && !orgId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base p-4">
        <div className="glass-card w-full max-w-[30rem] rounded-3xl p-8">
          <div className="mb-6 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-container">
              <Icon name="workspaces" filled className="text-white" />
            </div>
            <div>
              <h1 className="font-display text-headline-md font-bold text-on-surface">
                Create your workspace
              </h1>
              <p className="text-body-sm text-on-surface-variant">
                Your chatbots live inside a workspace. Create one to continue.
              </p>
            </div>
          </div>
          <CreateOrganization
            afterCreateOrganizationUrl="/dashboard"
            skipInvitationScreen
            appearance={clerkDark}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base">
      <Sidebar />

      {/* Top app bar — desktop only (mobile uses the Sidebar's hamburger bar) */}
      <header className="sticky top-0 z-40 ml-0 hidden w-full items-center justify-between border-b border-white/5 bg-surface/70 px-lg py-sm backdrop-blur-xl md:ml-64 md:flex md:w-[calc(100%-16rem)]">
        <div className="flex items-center gap-4">
          <h2 className="font-display text-headline-md font-bold text-on-surface">Dashboard</h2>
          <div className="linear-border flex items-center gap-2 rounded-full bg-surface-container-highest px-3 py-1">
            <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
            <span className="font-label-mono text-xs uppercase tracking-wider text-on-surface-variant">
              Live
            </span>
          </div>
        </div>
      </header>

      {/* Main content — extra top padding on mobile to clear the fixed hamburger bar */}
      <main className="ml-0 max-w-[1600px] space-y-lg px-lg pb-lg pt-20 md:ml-64 md:pt-lg">
        {children}
      </main>
    </div>
  );
}
