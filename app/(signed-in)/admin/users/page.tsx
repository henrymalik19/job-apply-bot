import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminContext } from "@/server/auth/require-owner";
import { listUsers } from "@/server/modules/admin/admin.service";
import { ago } from "@/shared/format";
import { TableSkeleton } from "../../_components/skeletons";

const n = (counts: Record<string, number>, ...statuses: string[]) => statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);

async function Users() {
  const { admin } = await adminContext();
  const users = await listUsers(admin);
  const now = new Date();
  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead className="text-right">To approve</TableHead>
              <TableHead className="text-right">Applying</TableHead>
              <TableHead className="text-right">Sent</TableHead>
              <TableHead className="text-right">Interviews</TableHead>
              <TableHead className="text-right">Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <Link href={`/admin/users/${u.id}`} className="font-medium hover:underline">{u.name}</Link>
                  {u.role === "owner" && <Badge variant="outline" className="ml-2">you</Badge>}
                  {u.email && <span className="block text-xs text-muted-foreground">{u.email}</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{n(u.counts, "queued", "needs_input", "manual")}</TableCell>
                <TableCell className="text-right tabular-nums">{n(u.counts, "approved")}</TableCell>
                <TableCell className="text-right tabular-nums">{n(u.counts, "submitted", "confirmed", "responded")}</TableCell>
                <TableCell className="text-right tabular-nums">{n(u.counts, "interviewing", "offer")}</TableCell>
                <TableCell className="text-right text-muted-foreground">{u.lastActivityAt ? ago(u.lastActivityAt, now) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** Users: everyone using the app, with where their applications stand. Admin only, read only. */
export default function UsersPage() {
  return (
    <main className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">Everyone using the app. Open one to see their profile and applications (read only).</p>
      </div>
      <Suspense fallback={<TableSkeleton rows={4} />}>
        <Users />
      </Suspense>
    </main>
  );
}
