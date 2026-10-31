"use client";

import { Sparkles } from "lucide-react";
import { useActionState, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage, type FormMessageState } from "../../_components/form-message";
import { answerQuestionAction, redraftAction } from "./actions";

/**
 * One question's answer form: the input (children) and one action row with
 * Save and, for free-text questions, Regenerate with AI plus optional guidance.
 * Both buttons submit this form to different actions. Short answers are always
 * remembered for other applications; free-text ones stay with this one.
 */
export function AnswerForm(props: {
  applicationId: string;
  questionId: string;
  hasAnswer: boolean;
  /** Offer drafting with AI (free-text questions). */
  canDraft: boolean;
  children: ReactNode;
}) {
  const { applicationId, questionId, hasAnswer, canDraft, children } = props;
  const [saveState, save, saving] = useActionState<FormMessageState, FormData>(answerQuestionAction, {});
  const [draftState, draft, drafting] = useActionState<FormMessageState, FormData>(redraftAction, {});
  const [last, setLast] = useState<"save" | "draft">("save");
  const busy = saving || drafting;
  const draftButton = useRef<HTMLButtonElement>(null);
  return (
    <form action={save} className="flex flex-col gap-2">
      <input type="hidden" name="application_id" value={applicationId} />
      <input type="hidden" name="question_id" value={questionId} />
      {children}
      {!canDraft && <input type="hidden" name="save" value="on" />}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy} onClick={() => setLast("save")}>{saving ? "Saving…" : hasAnswer ? "Save answer" : "Answer"}</Button>
        {canDraft && (
          <div className="flex min-w-0 flex-1 basis-80 items-center gap-2">
            <Input name="guidance" placeholder="Guidance for AI (optional), e.g. shorter" className="min-w-0 flex-1"
              aria-label="Guidance for the AI draft"
              onKeyDown={(e) => {
                // Enter here means "draft", not the form's default (save).
                if (e.key === "Enter") {
                  e.preventDefault();
                  draftButton.current?.click();
                }
              }}
            />
            <Button ref={draftButton} type="submit" variant="outline" formAction={draft} disabled={busy} onClick={() => setLast("draft")}>
              <Sparkles /> {drafting ? "Drafting…" : hasAnswer ? "Regenerate with AI" : "Draft with AI"}
            </Button>
          </div>
        )}
      </div>
      <FormMessage state={last === "draft" ? draftState : saveState} />
    </form>
  );
}
