import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireOwner } from "@/server/auth/require-owner";
import { signOut } from "../login/actions";

export const metadata: Metadata = {
  title: "Admin · Job Search Autopilot",
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/companies", label: "Companies" },
  { href: "/admin/health", label: "Health" },
] as const;

async function Account() {
  const owner = await requireOwner();
  return (
    <form action={signOut} className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="hidden sm:inline">{owner.email}</span>
      <Button type="submit" variant="ghost" size="sm">Sign out</Button>
    </form>
  );
}

/** Admin shell: navigation and the signed-in account with Sign out. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-semibold tracking-tight">Job Search Autopilot</Link>
            <nav className="flex gap-1">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <Suspense fallback={null}>
            <Account />
          </Suspense>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</div>
    </div>
  );
}
