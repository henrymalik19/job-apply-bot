import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Reset password · Job Search Autopilot",
  robots: { index: false, follow: false },
};

/** Shown when /auth/confirm sent the user back with a bad or expired link. */
async function ExpiredNotice({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (error !== "expired") return null;
  return <p role="alert" className="text-sm text-destructive">That link is invalid or has expired. Request a new one.</p>;
}

/** Requests a password-reset email. */
export default function ForgotPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset password</CardTitle>
          <CardDescription>We&apos;ll email you a link to set a new password.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Suspense>
            <ExpiredNotice searchParams={searchParams} />
          </Suspense>
          <ForgotForm />
          <Link href="/login" className="text-sm text-muted-foreground underline">Back to sign in</Link>
        </CardContent>
      </Card>
    </main>
  );
}
