import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createServiceClient } from "@/server/db/service-client";
import { getPublicPage } from "@/server/modules/public-page/public-page.service";
import { serverEnv } from "@/shared/env";

export const metadata: Metadata = {
  title: "Job search status",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<string, string> = {
  submitted: "Sent",
  confirmed: "Received",
  responded: "Responded",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
};

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—";

async function PublicStatus() {
  await connection();
  const now = new Date();
  const page = await getPublicPage(createServiceClient(serverEnv()), now);
  if (!page) notFound();
  const max = Math.max(1, ...page.sentPerDay.map((d) => d.count));

  return (
    <>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {page.counts.map((c) => (
          <Card key={c.label} size="sm">
            <CardHeader>
              <CardDescription>{c.label}</CardDescription>
              <div className="text-2xl font-semibold tabular-nums">{c.value.toLocaleString()}</div>
            </CardHeader>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Sent per day</CardTitle>
          <CardDescription>Last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-32 items-end gap-1" role="img" aria-label="Applications sent per day over the last 30 days">
            {page.sentPerDay.map((d) => (
              <div
                key={d.date}
                title={`${shortDate(d.date)}: ${d.count}`}
                className="flex-1 rounded-sm bg-primary/80"
                style={{ height: `${Math.max(2, (d.count / max) * 100)}%`, opacity: d.count ? 1 : 0.15 }}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Applications</CardTitle>
        </CardHeader>
        <CardContent>
          {page.applications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications sent yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.applications.map((a, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{a.job_title}</TableCell>
                    <TableCell>{a.company_name}</TableCell>
                    <TableCell className="tabular-nums">{shortDate(a.submitted_at)}</TableCell>
                    <TableCell>{STATUS_LABEL[a.status] ?? a.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/**
 * Public status page: headline counts, sends per day and the list of sent
 * applications. Off by default (404) until switched on in Settings; reads only
 * the public_status view, server-side.
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Job search status</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <PublicStatus />
      </Suspense>
    </main>
  );
}
