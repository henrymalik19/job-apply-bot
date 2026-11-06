// The apply runner sends the questions it found going through a LinkedIn Easy Apply form here (the form
// shows them only inside it): ones it couldn't answer, ones LinkedIn had filled in differently from your
// profile, and Claude's answers on the way. They're saved on the application to answer and check in the app.
import { z } from "zod";
import { createClaudeCaller } from "@/server/integrations/anthropic/claude";
import { questionToAskSchema, saveFormQuestions } from "@/server/modules/apply/form-questions";
import { ValidationError } from "@/server/core/errors";
import { runnerUser } from "../auth";

const body = z.object({ applicationId: z.string().uuid(), questions: z.array(questionToAskSchema).min(1).max(80) });

/** Saves a form's questions on the signed-in user's approved application; answers with its status now. */
export async function POST(request: Request): Promise<Response> {
  const user = await runnerUser(request);
  if (user instanceof Response) return user;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  try {
    const status = await saveFormQuestions(user.db, user.userId, parsed.data.applicationId, parsed.data.questions, createClaudeCaller());
    return Response.json({ status });
  } catch (err) {
    if (err instanceof ValidationError) return Response.json({ error: err.message }, { status: 409 });
    throw err;
  }
}
