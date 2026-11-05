// The apply runner asks here what to put in required fields a form still has empty (a section it
// didn't prepare for). It runs on the user's computer with only their session, so the Claude call
// happens on the server, as that user (see ../auth).
import { z } from "zod";
import { createClaudeCaller } from "@/server/integrations/anthropic/claude";
import { mapOpenFields } from "@/server/modules/apply/field-mapping";
import { runnerUser } from "../auth";

const body = z.object({
  company: z.string().max(200),
  title: z.string().max(300),
  jobId: z.string().uuid().optional(),
  fields: z
    .array(
      z.object({
        key: z.string().max(300),
        label: z.string().max(1000),
        kind: z.enum(["text", "textarea", "select", "multiselect", "combobox", "agreement"]),
        options: z.array(z.string().max(500)).max(500),
      }),
    )
    .min(1)
    .max(40),
});

/** Answers a form's open fields from the signed-in user's profile. */
export async function POST(request: Request): Promise<Response> {
  const user = await runnerUser(request);
  if (user instanceof Response) return user;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const answers = await mapOpenFields(user.db, user.userId, createClaudeCaller(), parsed.data);
  return Response.json({ answers });
}
