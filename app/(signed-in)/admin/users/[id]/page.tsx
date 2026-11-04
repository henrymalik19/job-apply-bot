import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminContext } from "@/server/auth/require-owner";
import { displayName, getUserProfile } from "@/server/modules/admin/admin.service";
import { APP_STATUSES } from "@/server/modules/applications/application-status";
import { listApplications } from "@/server/modules/applications/applications.service";
import { ago } from "@/shared/format";
import { DetailSkeleton } from "../../../_components/skeletons";
import { statusInfo, TONE_BADGE } from "../../../_components/status";

type Params = Promise<{ id: string }>;

async function User({ params }: { params: Params }) {
  const [{ admin }, { id }] = await Promise.all([adminContext(), params]);
  const { data: user } = await admin.from("users").select("id, created_at").eq("id", id).maybeSingle();
  if (!user) notFound();
  const [profile, apps] = await Promise.all([getUserProfile(admin, id), listApplications(admin, id, APP_STATUSES)]);
  apps.sort((a, b) => b.last_status_at.localeCompare(a.last_status_at));
  const now = new Date();
  const place = [profile?.city, profile?.state, profile?.country].filter(Boolean).join(", ");
  const facts: [string, React.ReactNode][] = [
    ["Email", profile?.email],
    ["Phone", profile?.phone],
    ["Location", place],
    ["Headline", profile?.headline],
    ["LinkedIn", profile?.linkedin_url && <a href={profile.linkedin_url} target="_blank" rel="noreferrer" className="hover:underline">{profile.linkedin_url}</a>],
    ["Joined", ago(user.created_at, now)],
  ];
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{displayName(profile)}</h1>
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Applications ({apps.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {apps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No applications yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Changed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apps.map((a) => {
                    const info = statusInfo(a.status);
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="max-w-md whitespace-normal">
                          <Link href={`/admin/applications/${a.id}`} className="font-medium hover:underline">{a.job.title}</Link>
                          <span className="block text-xs text-muted-foreground">{a.job.company_name}</span>
                        </TableCell>
                        <TableCell><Badge className={TONE_BADGE[info.tone]}>{info.label}</Badge></TableCell>
                        <TableCell className="text-right text-muted-foreground">{ago(a.last_status_at, now)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                {facts.map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="min-w-0 break-words">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <Link href={`/admin/runs?user=${id}`} className={`${buttonVariants({ variant: "outline", size: "sm" })} self-start`}>
            Their runner log
          </Link>
        </div>
      </div>
    </>
  );
}

/** One user, for the admin: their profile and every application, read only. */
export default function AdminUserPage({ params }: { params: Params }) {
  return (
    <main className="flex flex-col gap-4">
      <Link href="/admin/users" className={`${buttonVariants({ variant: "ghost", size: "sm" })} -mb-2 self-start`}>
        <ArrowLeft /> Users
      </Link>
      <Suspense fallback={<DetailSkeleton />}>
        <User params={params} />
      </Suspense>
    </main>
  );
}
