// Resolves free-text job locations ("Houston, TX", "Remote (US)", "NYC") and
// filter phrases ("US", "Texas", "New York") to countries, US states and
// cities, so a filter for "US" keeps a job in Houston. Data is a compact,
// hand-picked set: US states, major US cities and common countries.
import { normalize } from "@/shared/text";

/**
 * US states (and DC) by code: the state's name and its main cities. A city is
 * either a name or [canonical name, ...aliases]; aliases match as that city.
 * To recognize a new city, add it under its state.
 */
const US_STATES: Record<string, { name: string; cities: (string | string[])[] }> = {
  AL: { name: "alabama", cities: ["birmingham"] },
  AK: { name: "alaska", cities: [] },
  AZ: { name: "arizona", cities: ["phoenix", "scottsdale", "tempe"] },
  AR: { name: "arkansas", cities: [] },
  CA: {
    name: "california",
    cities: [
      ["san francisco", "sf", "bay area"], "los angeles", "san diego", "san jose", "oakland", "palo alto",
      "mountain view", "sunnyvale", "menlo park", "redwood city", "santa clara", "santa monica", "irvine",
      "san mateo", "cupertino", "berkeley", "sacramento",
    ],
  },
  CO: { name: "colorado", cities: ["denver", "boulder"] },
  CT: { name: "connecticut", cities: ["stamford"] },
  DE: { name: "delaware", cities: [] },
  DC: { name: "district of columbia", cities: [["washington dc", "washington d c", "dc"]] },
  FL: { name: "florida", cities: ["miami", "tampa", "orlando", "jacksonville"] },
  GA: { name: "georgia", cities: ["atlanta"] },
  HI: { name: "hawaii", cities: ["honolulu"] },
  ID: { name: "idaho", cities: ["boise"] },
  IL: { name: "illinois", cities: ["chicago"] },
  IN: { name: "indiana", cities: ["indianapolis"] },
  IA: { name: "iowa", cities: ["des moines"] },
  KS: { name: "kansas", cities: [] },
  KY: { name: "kentucky", cities: ["louisville"] },
  LA: { name: "louisiana", cities: ["new orleans"] },
  ME: { name: "maine", cities: [] },
  MD: { name: "maryland", cities: ["baltimore", "bethesda"] },
  MA: { name: "massachusetts", cities: ["boston", "cambridge", "somerville"] },
  MI: { name: "michigan", cities: ["detroit", "ann arbor"] },
  MN: { name: "minnesota", cities: ["minneapolis"] },
  MS: { name: "mississippi", cities: [] },
  MO: { name: "missouri", cities: ["kansas city", ["st louis", "saint louis"]] },
  MT: { name: "montana", cities: [] },
  NE: { name: "nebraska", cities: ["omaha"] },
  NV: { name: "nevada", cities: ["las vegas"] },
  NH: { name: "new hampshire", cities: [] },
  NJ: { name: "new jersey", cities: ["jersey city", "hoboken", "newark"] },
  NM: { name: "new mexico", cities: ["albuquerque"] },
  NY: { name: "new york", cities: [["new york", "nyc", "new york city", "manhattan", "brooklyn"]] },
  NC: { name: "north carolina", cities: ["raleigh", "durham", "charlotte"] },
  ND: { name: "north dakota", cities: [] },
  OH: { name: "ohio", cities: ["columbus", "cleveland", "cincinnati"] },
  OK: { name: "oklahoma", cities: ["oklahoma city"] },
  OR: { name: "oregon", cities: ["portland"] },
  PA: { name: "pennsylvania", cities: ["pittsburgh", "philadelphia"] },
  RI: { name: "rhode island", cities: ["providence"] },
  SC: { name: "south carolina", cities: [] },
  SD: { name: "south dakota", cities: [] },
  TN: { name: "tennessee", cities: ["nashville", "memphis"] },
  TX: { name: "texas", cities: ["houston", "austin", "dallas", "san antonio", "fort worth", "plano"] },
  UT: { name: "utah", cities: ["salt lake city", "lehi", "provo"] },
  VT: { name: "vermont", cities: [] },
  VA: { name: "virginia", cities: ["arlington", "reston", "mclean", "richmond"] },
  WA: { name: "washington", cities: ["seattle", "bellevue", "redmond", "kirkland"] },
  WV: { name: "west virginia", cities: [] },
  WI: { name: "wisconsin", cities: ["milwaukee", "madison"] },
  WY: { name: "wyoming", cities: [] },
};

const STATE_ENTRIES = Object.entries(US_STATES);
const STATE_BY_CODE = new Map(STATE_ENTRIES.map(([code]) => [code.toLowerCase(), code]));
const STATE_BY_NAME = new Map(STATE_ENTRIES.map(([code, s]) => [s.name, code]));
/** Every city name or alias → its canonical name and state. */
const CITY_BY_NAME = new Map(
  STATE_ENTRIES.flatMap(([code, s]) =>
    s.cities.flatMap((c) => {
      const [canonical, ...aliases] = Array.isArray(c) ? c : [c];
      return [canonical, ...aliases].map((name) => [name, { canonical, state: code }] as const);
    }),
  ),
);

/** Countries (ISO-like code) and the normalized names that mean them. */
const COUNTRIES: [string, string[]][] = [
  ["US", ["united states", "united states of america", "usa", "us", "u s", "u s a", "america"]],
  ["CA", ["canada"]],
  ["MX", ["mexico"]],
  ["GB", ["united kingdom", "uk", "u k", "great britain", "england", "scotland", "wales", "london"]],
  ["IE", ["ireland", "dublin"]],
  ["DE", ["germany", "berlin", "munich"]],
  ["FR", ["france", "paris"]],
  ["NL", ["netherlands", "amsterdam"]],
  ["ES", ["spain", "madrid", "barcelona"]],
  ["PT", ["portugal", "lisbon"]],
  ["PL", ["poland", "warsaw"]],
  ["IN", ["india", "bangalore", "bengaluru", "hyderabad", "pune", "mumbai", "delhi", "chennai", "gurgaon", "noida"]],
  ["BR", ["brazil", "sao paulo"]],
  ["AR", ["argentina", "buenos aires"]],
  ["CO", ["colombia", "bogota"]],
  ["AU", ["australia", "sydney", "melbourne"]],
  ["SG", ["singapore"]],
  ["JP", ["japan", "tokyo"]],
  ["IL", ["israel", "tel aviv"]],
  ["PH", ["philippines", "manila"]],
];

/** Region words that, in a location, mean "outside the US" when no US place is named. */
const NON_US_REGIONS = ["emea", "europe", "eu", "latam", "apac", "asia", "africa", "middle east", "nordics"];

const COUNTRY_BY_NAME = new Map(COUNTRIES.flatMap(([code, names]) => names.map((n) => [n, code] as const)));

/** What a location or phrase refers to. */
export type Place = {
  countries: Set<string>;
  states: Set<string>;
  cities: Set<string>;
  /** Mentions a non-US region (EMEA, LATAM, …). */
  nonUsRegion: boolean;
};

const has = (text: string, phrase: string) => ` ${text} `.includes(` ${phrase} `);

/**
 * Resolves a job's location text to the countries, US states and cities it
 * names. "Houston, TX" → US/TX/houston; "Remote (US)" → US; "NYC" → US/NY.
 * State codes are only read in the "City, ST" position, so "CA" in
 * "Toronto, ON, Canada" or prose isn't taken for California.
 */
export function resolvePlace(raw: string): Place {
  const text = normalize(raw);
  const place: Place = { countries: new Set(), states: new Set(), cities: new Set(), nonUsRegion: false };
  if (!text) return place;

  for (const [name, code] of COUNTRY_BY_NAME) if (has(text, name)) place.countries.add(code);
  for (const [name, code] of STATE_BY_NAME) if (has(text, name)) place.states.add(code);
  for (const [name, city] of CITY_BY_NAME) {
    if (has(text, name)) {
      place.cities.add(city.canonical);
      place.states.add(city.state);
    }
  }
  // "City, ST" (or "City ST 12345"): a 2-letter code after a comma in the raw text.
  for (const m of raw.matchAll(/,\s*([A-Za-z]{2})(?=\s*(?:\d{5})?\s*(?:[,;)/|]|$))/g)) {
    const code = STATE_BY_CODE.get(m[1].toLowerCase());
    if (code && !(code === "CA" && place.countries.has("CA") && !place.countries.has("US"))) place.states.add(code);
  }
  if (place.states.size > 0) place.countries.add("US");
  place.nonUsRegion = NON_US_REGIONS.some((r) => has(text, r));
  return place;
}

/** A filter phrase resolved to the kind of place it names. */
export type WantedPlace =
  | { kind: "country"; code: string }
  | { kind: "state"; code: string }
  | { kind: "city"; name: string; state: string }
  | { kind: "text"; text: string };

/**
 * Resolves one filter phrase: a country ("US", "Canada"), a US state ("Texas",
 * "TX"), a known US city ("NYC", "Austin"), or plain text otherwise.
 */
export function resolveWanted(phrase: string): WantedPlace | null {
  const p = normalize(phrase);
  if (!p) return null;
  const city = CITY_BY_NAME.get(p);
  // "New York" alone means the state (which includes the city).
  if (city && p !== "new york") return { kind: "city", name: city.canonical, state: city.state };
  const country = COUNTRY_BY_NAME.get(p);
  if (country && !["london", "dublin", "berlin", "munich", "paris", "amsterdam", "madrid", "barcelona", "lisbon", "warsaw", "sydney", "melbourne", "tokyo", "manila", "bogota"].includes(p)) {
    return { kind: "country", code: country };
  }
  const state = STATE_BY_NAME.get(p) ?? (p.length === 2 ? STATE_BY_CODE.get(p) : undefined);
  if (state) return { kind: "state", code: state };
  return { kind: "text", text: p };
}

/** Whether a resolved job location satisfies one wanted place. */
export function placeMatches(place: Place, rawText: string, wanted: WantedPlace): boolean {
  switch (wanted.kind) {
    case "country":
      return place.countries.has(wanted.code);
    case "state":
      return place.states.has(wanted.code);
    case "city":
      return place.cities.has(wanted.name);
    case "text":
      return has(normalize(rawText), wanted.text);
  }
}
