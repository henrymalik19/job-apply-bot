import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · Job Search Autopilot",
  robots: { index: false, follow: false },
};

/** Admin sign-in page. */
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-xl font-semibold">Job Search Autopilot</h1>
      <LoginForm />
    </main>
  );
}
