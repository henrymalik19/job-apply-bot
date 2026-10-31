import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/server/auth/require-owner";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = {
  title: "New password · Job Search Autopilot",
  robots: { index: false, follow: false },
};

/** Sets a new password; reached from a reset link, which signs the owner in. */
export default async function ResetPage() {
  const owner = await requireOwner();
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>New password</CardTitle>
          <CardDescription>For {owner.email}.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResetForm />
        </CardContent>
      </Card>
    </main>
  );
}
