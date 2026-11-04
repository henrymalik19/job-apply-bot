"use client";

import { Briefcase, Building2, ClipboardCheck, HeartPulse, LayoutDashboard, ScrollText, Users, Send, Settings, SlidersHorizontal, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/cn";

const SECTIONS = [
  {
    title: "Workspace",
    items: [
      { href: "/app", label: "Overview", icon: LayoutDashboard },
      { href: "/app/todo", label: "To do", icon: ClipboardCheck },
      { href: "/app/applying", label: "Applying", icon: Send },
      { href: "/app/jobs", label: "Jobs", icon: Briefcase },
      { href: "/app/search", label: "Search", icon: SlidersHorizontal },
      { href: "/app/profile", label: "Profile", icon: UserRound },
      { href: "/app/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/admin/health", label: "Health", icon: HeartPulse },
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/runs", label: "Runs", icon: ScrollText },
      { href: "/admin/companies", label: "Companies", icon: Building2 },
    ],
  },
] as const;

/**
 * Sidebar navigation: the user's workspace (/app) and app administration
 * (/admin). Highlights the current page. Horizontal on small screens.
 */
export function NavLinks() {
  return <NavList pathname={usePathname()} />;
}

/**
 * The nav itself, given the current path ("" highlights nothing, e.g. as a Suspense fallback).
 *
 * @param vertical - Stacked with section titles at every width (the phone menu).
 */
export function NavList({ pathname, vertical = false }: { pathname: string; vertical?: boolean }) {
  return (
    <nav className={cn("flex flex-col gap-5", !vertical && "hidden md:flex")}>
      {SECTIONS.map((section) => (
        <div key={section.title} className="flex flex-col gap-1">
          <div className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {section.title}
          </div>
          {section.items.map(({ href, label, icon: Icon }) => {
            const active = href === "/app" ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active && "bg-muted text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
