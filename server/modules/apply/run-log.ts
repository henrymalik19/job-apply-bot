// Reads an apply run's step log (run.log, written by the run recorder) into steps for the
// Admin > Runs checklist. Pure, so the format is tested without a browser. Lines look like
//   18:02:55.507 fill race (decline) "Race" = (decline) -> NOT FILLED
// and the text format stays the source of truth: the raw log is still shown on request.

/** How filling one field went. */
export type FillResult = "ok" | "not_filled" | "absent" | "error";

/** One field the runner filled, or tried to. */
export type FillLine = {
  /** Seconds since the run started. */
  at: number;
  field: string;
  /** How it was filled: text, select, location, check, decline, closest, resume. */
  kind: string;
  label: string;
  /** What was typed or picked, as logged ("(decline)", a file name, JSON for text and options). */
  value: string;
  result: FillResult;
  /** An error the fill threw, or error text the form showed right after. */
  detail?: string;
};

/** Anything else worth reading: opening the form, a security code, the outcome. */
export type NoteLine = { at: number; text: string; problem: boolean };

/** A run log, read. */
export type RunLog = {
  fills: FillLine[];
  notes: NoteLine[];
  /** Lines about the employer's page itself (its script errors, blocked ad requests): hidden as noise. */
  noise: number;
  counts: Record<FillResult, number>;
};

const LINE = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3}) (.*)$/;
const FILL = /^fill (\S+) \((\w+)\) "(.*)" = (.*) -> (ok|NOT FILLED|not on this form|threw: .*)$/;
const NOISE = /^(console\.(error|warning)|request failed|HTTP \d{3}|page error):?/;
// Fields every Greenhouse form is tried for, though many don't have them: a miss on one of these in an
// older log (before "not on this form" was written) is most likely the form not having it.
const OPTIONAL_EXTRAS = /^(country|candidate-location|gdpr_demographic_data_consent_given|gender|hispanic_ethnicity|race|veteran_status|disability_status|school--0|degree--0|discipline--0|(start|end)-(year|month)--0|company-name-0|title-0|(start|end)-date-(month|year)-0|current-role-0)$/;

const seconds = (m: RegExpExecArray) => Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;

/** Reads a run log into fills, notes and counts. */
export function parseRunLog(text: string): RunLog {
  const fills: FillLine[] = [];
  const notes: NoteLine[] = [];
  let noise = 0;
  let start: number | null = null;
  let lastPage = "";
  const note = (at: number, line: string, problem = false) => notes.push({ at, text: line, problem });

  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    const m = LINE.exec(raw);
    // An indented continuation ("  form shows: …") belongs to the fill before it.
    if (!m) {
      const shows = /^\s+form shows: (.*)$/.exec(raw);
      if (shows && fills.length) fills[fills.length - 1].detail = shows[1];
      continue;
    }
    const time = seconds(m);
    start ??= time;
    // Past midnight, the clock wraps.
    const at = Math.round(((time - start + 86_400) % 86_400) * 10) / 10;
    const line = m[5];
    if (/^\s+form shows: /.test(line)) {
      if (fills.length) fills[fills.length - 1].detail = line.replace(/^\s+form shows: /, "");
      continue;
    }
    const fill = FILL.exec(line);
    if (fill) {
      const [, field, kind, label, value, result] = fill;
      const r: FillResult =
        result === "ok" ? "ok" : result === "not on this form" ? "absent" : result.startsWith("threw") ? "error" : OPTIONAL_EXTRAS.test(field) ? "absent" : "not_filled";
      fills.push({ at, field, kind, label, value, result: r, ...(r === "error" ? { detail: result.replace(/^threw: /, "") } : {}) });
      continue;
    }
    if (NOISE.test(line)) {
      noise++;
      continue;
    }
    if (line.startsWith("page: ")) {
      // The page announces itself several times while loading; one line is enough.
      const url = line.slice(6);
      if (url !== lastPage && notes.length && !notes[notes.length - 1].text.startsWith("Opening")) note(at, `Moved to ${url}`);
      lastPage = url;
      continue;
    }
    if (line.startsWith("open -> ")) {
      const ok = line.endsWith("ok");
      note(at, ok ? "The form opened" : "There was no form on the page (the posting may have closed)", !ok);
      continue;
    }
    if (line.startsWith("open ")) {
      lastPage = line.slice(5);
      note(at, `Opening ${line.slice(5)}`);
      continue;
    }
    const started = /^[0-9a-f-]{36}: filling (.*)$/.exec(line);
    if (started) {
      note(at, `Started: ${started[1]}`);
      continue;
    }
    if (line.startsWith("outcome: ")) {
      const outcome = line.slice(9);
      note(at, outcome === "submitted" ? "Submitted" : `Ended: ${outcome.replace(/^handed back: /, "handed back, ")}`, outcome !== "submitted");
      continue;
    }
    // Other lines: the run id on a status message is noise to a reader.
    const text = line.replace(/^[0-9a-f-]{36}: /, "");
    note(at, text, /fail|error|couldn't|not filled|handed back|verification|form shows at end/i.test(text));
  }

  const counts: Record<FillResult, number> = { ok: 0, not_filled: 0, absent: 0, error: 0 };
  for (const f of fills) counts[f.result]++;
  return { fills, notes, noise, counts };
}

/** A logged value as a reader sees it: options joined, quotes dropped. */
export function shownValue(value: string): string {
  if (value === "(decline)") return "Declined to answer";
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.join(", ");
    if (typeof parsed === "string") return parsed;
    if (parsed === true) return "Ticked";
  } catch {
    // A file name or another bare value.
  }
  return value;
}
