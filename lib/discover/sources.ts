// Public job-board APIs (no auth). One request per board returns every open posting.
//   Greenhouse: https://developers.greenhouse.io/job-board.html
//   Lever:      https://github.com/lever/postings-api
//   Ashby:      https://developers.ashbyhq.com/docs/public-job-posting-api
import { z } from "zod";
import { htmlToText, tidyText } from "./text";

export const BOARD_ATS = ["greenhouse", "lever", "ashby"] as const;
export type BoardAts = (typeof BOARD_ATS)[number];

export const BOARD_TOKEN = /^[A-Za-z0-9._-]{1,100}$/;

export type RemoteType = "remote" | "hybrid" | "onsite" | "unknown";

export type DiscoveredJob = {
  external_id: string;
  url: string;
  apply_url: string | null;
  title: string;
  location: string | null;
  remote_type: RemoteType;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  description_md: string | null;
  posted_at: string | null;
  raw: Record<string, unknown>;
};

export function boardUrl(ats: BoardAts, token: string): string {
  const t = encodeURIComponent(token);
  switch (ats) {
    case "greenhouse":
      return `https://boards-api.greenhouse.io/v1/boards/${t}/jobs?content=true`;
    case "lever":
      return `https://api.lever.co/v0/postings/${t}?mode=json`;
    case "ashby":
      return `https://api.ashbyhq.com/posting-api/job-board/${t}?includeCompensation=true`;
  }
}

// Description fields are large and already copied into description_md;
// Greenhouse offices carry long id lists. Keep the rest for later stages.
const HEAVY_KEYS = new Set([
  "content", "description", "descriptionPlain", "descriptionHtml", "descriptionBody", "descriptionBodyPlain",
  "opening", "openingPlain", "lists", "additional", "additionalPlain", "offices", "data_compliance",
]);

function slim(item: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(item).filter(([k]) => !HEAVY_KEYS.has(k)));
}

export function remoteType(...hints: (string | null | undefined)[]): RemoteType {
  const h = hints.filter(Boolean).join(" ").toLowerCase();
  if (/hybrid/.test(h)) return "hybrid";
  if (/remote/.test(h)) return "remote";
  if (/on-?site|in[- ]office/.test(h)) return "onsite";
  return "unknown";
}

function isoOrNull(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const greenhouseBoard = z.object({
  jobs: z.array(
    z.looseObject({
      id: z.number(),
      title: z.string(),
      absolute_url: z.string(),
      location: z.object({ name: z.string().nullish() }).nullish(),
      updated_at: z.string().nullish(),
      first_published: z.string().nullish(),
      content: z.string().nullish(),
    }),
  ),
});

const leverBoard = z.array(
  z.looseObject({
    id: z.string(),
    text: z.string(),
    hostedUrl: z.string(),
    applyUrl: z.string().nullish(),
    createdAt: z.number().nullish(),
    workplaceType: z.string().nullish(),
    categories: z.object({ location: z.string().nullish() }).nullish(),
    descriptionPlain: z.string().nullish(),
    lists: z.array(z.object({ text: z.string(), content: z.string() })).nullish(),
    additionalPlain: z.string().nullish(),
    salaryRange: z
      .object({ min: z.number().nullish(), max: z.number().nullish(), currency: z.string().nullish(), interval: z.string().nullish() })
      .nullish(),
  }),
);

const ashbyBoard = z.object({
  jobs: z.array(
    z.looseObject({
      id: z.string(),
      title: z.string(),
      jobUrl: z.string(),
      applyUrl: z.string().nullish(),
      location: z.string().nullish(),
      isListed: z.boolean().nullish(),
      isRemote: z.boolean().nullish(),
      workplaceType: z.string().nullish(),
      publishedAt: z.string().nullish(),
      descriptionPlain: z.string().nullish(),
      compensation: z
        .object({
          compensationTiers: z
            .array(
              z.object({
                components: z.array(
                  z.object({
                    compensationType: z.string(),
                    interval: z.string().nullish(),
                    currencyCode: z.string().nullish(),
                    minValue: z.number().nullish(),
                    maxValue: z.number().nullish(),
                  }),
                ),
              }),
            )
            .nullish(),
        })
        .nullish(),
    }),
  ),
});

function parseGreenhouse(body: unknown): DiscoveredJob[] {
  return greenhouseBoard.parse(body).jobs.map((j) => {
    const location = j.location?.name?.trim() || null;
    return {
      external_id: String(j.id),
      url: j.absolute_url,
      apply_url: j.absolute_url,
      title: j.title.trim(),
      location,
      remote_type: remoteType(location),
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      description_md: j.content ? htmlToText(j.content) : null,
      posted_at: isoOrNull(j.first_published ?? j.updated_at),
      raw: slim(j),
    };
  });
}

function parseLever(body: unknown): DiscoveredJob[] {
  return leverBoard.parse(body).map((j) => {
    const location = j.categories?.location?.trim() || null;
    const parts = [
      j.descriptionPlain,
      ...(j.lists ?? []).map((l) => `## ${l.text}\n${htmlToText(l.content)}`),
      j.additionalPlain,
    ].filter((p): p is string => Boolean(p?.trim()));
    const yearly = j.salaryRange?.interval?.includes("year") ? j.salaryRange : null;
    return {
      external_id: j.id,
      url: j.hostedUrl,
      apply_url: j.applyUrl ?? null,
      title: j.text.trim(),
      location,
      remote_type: remoteType(j.workplaceType, location),
      salary_min: yearly?.min ?? null,
      salary_max: yearly?.max ?? null,
      salary_currency: yearly?.currency ?? null,
      description_md: parts.length ? tidyText(parts.join("\n\n")) : null,
      posted_at: isoOrNull(j.createdAt),
      raw: slim(j),
    };
  });
}

function parseAshby(body: unknown): DiscoveredJob[] {
  return ashbyBoard
    .parse(body)
    .jobs.filter((j) => j.isListed !== false)
    .map((j) => {
      const location = j.location?.trim() || null;
      const salary = j.compensation?.compensationTiers
        ?.flatMap((t) => t.components)
        .find((c) => c.compensationType === "Salary" && c.interval === "1 YEAR");
      return {
        external_id: j.id,
        url: j.jobUrl,
        apply_url: j.applyUrl ?? null,
        title: j.title.trim(),
        location,
        remote_type: remoteType(j.workplaceType, j.isRemote ? "remote" : null, location),
        salary_min: salary?.minValue ?? null,
        salary_max: salary?.maxValue ?? null,
        salary_currency: salary?.currencyCode ?? null,
        description_md: j.descriptionPlain ? tidyText(j.descriptionPlain) || null : null,
        posted_at: isoOrNull(j.publishedAt),
        raw: slim(j),
      };
    });
}

export function parseBoard(ats: BoardAts, body: unknown): DiscoveredJob[] {
  switch (ats) {
    case "greenhouse":
      return parseGreenhouse(body);
    case "lever":
      return parseLever(body);
    case "ashby":
      return parseAshby(body);
  }
}
