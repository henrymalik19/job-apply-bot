/** What a form action reports back: a success line, an error, and optional sample lines. */
export type FormMessageState = { ok?: string; error?: string; sample?: string[] };

/** Success or error line under a form, with optional sample lines (e.g. job titles). */
export function FormMessage({ state }: { state: FormMessageState }) {
  if (state.error) return <p role="alert" className="text-sm text-destructive">{state.error}</p>;
  if (!state.ok) return null;
  return (
    <div className="text-sm">
      <p className="text-emerald-700 dark:text-emerald-400">{state.ok}</p>
      {state.sample && state.sample.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-muted-foreground">
          {state.sample.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      )}
    </div>
  );
}
