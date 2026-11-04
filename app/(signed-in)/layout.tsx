import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { requireOwner } from "@/server/auth/require-owner";
import { Logo } from "@/components/brand/logo";
import { signOut } from "../login/actions";
import { MobileMenu } from "./_components/mobile-menu";
import { NavLinks, NavList } from "./_components/nav-links";

export const metadata: Metadata = {
  title: "Jobrx",
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

/** Signed-in shell for /app and /admin: a left sidebar (top bar on small screens) with navigation and the signed-in account. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="relative flex items-center justify-between gap-4 border-b px-4 py-3 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:flex-col md:items-stretch md:justify-start md:border-r md:border-b-0 md:px-3 md:py-5">
        <Link href="/app" className="md:px-3" aria-label="Jobrx home"><Logo /></Link>
        {/* Phones: a Menu button with every page and the account. */}
        <Suspense fallback={null}>
          <MobileMenu>
            <Suspense fallback={null}>
              <Account />
            </Suspense>
          </MobileMenu>
        </Suspense>
        <div className="hidden md:mt-6 md:block md:flex-1">
          {/* usePathname() needs a Suspense boundary on dynamic routes (Cache Components). */}
          <Suspense fallback={<NavList pathname="" />}>
            <NavLinks />
          </Suspense>
        </div>
        <div className="hidden md:block md:px-3">
          <Suspense fallback={null}>
            <Account />
          </Suspense>
        </div>
      </aside>
      <div className="w-full min-w-0 flex-1 px-4 py-8 md:h-screen md:overflow-y-auto md:px-8">
        {children}
      </div>
    </div>
  );
}
