// The apply runner asks here what to put in required fields a form still has empty (a section it
// didn't prepare for). It runs on the user's computer with only their session, so the Claude call
// happens on the server. Signed in by the runner's own access token (Authorization: Bearer …), not
// cookies; the answers are worked out as that user, so their data rules and Claude budget apply.
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/server/db/database.types";
import type { Db } from "@/server/db/types";
import { createClaudeCaller } from "@/server/integrations/anthropic/claude";
import { mapOpenFields } from "@/server/modules/apply/field-mapping";
import { serverEnv } from "@/shared/env";

const body = z.object({
  company: z.string().max(200),
  title: z.string().max(300),
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
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "sign in first" }, { status: 401 });
  const env = serverEnv();
  const db = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as Db;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return Response.json({ error: "sign in first" }, { status: 401 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const answers = await mapOpenFields(db, data.user.id, createClaudeCaller(), parsed.data);
  return Response.json({ answers });
}
