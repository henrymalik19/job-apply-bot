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
