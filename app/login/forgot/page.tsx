import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Reset password · Job Search Autopilot",
  robots: { index: false, follow: false },
};

/** Requests a password-reset email. */
export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset password</CardTitle>
          <CardDescription>We&apos;ll email you a link to set a new password.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error === "expired" && (
            <p role="alert" className="text-sm text-destructive">That link is invalid or has expired. Request a new one.</p>
          )}
          <ForgotForm />
          <Link href="/login" className="text-sm text-muted-foreground underline">Back to sign in</Link>
        </CardContent>
      </Card>
    </main>
  );
}
