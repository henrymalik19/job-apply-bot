// Minimal board payloads shaped like the live APIs (checked 2026-10-29).
// Used by unit tests and the DB acceptance tests; not imported by app code.

/** ISO timestamp `days` ago, so fixtures stay inside the discovery age limit. */
export const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/** Minimal job for building fixture boards. */
export type FixtureJob = { id: string; title: string; location?: string };

/** Greenhouse board payload with the given jobs. */
export function greenhouseBody(jobs: FixtureJob[]) {
  return {
    jobs: jobs.map((j) => ({
      id: Number(j.id),
      title: j.title,
      absolute_url: `https://boards.greenhouse.io/acme/jobs/${j.id}`,
      location: { name: j.location ?? "Remote - US" },
      updated_at: daysAgo(1),
      first_published: daysAgo(5),
      content: "&lt;h2&gt;About&lt;/h2&gt;&lt;p&gt;Build things &amp;amp; ship.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;TypeScript&lt;/li&gt;&lt;/ul&gt;",
      offices: [{ id: 1, name: "US", child_ids: [2, 3] }],
      departments: [{ id: 9, name: "Engineering" }],
    })),
    meta: { total: jobs.length },
  };
}

/** Lever board payload with the given jobs. */
export function leverBody(jobs: FixtureJob[]) {
  return jobs.map((j) => ({
    id: j.id,
    text: j.title,
    hostedUrl: `https://jobs.lever.co/acme/${j.id}`,
    applyUrl: `https://jobs.lever.co/acme/${j.id}/apply`,
    createdAt: Date.now() - 3 * 86_400_000,
    workplaceType: "hybrid",
    categories: { location: j.location ?? "New York, NY", team: "Engineering", commitment: "Full-time" },
    descriptionPlain: "We build tools.",
    lists: [{ text: "What you'll do", content: "<li>Ship features</li><li>Review code</li>" }],
    additionalPlain: "Benefits included.",
    salaryRange: { min: 150000, max: 190000, currency: "USD", interval: "per-year-salary" },
  }));
}

/** Ashby board payload with the given jobs plus any raw `extra` entries. */
export function ashbyBody(jobs: FixtureJob[], extra: Record<string, unknown>[] = []) {
  return {
    apiVersion: "1",
    jobs: [
      ...jobs.map((j) => ({
        id: j.id,
        title: ` ${j.title} `,
        location: j.location ?? "San Francisco, CA",
        isListed: true,
        isRemote: false,
        workplaceType: "OnSite",
        jobUrl: `https://jobs.ashbyhq.com/acme/${j.id}`,
        applyUrl: `https://jobs.ashbyhq.com/acme/${j.id}/application`,
        publishedAt: daysAgo(4),
        descriptionPlain: "About the role.",
        compensation: {
          compensationTiers: [
            {
              components: [
                { compensationType: "EquityPercentage", interval: "NONE", currencyCode: null, minValue: null, maxValue: null },
                { compensationType: "Salary", interval: "1 YEAR", currencyCode: "USD", minValue: 200000, maxValue: 250000 },
              ],
            },
          ],
        },
      })),
      ...extra,
    ],
  };
}

/** A fetch stand-in that serves JSON (or an HTTP status) by URL substring. */
export function fakeFetch(routes: Record<string, unknown | { status: number }>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.includes(k));
    const body = key === undefined ? { status: 404 } : routes[key];
    if (body && typeof body === "object" && "status" in body && Object.keys(body).length === 1) {
      return new Response("error", { status: (body as { status: number }).status });
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}
