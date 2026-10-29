import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { requireOwner } from "@/server/auth/require-owner";
import { signOut } from "../login/actions";
import { NavLinks } from "./_components/nav-links";

export const metadata: Metadata = {
  title: "Admin · Job Search Autopilot",
  robots: { index: false, follow: false },
};

async function Account() {
  const owner = await requireOwner();
  return (
    <form action={signOut} className="flex items-center gap-2 text-sm text-muted-foreground md:flex-col md:items-start">
      <span className="hidden truncate md:block md:max-w-full">{owner.email}</span>
      <Button type="submit" variant="ghost" size="sm" className="md:-ml-2">Sign out</Button>
    </form>
  );
}

/** Admin shell: a left sidebar (top bar on small screens) with navigation and the signed-in account. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="flex items-center justify-between gap-4 border-b px-4 py-3 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:flex-col md:items-stretch md:justify-start md:border-r md:border-b-0 md:px-3 md:py-5">
        <Link href="/admin" className="px-3 font-semibold tracking-tight">Job Search Autopilot</Link>
        <div className="md:mt-6 md:flex-1">
          <NavLinks />
        </div>
        <div className="md:px-3">
          <Suspense fallback={null}>
            <Account />
          </Suspense>
        </div>
      </aside>
      <div className="w-full min-w-0 flex-1 px-4 py-8 md:px-8">
        <div className="max-w-6xl">{children}</div>
      </div>
    </div>
  );
}
