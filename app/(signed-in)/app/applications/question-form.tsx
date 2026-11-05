import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { ApplicationQuestion, QuestionOption } from "@/server/modules/applications/applications.service";
import { DraftControls } from "./answers-form";

const BUCKET_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  auto: { label: "filled", variant: "secondary" },
  drafted: { label: "AI draft", variant: "outline" },
  needs_user: { label: "needs you", variant: "destructive" },
  cannot_automate: { label: "do it yourself", variant: "destructive" },
};

/** Where an answer came from, in a few words. */
function sourceLabel(q: ApplicationQuestion): string | null {
  switch (q.answer_source) {
    // Claude picked the form's option from your profile answer (the reason says which and why).
    case "profile": return q.reason?.startsWith("picked by AI") ? "picked by AI" : "from your profile";
    case "criteria": return "from your search criteria";
    case "skill_years": return "from your job dates";
    case "answer": return "saved answer";
    case "drafted": return "drafted by AI";
    case "rule": return "declined (voluntary)";
    case "user": return "your answer";
    default: return null;
  }
}

/** The input for one question, by its field type. */
function AnswerInput({ q }: { q: ApplicationQuestion }) {
  const options = (q.options as QuestionOption[] | null) ?? [];
  const current = q.answer_value;
  if (q.field_type === "select" || q.field_type === "multiselect") {
    const selected = Array.isArray(current) ? String(current[0] ?? "") : current == null ? "" : String(current);
    return (
      <NativeSelect name={`answer:${q.id}`} defaultValue={selected} aria-label={q.question} className="max-w-xl">
        <NativeSelectOption value="">Pick an answer</NativeSelectOption>
        {options.map((o) => <NativeSelectOption key={o.value} value={o.value}>{o.label}</NativeSelectOption>)}
      </NativeSelect>
    );
  }
  if (q.field_type === "boolean") {
    return (
      <NativeSelect name={`answer:${q.id}`} defaultValue={current === true ? "yes" : current === false ? "no" : ""} aria-label={q.question} className="w-40">
        <NativeSelectOption value="">Pick</NativeSelectOption>
        <NativeSelectOption value="yes">Yes</NativeSelectOption>
        <NativeSelectOption value="no">No</NativeSelectOption>
      </NativeSelect>
    );
  }
  // Several rows for writing, and for any long answer (a drafted one in a one-line form field) so it can be read whole.
  if (q.field_type === "textarea" || q.answer_source === "drafted" || (q.answer?.length ?? 0) > 80) {
    return <Textarea name={`answer:${q.id}`} rows={Math.max(3, Math.ceil((q.answer?.length ?? 0) / 100))} defaultValue={q.answer ?? ""} aria-label={q.question} />;
  }
  return <Input name={`answer:${q.id}`} defaultValue={q.answer ?? ""} aria-label={q.question} className="max-w-xl" />;
}

/**
 * One application question: label, status badges and why it needs you, plus its answer input
 * (except for file uploads and "do it yourself" steps), saved by its group's one Save.
 *
 * @param showBucket - Show the filled/drafted/needs-you badge (off where questions are already grouped by it).
 * @param aiAllowed - False when the employer restricts AI use: drafting stays available, with a heads-up.
 * @param showCheck - Show "please check" (off in the Double-check group, which says it already).
 */
export function QuestionForm(props: { q: ApplicationQuestion; showBucket?: boolean; aiAllowed?: boolean; showCheck?: boolean }) {
  const { q, showBucket = true, aiAllowed = false, showCheck = true } = props;
  const freeText = q.field_type === "textarea" || q.answer_source === "drafted";
  const bucket = BUCKET_LABEL[q.bucket] ?? { label: q.bucket, variant: "outline" as const };
  const source = sourceLabel(q);
  // A step left for you in Chrome can still be answered here when it's a plain field (a Yes/No, a pick,
  // text): that takes it off your list, and a short answer is remembered for the next form.
  const editable = q.field_type !== "file" && q.field_type !== "hidden";
  return (
    <div className="flex flex-col gap-2 py-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{q.question}</span>
        {q.required && <Badge className="bg-destructive/15 text-destructive">required</Badge>}
        {showBucket && <Badge variant={bucket.variant}>{bucket.label}</Badge>}
        {showCheck && q.needs_check && <Badge variant="outline">please check</Badge>}
        {source && (
          // Where the answer came from, as a quiet tag on the right.
          <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {source}
          </span>
        )}
      </div>
      {q.reason && ((q.bucket !== "auto" && q.bucket !== "drafted") || source === "picked by AI") && <p className="text-sm text-muted-foreground">{q.reason}</p>}
      {!editable ? (
        <p className="text-sm">{q.answer ?? <span className="text-muted-foreground">Nothing to fill in here.</span>}</p>
      ) : (
        <>
          {/* Keyed by the answer so a new AI draft replaces what the box shows. */}
          <AnswerInput key={q.answer ?? ""} q={q} />
          {freeText && <DraftControls questionId={q.id} hasAnswer={!!q.answer} />}
        </>
      )}
      {editable && freeText && !aiAllowed && (
        <p className="text-xs text-warning">Heads-up: this employer asks applicants not to use AI. Drafting is up to you.</p>
      )}
    </div>
  );
}
