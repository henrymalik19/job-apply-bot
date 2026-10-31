/** Where a rule for Claude applies, as the Search page offers it (a plain module, so server and client both import it). */
export const RULE_SCOPES = [
  ["scoring", "Scoring jobs"],
  ["answers", "Writing answers"],
  ["tailoring", "Tailoring resumes"],
  ["global", "Everything"],
] as const;
