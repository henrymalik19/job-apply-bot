// JSON GET with timeout and exponential-backoff retries on network errors,
// 429 and 5xx. Other HTTP errors (e.g. 404 for a wrong board token) fail at once.

export class HttpError extends Error {
  constructor(readonly status: number, url: string) {
    super(`HTTP ${status} from ${new URL(url).host}`);
  }
}

export type FetchOptions = {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  attempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
};

export const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const retryable = (status: number) => status === 429 || status >= 500;

export async function fetchJson(url: string, opts: FetchOptions = {}): Promise<unknown> {
  const { fetchFn = fetch, sleep = defaultSleep, attempts = 3, baseDelayMs = 1000, timeoutMs = 30_000 } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(baseDelayMs * 2 ** (attempt - 1));
    try {
      const res = await fetchFn(url, {
        headers: { accept: "application/json", "user-agent": "job-search-autopilot (personal job search)" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return await res.json();
      lastError = new HttpError(res.status, url);
      if (!retryable(res.status)) break;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
