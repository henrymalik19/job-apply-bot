// The question catalog: every distinct thing application forms ask, where its
// answer lives (profile, criteria, skill years, the answers table, drafted per
// job, or always asked), and every wording seen for it. Each value is stored
// once; questions and aliases only point at it.
export {
  ensureQuestion,
  insertAlias,
  listAliases,
  listAnswers,
  listQuestions,
  saveAnswer,
  type Question,
  type QuestionAlias,
} from "./questions.repository";

/** Where a catalog question's answer lives. */
export const ANSWER_SOURCES = ["profile", "criteria", "skill_years", "answer", "drafted", "ask"] as const;
/** One answer source. */
export type AnswerSource = (typeof ANSWER_SOURCES)[number];

/** Question categories. */
export const QUESTION_CATEGORIES = ["contact", "authorization", "compensation", "logistics", "skills", "links", "eeo", "other"] as const;

/** Answer shapes. */
export const ANSWER_TYPES = ["boolean", "number", "range", "text", "choice"] as const;
