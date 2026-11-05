"use client";

import { Sparkles } from "lucide-react";
import { createContext, useActionState, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage, type FormMessageState } from "../../_components/form-message";
import { answerQuestionsAction, redraftAction } from "./actions";

type Drafting = { draft: (formData: FormData) => void; busy: boolean; drafting: string | null; start: (questionId: string) => void };
const DraftingContext = createContext<Drafting | null>(null);

/** A question's answer field (named answer:<id>), as opposed to a guidance box or the hidden fields. */
const isAnswer = (el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
  el instanceof HTMLElement && (el.getAttribute("name") ?? "").startsWith("answer:");

/**
 * One group of questions as a single form that saves as you go: a pick saves at once, a typed answer
 * when you leave it (or press Enter on a one-line box). Free-text questions keep their own Draft with
 * AI. With `confirmLabel` (Double-check these), a button marks the answers you left as they are as checked.
 */
export function AnswersForm(props: { applicationId: string; confirmLabel?: string; children: ReactNode }) {
  const { applicationId, confirmLabel, children } = props;
  const form = useRef<HTMLFormElement>(null);
  const [saveState, save, saving] = useActionState<FormMessageState, FormData>(answerQuestionsAction, {});
  const [draftState, draft, draftPending] = useActionState<FormMessageState, FormData>(redraftAction, {});
  const [last, setLast] = useState<"save" | "draft">("save");
  const [drafting, setDrafting] = useState<string | null>(null);
  const busy = saving || draftPending;
  const autosave = () => {
    setLast("save");
    form.current?.requestSubmit();
  };
  return (
    <DraftingContext.Provider
      value={{ draft, busy, drafting: draftPending ? drafting : null, start: (id) => { setDrafting(id); setLast("draft"); } }}
    >
      <form
        ref={form}
        action={save}
        className="flex flex-col"
        onChange={(e) => {
          if (e.target instanceof HTMLSelectElement && isAnswer(e.target)) autosave();
        }}
        onBlur={(e) => {
          const el = e.target;
          if (isAnswer(el) && !(el instanceof HTMLSelectElement) && el.value !== el.defaultValue) autosave();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target instanceof HTMLInputElement && isAnswer(e.target)) {
            e.preventDefault();
            autosave();
          }
        }}
      >
        <input type="hidden" name="application_id" value={applicationId} />
        {children}
        <div className="flex min-h-6 flex-wrap items-center gap-3 border-t pt-3">
          {confirmLabel && (
            <Button
              type="submit"
              variant="outline"
              disabled={busy}
              formAction={(formData) => {
                formData.set("confirm", "1");
                setLast("save");
                save(formData);
              }}
            >
              {confirmLabel}
            </Button>
          )}
          {saving ? <span className="text-sm text-muted-foreground">Saving…</span> : <FormMessage state={last === "draft" ? draftState : saveState} />}
          {!confirmLabel && !saving && !saveState.ok && !saveState.error && last === "save" && (
            <span className="text-xs text-muted-foreground">Changes save as you make them.</span>
          )}
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
