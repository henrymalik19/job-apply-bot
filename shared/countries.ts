// Countries, for questions answered with one (nationality, country of residence): picked from a list, so
// one saved answer reads right on every form that asks ("United States", never "American" or "USA").

/** Catalog questions answered with a country. */
export const COUNTRY_QUESTION_KEYS: ReadonlySet<string> = new Set(["nationality", "country_of_residence"]);

/** What a country question's saved answer is used for, under its picker. */
export const COUNTRY_HINT: Record<string, string> = {
  nationality: "The country on your passport. It's saved and used for every nationality, citizenship and passport-country question.",
  country_of_residence: "The country you live in. It's saved and used for every country-of-residence question.",
};

/** ISO 3166-1 alpha-2 codes of the world's countries and territories. */
const CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
  "UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW"
).split(" ");

/** Other ways people write a country, lowercased, by its name in the list. */
const ALSO: Record<string, string[]> = {
  "United States": ["us", "usa", "u s", "u s a", "united states of america", "america", "american"],
  "United Kingdom": ["uk", "u k", "great britain", "britain", "british", "england", "english", "scotland", "wales"],
  Canada: ["canadian"],
  Mexico: ["mexican"],
  India: ["indian"],
  Germany: ["german"],
  France: ["french"],
  Brazil: ["brazilian"],
  China: ["chinese"],
  Nigeria: ["nigerian"],
  Philippines: ["filipino", "filipina"],
  Ireland: ["irish"],
};

let names: string[] | null = null;

/** Every country's name in English, the United States first, then A to Z. */
export function countryNames(): string[] {
  if (!names) {
    const display = new Intl.DisplayNames(["en"], { type: "region" });
    const all = [...new Set(CODES.map((c) => display.of(c) ?? c))].sort((a, b) => a.localeCompare(b));
    names = ["United States", ...all.filter((n) => n !== "United States")];
  }
  return names;
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, " ").trim();

/** The country an answer names, as it's written in the list ("American", "USA", "us" → "United States"), or null. */
export function asCountryName(answer: string | null | undefined): string | null {
  if (!answer) return null;
  const k = key(answer);
  if (!k) return null;
  const list = countryNames();
  const exact = list.find((n) => key(n) === k);
  if (exact) return exact;
  const also = Object.entries(ALSO).find(([, ways]) => ways.includes(k));
  if (also) return also[0];
  // An ISO code ("CA", "DE").
  if (/^[a-z]{2}$/.test(k)) {
    const named = new Intl.DisplayNames(["en"], { type: "region" }).of(k.toUpperCase());
    if (named && list.includes(named)) return named;
  }
  return null;
}
