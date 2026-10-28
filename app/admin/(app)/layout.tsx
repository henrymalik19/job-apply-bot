import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireOwner } from "@/lib/auth";
import { signOut } from "../login/actions";

export const metadata: Metadata = {
  title: "Admin · Job Search Autopilot",
  robots: { index: false, follow: false },
};

async function Account() {
  const owner = await requireOwner();
  return (
    <form action={signOut} className="flex items-center gap-3 text-sm text-zinc-500">
      <span>{owner.email}</span>
      <button type="submit" className="underline">Sign out</button>
    </form>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-8 flex items-center justify-between gap-4">
        <nav className="flex gap-4 text-sm font-medium">
          <Link href="/admin">Overview</Link>
        </nav>
        <Suspense fallback={null}>
          <Account />
        </Suspense>
      </header>
      {children}
    </div>
  );
}
