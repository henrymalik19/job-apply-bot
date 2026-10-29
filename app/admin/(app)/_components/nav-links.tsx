"use client";

import { HeartPulse, LayoutDashboard, Building2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/cn";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/companies", label: "Companies", icon: Building2 },
  { href: "/admin/health", label: "Health", icon: HeartPulse },
] as const;

/** Admin navigation links; highlights the current section. Vertical in the sidebar, horizontal on small screens. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 md:flex-col">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              active && "bg-muted text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
