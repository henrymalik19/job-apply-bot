// JSON GET (or POST with a JSON body) with timeout and exponential-backoff retries on network errors,
// 429 and 5xx. Other HTTP errors (e.g. 404 for a wrong board token) fail at once.

/** Non-2xx response; the message names the status and host only (no URL query). */
export class HttpError extends Error {
  constructor(readonly status: number, url: string) {
    super(`HTTP ${status} from ${new URL(url).host}`);
  }
}

/** Knobs for {@link fetchJson}; tests inject `fetchFn` and `sleep`. */
export type FetchOptions = {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  attempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  /** When set, sends a POST with this value as the JSON body. */
  body?: unknown;
};

/** Real-time delay used between retries. */
export const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const retryable = (status: number) => status === 429 || status >= 500;

/**
 * GETs (or POSTs, when `opts.body` is set) JSON with a timeout, retrying network errors, 429 and 5xx with
 * exponential backoff (1s, 2s, …). Other HTTP errors fail immediately.
 *
 * @param url - Absolute URL.
 * @param opts - Retry, timeout and injection options.
 * @throws {@link HttpError} or the last network error after the final attempt.
 */
export async function fetchJson(url: string, opts: FetchOptions = {}): Promise<unknown> {
  const { fetchFn = fetch, sleep = defaultSleep, attempts = 3, baseDelayMs = 1000, timeoutMs = 30_000, body } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(baseDelayMs * 2 ** (attempt - 1));
    try {
      const res = await fetchFn(url, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          accept: "application/json",
          "user-agent": "job-search-autopilot (personal job search)",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
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
