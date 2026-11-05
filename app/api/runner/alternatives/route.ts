// The apply runner asks here for other values to try when a field won't take the prepared one (a
// search box that finds nothing for "Atlanta, GA"). The Claude call happens on the server.
import { z } from "zod";
import { createClaudeCaller } from "@/server/integrations/anthropic/claude";
import { suggestAlternatives } from "@/server/modules/apply/field-mapping";
import { runnerUser } from "../auth";

const body = z.object({
  company: z.string().max(200),
  title: z.string().max(300),
  jobId: z.string().uuid().optional(),
  label: z.string().max(1000),
  kind: z.string().max(40),
  value: z.string().max(500),
});

/** Other values to try, from the signed-in user's profile. */
export async function POST(request: Request): Promise<Response> {
  const user = await runnerUser(request);
  if (user instanceof Response) return user;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const alternatives = await suggestAlternatives(user.db, user.userId, createClaudeCaller(), parsed.data);
  return Response.json({ alternatives });
}
