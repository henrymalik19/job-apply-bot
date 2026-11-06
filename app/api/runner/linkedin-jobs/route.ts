// The apply runner sends the Easy Apply jobs it found in a LinkedIn search here (it searches in your own
// signed-in Chrome; LinkedIn has no feed to fetch from a server). Saved under their companies, which you then
// follow, so matching scores them like any other job.
import { z } from "zod";
import { createServiceClient } from "@/server/db/service-client";
import { linkedinJobSchema, saveLinkedInJobs } from "@/server/modules/discovery/linkedin-jobs";
import { serverEnv } from "@/shared/env";
import { runnerUser } from "../auth";

const body = z.object({ jobs: z.array(linkedinJobSchema).min(1).max(50) });

/** Saves the jobs a LinkedIn search found, for the signed-in user. */
export async function POST(request: Request): Promise<Response> {
  const user = await runnerUser(request);
  if (user instanceof Response) return user;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const saved = await saveLinkedInJobs(createServiceClient(serverEnv()), user.userId, parsed.data.jobs);
  return Response.json(saved);
}
