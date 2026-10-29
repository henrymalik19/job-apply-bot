"use client";

import { Briefcase, Building2, HeartPulse, LayoutDashboard, Settings, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/cn";

const SECTIONS = [
  {
    title: "Workspace",
    items: [
      { href: "/app", label: "Overview", icon: LayoutDashboard },
      { href: "/app/jobs", label: "Jobs", icon: Briefcase },
      { href: "/app/search", label: "Search", icon: SlidersHorizontal },
      { href: "/app/companies", label: "Companies", icon: Building2 },
      { href: "/app/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    title: "Admin",
    items: [{ href: "/admin/health", label: "Health", icon: HeartPulse }],
  },
] as const;

/**
 * Sidebar navigation: the user's workspace (/app) and app administration
 * (/admin). Highlights the current page. Horizontal on small screens.
 */
export function NavLinks() {
  return <NavList pathname={usePathname()} />;
}

/** The nav itself, given the current path ("" highlights nothing, e.g. as a Suspense fallback). */
export function NavList({ pathname }: { pathname: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:gap-5 md:overflow-visible">
      {SECTIONS.map((section) => (
        <div key={section.title} className="flex gap-1 md:flex-col">
          <div className="hidden px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground md:block">
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
