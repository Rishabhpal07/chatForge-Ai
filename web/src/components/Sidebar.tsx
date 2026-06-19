"use client";

import { useEffect, useState } from "react";
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
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* Mobile top bar (hamburger) — visible below md only */}
      <div className="fixed inset-x-0 top-0 z-40 flex items-center gap-3 border-b border-outline-variant bg-surface-container-low px-4 py-3 md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-1 mt-2 text-on-surface transition-colors hover:bg-surface-container-high"
        >
          <Icon name="menu" />
        </button>
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="ChatForge AI" className="h-7 w-7 rounded-sm" />
          <span className="font-display font-bold text-on-surface">ChatForge AI</span>
        </Link>
      </div>

      {/* Backdrop (mobile, when drawer open) */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar — fixed drawer on mobile, always-visible on md+ */}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-outline-variant bg-surface-container-low transition-transform duration-300 md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        {/* Brand */}
        <div className="flex items-center justify-between p-lg">
          <Link href="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="ChatForge AI Logo" className="h-8 w-8 rounded-sm" />
            <h1 className="font-display text-headline-md font-bold text-on-surface">ChatForge AI</h1>
          </Link>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="rounded-lg p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high md:hidden"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* Nav */}
        <nav className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-md py-sm">
          {NAV.map(({ href, label, icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-body-md transition-colors duration-200 ${active
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
            <UserButton appearance={{ elements: { rootBox: "flex", userButtonAvatarBox: "w-7 h-7" } }} />
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
    </>
  );
}
