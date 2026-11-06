"use client";

import { GripVertical, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import type { JobTitleSuggestion } from "@/server/modules/criteria/job-titles";
import { suggestRolesAction } from "./actions";

/** The roles the LinkedIn search uses, in order (the runner searches the first ones). */
export const LINKEDIN_SEARCHED = 3;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Target roles as chips: type to get job titles employers use (from the jobs seen), Enter or comma to add what
 * you typed, drag to reorder. Saved with the form as one comma-separated field, as before.
 */
export function RolesInput({ defaultValue }: { defaultValue: string[] }) {
  const [roles, setRoles] = useState(defaultValue);
  const [typed, setTyped] = useState("");
  const [found, setFound] = useState<JobTitleSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [dragging, setDragging] = useState<number | null>(null);
  const listId = useId();
  const asked = useRef(0);

  // Suggestions a moment after you stop typing; an answer to an older query is dropped.
  useEffect(() => {
    const q = typed.trim();
    const n = ++asked.current;
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      suggestRolesAction(q)
        .then((titles) => {
          if (n !== asked.current) return;
          setFound(titles);
          setActive(-1);
        })
        .catch(() => undefined);
    }, 200);
    return () => clearTimeout(timer);
  }, [typed]);
  // Shown while there's something typed, without the roles already added.
  const suggestions = typed.trim().length >= 2 ? found.filter((s) => !roles.some((r) => same(r, s.title))) : [];
  const setSuggestions = setFound;

  const add = (title: string) => {
    const t = title.replace(/,/g, " ").replace(/\s+/g, " ").trim();
    if (t && !roles.some((r) => same(r, t))) setRoles([...roles, t]);
    setTyped("");
    setFound([]);
  };
  const remove = (i: number) => setRoles(roles.filter((_, j) => j !== i));
  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...roles];
    const [r] = next.splice(from, 1);
    next.splice(to, 0, r);
    setRoles(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
    } else if (e.key === "Enter" || e.key === ",") {
      // Enter adds the role here rather than saving the form.
      if (e.key === "Enter" || typed.trim()) e.preventDefault();
      if (active >= 0 && suggestions[active]) add(suggestions[active].title);
      else if (typed.trim()) add(typed);
    } else if (e.key === "Escape") {
      setSuggestions([]);
    } else if (e.key === "Backspace" && !typed && roles.length) {
      remove(roles.length - 1);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="roles" value={roles.join(", ")} />
      {roles.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Target roles, in order">
          {roles.map((role, i) => (
            <li
              key={role}
              draggable
              onDragStart={() => setDragging(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragging != null) move(dragging, i);
                setDragging(null);
              }}
              onDragEnd={() => setDragging(null)}
              className={`flex items-center gap-1 rounded-full border py-1 pr-1 pl-1.5 text-sm ${i < LINKEDIN_SEARCHED ? "border-primary/40 bg-primary/10" : "bg-muted"} ${dragging === i ? "opacity-50" : ""}`}
            >
              <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
              <span>{role}</span>
              {i < LINKEDIN_SEARCHED && <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary">LinkedIn</span>}
              <button type="button" onClick={() => remove(i)} aria-label={`Remove ${role}`} className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Input
          id="roles"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setSuggestions([]), 150)}
          placeholder={roles.length ? "Add another role" : "Senior Software Engineer"}
          autoComplete="off"
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        />
        {suggestions.length > 0 && (
          <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover py-1 text-sm shadow-md">
            {suggestions.map((s, i) => (
              <li
                key={s.title}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // Picked on mouse down, before the box loses focus and closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(s.title);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 ${i === active ? "bg-accent text-accent-foreground" : ""}`}
              >
                <span>{s.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{s.postings.toLocaleString()} posted</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Type for titles employers use; Enter adds what you typed. Drag to reorder: the first {LINKEDIN_SEARCHED} are searched on LinkedIn.
      </p>
    </div>
  );
}
