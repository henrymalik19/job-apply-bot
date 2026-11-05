"use client";

import { Sparkles } from "lucide-react";
import { createContext, useActionState, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage, type FormMessageState } from "../../_components/form-message";
import { answerQuestionsAction, redraftAction } from "./actions";

type Drafting = { draft: (formData: FormData) => void; busy: boolean; drafting: string | null; start: (questionId: string) => void };
const DraftingContext = createContext<Drafting | null>(null);

/**
 * One group of questions as a single form: each question's input (children, named answer:<id>) and
 * one Save at the bottom that saves what changed. Free-text questions keep their own Draft with AI.
 */
export function AnswersForm(props: { applicationId: string; saveLabel: string; children: ReactNode }) {
  const { applicationId, saveLabel, children } = props;
  const [saveState, save, saving] = useActionState<FormMessageState, FormData>(answerQuestionsAction, {});
  const [draftState, draft, draftPending] = useActionState<FormMessageState, FormData>(redraftAction, {});
  const [last, setLast] = useState<"save" | "draft">("save");
  const [drafting, setDrafting] = useState<string | null>(null);
  const busy = saving || draftPending;
  return (
    <DraftingContext.Provider
      value={{ draft, busy, drafting: draftPending ? drafting : null, start: (id) => { setDrafting(id); setLast("draft"); } }}
    >
      <form action={save} className="flex flex-col">
        <input type="hidden" name="application_id" value={applicationId} />
        {children}
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button type="submit" disabled={busy} onClick={() => setLast("save")}>{saving ? "Saving…" : saveLabel}</Button>
          <FormMessage state={last === "draft" ? draftState : saveState} />
        </div>
      </form>
    </DraftingContext.Provider>
  );
}

/** Draft with AI for one free-text question, inside its group's form. */
export function DraftControls({ questionId, hasAnswer }: { questionId: string; hasAnswer: boolean }) {
  const ctx = useContext(DraftingContext);
  const button = useRef<HTMLButtonElement>(null);
  if (!ctx) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Input
        name={`guidance:${questionId}`}
        placeholder="Guidance for AI (optional), e.g. shorter"
        className="min-w-0 flex-1 basis-60"
        aria-label="Guidance for the AI draft"
        onKeyDown={(e) => {
          // Enter here means "draft this one", not the form's Save.
          if (e.key === "Enter") {
            e.preventDefault();
            button.current?.click();
          }
        }}
      />
      <Button
        ref={button}
        type="submit"
        variant="outline"
        // Says which question to draft (a button's own name/value is taken over by React for its action).
        formAction={(formData) => {
          formData.set("draft_question", questionId);
          ctx.draft(formData);
        }}
        disabled={ctx.busy}
        onClick={() => ctx.start(questionId)}
      >
        <Sparkles /> {ctx.drafting === questionId ? "Drafting…" : hasAnswer ? "Regenerate with AI" : "Draft with AI"}
      </Button>
    </div>
  );
}
