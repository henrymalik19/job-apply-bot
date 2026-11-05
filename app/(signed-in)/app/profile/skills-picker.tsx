"use client";

import { X } from "lucide-react";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * Picks the skills a job used: type to find one you already have, pick it (or press Enter for a new
 * one), and remove any with its ×. Picking from your list instead of typing names keeps "Postgres" and
 * "PostgreSQL" from becoming two skills that split your years. Sent as `name` (one per line).
 */
export function SkillsPicker({ name, id, initial, known }: { name: string; id?: string; initial: string[]; known: string[] }) {
  const [picked, setPicked] = useState<string[]>(initial);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const has = (s: string) => picked.some((p) => p.toLowerCase() === s.toLowerCase());
  const needle = q.trim().toLowerCase();
  const matches = needle ? known.filter((k) => k.toLowerCase().includes(needle) && !has(k)).slice(0, 8) : [];
  // A name you typed that isn't one of yours is offered last, as new.
  const exact = known.find((k) => k.toLowerCase() === needle);
  const options = needle && !exact && !has(q.trim()) ? [...matches, q.trim()] : matches;

  const add = (skill: string) => {
    const known_ = known.find((k) => k.toLowerCase() === skill.toLowerCase()) ?? skill;
    if (!has(known_)) setPicked([...picked, known_]);
    setQ("");
    setActive(0);
  };

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={picked.join("\n")} />
      {picked.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Skills used here">
          {picked.map((s) => (
            <li key={s} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-1 pl-2.5 text-xs">
              {s}
              <button
                type="button"
                onClick={() => setPicked(picked.filter((p) => p !== s))}
                aria-label={`Remove ${s}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Input
          id={id}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, options.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" || e.key === ",") {
              // Enter picks the highlighted skill instead of sending the form.
              if (!options.length) return;
              e.preventDefault();
              add(options[active] ?? options[0]);
            } else if (e.key === "Backspace" && !q && picked.length) {
              setPicked(picked.slice(0, -1));
            }
          }}
          placeholder={picked.length ? "Add another skill" : "Type a skill, e.g. TypeScript"}
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
        />
        {open && options.length > 0 && (
          <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md">
            {options.map((o, i) => (
              <li
                key={o}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer rounded px-2 py-1.5 ${i === active ? "bg-accent text-accent-foreground" : ""}`}
              >
                {known.includes(o) ? o : <>Add &ldquo;{o}&rdquo; <span className="text-xs text-muted-foreground">new skill</span></>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
