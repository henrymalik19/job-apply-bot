/**
 * Formats how long ago a timestamp was, e.g. "5m ago", for admin tables.
 *
 * @param iso - ISO timestamp, or nothing.
 * @param now - Reference time (passed in so rendering stays deterministic).
 * @returns "never" when there is no timestamp.
 */
export function ago(iso: string | null | undefined, now: Date): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

const compact = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/**
 * Formats a salary range compactly, e.g. "$150k–190k", "$120k+" or "€80k".
 * Returns "" when there is no salary.
 *
 * @param currency - ISO code; USD/EUR/GBP get a symbol, others a suffix.
 */
export function formatSalary(min: number | null, max: number | null, currency: string | null): string {
  if (min == null && max == null) return "";
  const symbol = ({ USD: "$", EUR: "€", GBP: "£" } as Record<string, string>)[currency ?? "USD"];
  const suffix = symbol || !currency ? "" : ` ${currency}`;
  const s = symbol ?? "";
  if (min != null && max != null && min !== max) return `${s}${compact(min)}–${compact(max)}${suffix}`;
  if (min != null && max == null) return `${s}${compact(min)}+${suffix}`;
  return `${s}${compact((min ?? max)!)}${suffix}`;
}
