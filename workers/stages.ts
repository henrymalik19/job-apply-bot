// Per-user stages the worker entry points chain together. Each stage runs for
// every user in turn; one user's failure is logged and doesn't stop the others.
// A stage whose variable is missing is skipped with a log line.
import type { Db } from "@/server/db/types";
import { createClaudeCaller, DRAFTING_MODEL } from "@/server/integrations/anthropic/claude";
import { runMatch } from "@/server/modules/matching/matching.service";
import { createResendSender } from "@/server/integrations/email/resend";
import { runNotify } from "@/server/modules/notifications/notifications.service";
import { runPrepare } from "@/server/modules/prepare/prepare.service";
import { listUsers } from "@/server/modules/users/users.service";

/** One stage: what it does for one user, and the variables it needs (any one of them). */
type Stage = { name: string; needs?: string[]; run: (db: Db, userId: string) => Promise<{ counts: unknown }> };

const log = (line: string) => console.log(line);

/** Match (scoring). */
export const match: Stage = {
  name: "match",
  needs: ["ANTHROPIC_API_KEY"],
  /** Scores the user's new jobs. */
  run: (db, userId) => runMatch({ db, userId, call: createClaudeCaller(), log }),
};

/** Prepare; `limit` caps how many one run makes (below the daily cap). */
export const prepare = (limit?: number): Stage => ({
  name: "prepare",
  needs: ["ANTHROPIC_API_KEY"],
  run: (db, userId) => runPrepare({ db, userId, call: createClaudeCaller(), draftCall: createClaudeCaller(DRAFTING_MODEL), limit, log }),
});

/** Notify (the digest email). */
export const notify: Stage = {
  name: "notify",
  needs: ["RESEND_API_KEY", "JOB_INBOX_PASSWORD"],
  /** Emails the user's digest: through Resend when RESEND_API_KEY is set (Railway blocks SMTP), else SMTP. */
  run: (db, userId) => {
    const key = process.env.RESEND_API_KEY;
    const createSender = key ? () => createResendSender(key) : undefined;
    return runNotify({ db, userId, password: process.env.JOB_INBOX_PASSWORD ?? "", createSender, log });
  },
};

/**
 * Runs stages in order, each for every user.
 *
 * @returns Whether every stage succeeded for every user.
 */
export async function runStages(db: Db, stages: Stage[]): Promise<boolean> {
  const users = await listUsers(db);
  let ok = true;
  for (const stage of stages) {
    if (stage.needs && !stage.needs.some((name) => process.env[name])) {
      console.log(JSON.stringify({ stage: stage.name, skipped: `${stage.needs.join(" or ")} is not set` }));
      continue;
    }
    for (const user of users) {
      try {
        const { counts } = await stage.run(db, user.id);
        console.log(JSON.stringify({ stage: stage.name, user: user.id, ok: true, counts }));
      } catch (err) {
        ok = false;
        console.error(JSON.stringify({ stage: stage.name, user: user.id, ok: false, error: String((err as Error)?.message ?? err) }));
      }
    }
  }
  return ok;
}
