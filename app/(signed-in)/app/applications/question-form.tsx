import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { ApplicationQuestion, QuestionOption } from "@/server/modules/applications/applications.service";
import { AnswerForm } from "./answer-form";

const BUCKET_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  auto: { label: "filled", variant: "secondary" },
  drafted: { label: "AI draft", variant: "outline" },
  needs_user: { label: "needs you", variant: "destructive" },
  cannot_automate: { label: "do it yourself", variant: "destructive" },
};

/** Where an answer came from, in a few words. */
function sourceLabel(q: ApplicationQuestion): string | null {
  switch (q.answer_source) {
    case "profile": return "from your profile";
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
      <NativeSelect name="answer" defaultValue={selected} aria-label={q.question} className="max-w-xl">
        <NativeSelectOption value="">Pick an answer</NativeSelectOption>
        {options.map((o) => <NativeSelectOption key={o.value} value={o.value}>{o.label}</NativeSelectOption>)}
      </NativeSelect>
    );
  }
  if (q.field_type === "boolean") {
    return (
      <NativeSelect name="answer" defaultValue={current === true ? "yes" : current === false ? "no" : ""} aria-label={q.question} className="w-40">
        <NativeSelectOption value="">Pick</NativeSelectOption>
        <NativeSelectOption value="yes">Yes</NativeSelectOption>
        <NativeSelectOption value="no">No</NativeSelectOption>
      </NativeSelect>
    );
  }
  if (q.field_type === "textarea") {
    return <Textarea name="answer" rows={Math.max(3, Math.ceil((q.answer?.length ?? 0) / 100))} defaultValue={q.answer ?? ""} aria-label={q.question} />;
  }
  return <Input name="answer" defaultValue={q.answer ?? ""} aria-label={q.question} className="max-w-xl" />;
}

/**
 * One application question: label, status badges and why it needs you, plus
 * an answer form (except for file uploads and "do it yourself" steps).
 *
 * @param showBucket - Show the filled/drafted/needs-you badge (off where questions are already grouped by it).
 * @param aiAllowed - False when the employer restricts AI use: drafting stays available, with a heads-up.
 */
export function QuestionForm(props: { q: ApplicationQuestion; applicationId: string; showBucket?: boolean; aiAllowed?: boolean }) {
  const { q, applicationId, showBucket = true, aiAllowed = false } = props;
  const freeText = q.field_type === "textarea" || q.answer_source === "drafted";
  const bucket = BUCKET_LABEL[q.bucket] ?? { label: q.bucket, variant: "outline" as const };
  const source = sourceLabel(q);
  const editable = q.field_type !== "file" && q.field_type !== "hidden" && q.bucket !== "cannot_automate";
  return (
    <div className="flex flex-col gap-2 py-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{q.question}</span>
        {q.required && <Badge className="bg-destructive/15 text-destructive">required</Badge>}
        {showBucket && <Badge variant={bucket.variant}>{bucket.label}</Badge>}
        {q.needs_check && <Badge variant="outline">please check</Badge>}
        {source && <span className="text-xs text-muted-foreground">{source}</span>}
      </div>
      {q.reason && q.bucket !== "auto" && q.bucket !== "drafted" && <p className="text-sm text-muted-foreground">{q.reason}</p>}
      {!editable ? (
        <p className="text-sm">{q.answer ?? <span className="text-muted-foreground">Nothing to fill in here.</span>}</p>
      ) : (
        <AnswerForm applicationId={applicationId} questionId={q.id} hasAnswer={!!q.answer} canDraft={freeText}>
          {/* Keyed by the answer so a new AI draft replaces what the box shows. */}
          <AnswerInput key={q.answer ?? ""} q={q} />
        </AnswerForm>
      )}
      {editable && freeText && !aiAllowed && (
        <p className="text-xs text-warning">Heads-up: this employer asks applicants not to use AI. Drafting is up to you.</p>
      )}
    </div>
  );
}
