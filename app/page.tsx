import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Job Search Autopilot",
  description: "Finds the jobs that fit you, prepares each application, and fills the forms for you.",
};

const STEPS = [
  { title: "Finds jobs", text: "Checks company job boards every few hours and scores each posting against your profile and what you want." },
  { title: "Prepares applications", text: "Tailors your resume and answers each form's questions from your profile, leaving you only what it can't know." },
  { title: "Fills the forms", text: "After you approve, fills the application in Chrome on your computer, and tracks the replies in your job inbox." },
];

/** Home: what the app does, and a way in. Each user's public status page lives at /u/<handle>. */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col justify-center gap-10 px-4 py-16">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Job Search Autopilot</h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Finds the jobs that fit you, prepares each application, and fills the forms for you. You approve what goes out.
        </p>
        <div>
          <Link href="/login" className={buttonVariants({ size: "lg" })}>Sign in</Link>
        </div>
      </div>
      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-1 rounded-xl border p-4">
            <span className="text-sm tabular-nums text-muted-foreground">{i + 1}</span>
            <span className="font-medium">{s.title}</span>
            <span className="text-sm text-muted-foreground">{s.text}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}
