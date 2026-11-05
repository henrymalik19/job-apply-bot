/** US security clearance levels a profile can hold, as forms name them. */
export const CLEARANCE_LEVELS = {
  none: "None",
  confidential: "Confidential",
  secret: "Secret",
  top_secret: "Top Secret",
  ts_sci: "Top Secret/SCI",
} as const;

/** A clearance level key, as stored on the profile. */
export type ClearanceLevel = keyof typeof CLEARANCE_LEVELS;
