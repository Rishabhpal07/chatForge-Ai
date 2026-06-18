"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { Icon } from "./Icon";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", exact: true },
  { href: "/dashboard/bots", label: "My Chatbots", icon: "smart_toy" },
  { href: "/dashboard/knowledge", label: "Knowledge Base", icon: "database" },
  { href: "/dashboard/history", label: "Conversations", icon: "chat" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "analytics" },
  { href: "/dashboard/billing", label: "Billing", icon: "payments" },
  { href: "/dashboard/team", label: "Team", icon: "group" },
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="fixed left-0 top-0 z-50 hidden h-full w-64 flex-col border-r border-outline-variant bg-surface-container-low md:flex">
      {/* Brand */}
      <div className="flex items-center gap-3 p-lg">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-container">
          <Icon name="smart_toy" filled className="text-on-primary-container" />
        </div>
        <h1 className="font-display text-headline-md font-bold text-on-surface">ChatForge AI</h1>
      </div>

      {/* Nav */}
      <nav className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-md py-sm">
        {NAV.map(({ href, label, icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-body-md transition-colors duration-200 ${
                active
                  ? "active-nav-glow bg-primary-container text-on-primary-container"
                  : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              }`}
            >
              <Icon name={icon} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="space-y-2 border-t border-outline-variant p-md">
        <Link
          href="/dashboard/bots?new=1"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-container py-3 font-bold text-on-primary-container transition-all hover:opacity-90 active:scale-95"
        >
          <Icon name="add_circle" filled />
          Create Chatbot
        </Link>
        <div className="flex items-center gap-3 px-2 py-2 text-on-surface-variant">
          <UserButton
            appearance={{ elements: { rootBox: "flex", userButtonAvatarBox: "w-7 h-7" } }}
          />
          <OrganizationSwitcher
            hidePersonal
            afterCreateOrganizationUrl="/dashboard"
            afterSelectOrganizationUrl="/dashboard"
            appearance={{
              elements: {
                rootBox: "flex items-center",
                organizationSwitcherTrigger: "text-on-surface-variant text-body-sm",
              },
            }}
          />
        </div>
      </div>
    </aside>
  );
}
