import {
  USCCBArgumentError,
  USCCBBotChallengeError,
  USCCBError,
  USCCBNetworkError,
} from "./errors.js";
import {
  type FetchLike,
  type FetchResult,
  wrapFetchWithObolus,
} from "./http-obolus.js";
import { readBoundedText } from "./http-body.js";
export type { FetchLike, FetchResult };
export { readBoundedText };

export const DEFAULT_TIMEOUT_MS = 15_000;
export const MAX_RESPONSE_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB
export const MAX_REDIRECTS = 5;
export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_RETRY_BASE_DELAY_MS = 250;
export const DEFAULT_RETRY_MAX_DELAY_MS = 10_000;
export const DEFAULT_MAX_TOTAL_RETRY_DELAY_MS = 30_000;

const RETRYABLE_HTTP_STATUSES = new Set([429, 502, 503, 504]);

/** HTTP response returned by {@link HttpClient}. */
export interface HttpResponse {
  text: string;
  ok: boolean;
  status: number;
  url: string;
}

/** Options for individual HTTP requests passed to {@link HttpClient}. */
export interface HttpRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Pluggable HTTP client used by {@link USCCB} for fetching mass pages.
 * Inject a custom implementation for testing or alternate fetch backends.
 */
export interface HttpClient {
  /** Fetch a URL with GET. */
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
  /** Fetch a URL with HEAD (used to probe available mass types). */
  head(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
  /** Reset client-scoped state (such as cached Obolus proof cookies). */
  reset?(origin?: string): void;
}

const DEFAULT_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

export type CreateFetchClientOptions = {
  useDefaultHeaders?: boolean;
  /** Apply USCCB-specific fetch handling for live requests (default: true). */
  obolus?: boolean;
  /** Default request timeout in milliseconds (default: 15_000). */
  timeoutMs?: number;
  /** Maximum response body size in bytes (default: 3 MB). */
  maxResponseSizeBytes?: number;
  /** Maximum number of redirects to follow (default: 5). */
  maxRedirects?: number;
  /** Maximum number of retries on transient failures (default: 2). */
  maxRetries?: number;
  /** Initial backoff delay in milliseconds (default: 250). */
  retryBaseDelayMs?: number;
  /** Maximum delay for a single retry attempt in milliseconds (default: 10_000). */
  retryMaxDelayMs?: number;
  /** Maximum cumulative retry wait time per request in milliseconds (default: 30_000). */
  maxTotalRetryDelayMs?: number;
  /** Optional random source in [0, 1) for jitter calculation (useful in tests). */
  random?: () => number;
};

/** Combine a timeout duration in milliseconds and an optional caller AbortSignal. */
export function combineSignals(
  timeoutMs?: number,
  callerSignal?: AbortSignal
): AbortSignal | undefined {
  if (
    timeoutMs !== undefined &&
    (!Number.isFinite(timeoutMs) ||
      timeoutMs < 0 ||
      !Number.isInteger(timeoutMs))
  ) {
    throw new USCCBArgumentError(
      `timeoutMs must be a non-negative integer; received '${timeoutMs}'`
    );
  }
  const timeoutSignal =
    timeoutMs !== undefined && timeoutMs > 0
      ? AbortSignal.timeout(timeoutMs)
      : undefined;

  if (!timeoutSignal) return callerSignal;
  if (!callerSignal) return timeoutSignal;

  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([timeoutSignal, callerSignal]);
  }

  const controller = new AbortController();
  const onAbort = () => {
    const reason = callerSignal.aborted
      ? callerSignal.reason
      : timeoutSignal.reason;
    controller.abort(reason);
  };
  callerSignal.addEventListener("abort", onAbort, { once: true });
  timeoutSignal.addEventListener("abort", onAbort, { once: true });
  if (callerSignal.aborted || timeoutSignal.aborted) {
    onAbort();
  }
  return controller.signal;
}

function isHtmlOrXmlContentType(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  return (
    lower.includes("text/html") ||
    lower.includes("application/xhtml+xml") ||
    lower.includes("application/xml") ||
    lower.includes("text/xml")
  );
}

function assertNonNegativeInteger(
  value: number | undefined,
  name: string
): void {
  if (
    value !== undefined &&
    (!Number.isFinite(value) || value < 0 || !Number.isInteger(value))
  ) {
    throw new USCCBArgumentError(
      `${name} must be a non-negative integer; received '${value}'`
    );
  }
}

/** Parse an HTTP `Retry-After` header into milliseconds, or `null` if invalid. */
export function parseRetryAfterMs(
  headerValue: string | null | undefined,
  nowMs: number = Date.now()
): number | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10);
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  }

  const parsedDate = Date.parse(trimmed);
  if (Number.isNaN(parsedDate)) {
    return null;
  }
  return Math.max(0, parsedDate - nowMs);
}

function sanitizeUrlForLog(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.username = "";
    parsed.password = "";
    return parsed.href;
  } catch {
    return rawUrl;
  }
}

async function sleepWithSignal(
  ms: number,
  signal?: AbortSignal
): Promise<void> {
  if (ms <= 0) {
    if (signal?.aborted) signal.throwIfAborted();
    return;
  }
  if (signal?.aborted) {
    signal.throwIfAborted();
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isAbortOrTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

/**
 * Create an {@link HttpClient} backed by the platform `fetch` API (or a compatible implementation).
 */
export function createFetchClient(
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  options: CreateFetchClientOptions = {}
): HttpClient {
  assertNonNegativeInteger(options.timeoutMs, "timeoutMs");
  assertNonNegativeInteger(
    options.maxResponseSizeBytes,
    "maxResponseSizeBytes"
  );
  assertNonNegativeInteger(options.maxRedirects, "maxRedirects");
  assertNonNegativeInteger(options.maxRetries, "maxRetries");
  assertNonNegativeInteger(options.retryBaseDelayMs, "retryBaseDelayMs");
  assertNonNegativeInteger(options.retryMaxDelayMs, "retryMaxDelayMs");
  assertNonNegativeInteger(
    options.maxTotalRetryDelayMs,
    "maxTotalRetryDelayMs"
  );

  const {
    useDefaultHeaders = true,
    obolus = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxResponseSizeBytes = MAX_RESPONSE_SIZE_BYTES,
    maxRedirects = MAX_REDIRECTS,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
    retryMaxDelayMs = DEFAULT_RETRY_MAX_DELAY_MS,
    maxTotalRetryDelayMs = DEFAULT_MAX_TOTAL_RETRY_DELAY_MS,
    random = Math.random,
  } = options;
  const resolvedFetch = obolus
    ? wrapFetchWithObolus(fetchImpl, { maxResponseSizeBytes })
    : fetchImpl;

  function computeRetryDelayMs(
    attempt: number,
    retryAfterMs: number | null,
    remainingBudgetMs: number
  ): number | null {
    if (remainingBudgetMs <= 0) {
      return null;
    }
    if (retryAfterMs !== null) {
      if (retryAfterMs > remainingBudgetMs || retryAfterMs > retryMaxDelayMs) {
        return null;
      }
      return retryAfterMs;
    }
    const expDelay = Math.min(retryMaxDelayMs, retryBaseDelayMs * 2 ** attempt);
    const jitter = 0.5 + 0.5 * Math.max(0, Math.min(1, random()));
    const delay = Math.floor(expDelay * jitter);
    return Math.min(delay, remainingBudgetMs);
  }

  async function executeSingleAttempt(
    urlStr: string,
    method: "GET" | "HEAD",
    signal?: AbortSignal
  ): Promise<
    | { kind: "response"; response: HttpResponse; retryAfterMs: number | null }
    | { kind: "retryable_error"; error: USCCBNetworkError }
  > {
    let currentUrl = new URL(urlStr);
    let redirects = 0;

    while (true) {
      if (signal?.aborted) {
        signal.throwIfAborted();
      }

      const headers = useDefaultHeaders
        ? new Headers(DEFAULT_HEADERS)
        : new Headers();

      const init: RequestInit = {
        method,
        headers,
        signal,
        redirect: "manual",
      };

      let response: FetchResult;

      try {
        response = await resolvedFetch(currentUrl.href, init);
      } catch (error) {
        if (error instanceof USCCBBotChallengeError) {
          throw error;
        }
        if (error instanceof USCCBError) {
          throw error;
        }
        if (signal?.aborted || isAbortOrTimeoutError(error)) {
          const message =
            error instanceof Error ? error.message : String(error);
          throw new USCCBNetworkError(
            `Network request failed for ${sanitizeUrlForLog(currentUrl.href)}: ${message}`,
            {
              cause: error,
              url: sanitizeUrlForLog(currentUrl.href),
              retryable: false,
            }
          );
        }
        const message = error instanceof Error ? error.message : String(error);
        return {
          kind: "retryable_error",
          error: new USCCBNetworkError(
            `Network request failed for ${sanitizeUrlForLog(currentUrl.href)}: ${message}`,
            {
              cause: error,
              url: sanitizeUrlForLog(currentUrl.href),
              retryable: true,
            }
          ),
        };
      }

      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers &&
        typeof response.headers.get === "function"
      ) {
        const location = response.headers.get("location");
        if (location) {
          if (redirects >= maxRedirects) {
            throw new USCCBNetworkError("Maximum redirect count exceeded", {
              url: sanitizeUrlForLog(currentUrl.href),
              retryable: false,
            });
          }
          const targetUrl = new URL(location, currentUrl);
          if (
            (targetUrl.protocol !== "https:" &&
              targetUrl.protocol !== "http:") ||
            targetUrl.username ||
            targetUrl.password
          ) {
            throw new USCCBNetworkError(
              `Unsafe redirect target from ${currentUrl.origin} is not allowed`,
              { url: sanitizeUrlForLog(currentUrl.href), retryable: false }
            );
          }
          if (targetUrl.origin !== currentUrl.origin) {
            throw new USCCBNetworkError(
              `Cross-origin redirect from ${currentUrl.origin} to ${targetUrl.origin} is not allowed`,
              { url: sanitizeUrlForLog(currentUrl.href), retryable: false }
            );
          }
          currentUrl = targetUrl;
          redirects++;
          continue;
        }
      }

      if (response.url) {
        try {
          const finalUrl = new URL(response.url, currentUrl.href);
          const originalUrl = new URL(urlStr);
          if (finalUrl.origin !== originalUrl.origin) {
            throw new USCCBNetworkError(
              `Cross-origin redirect detected: ${originalUrl.origin} -> ${finalUrl.origin}`,
              { url: sanitizeUrlForLog(response.url), retryable: false }
            );
          }
        } catch (e) {
          if (e instanceof USCCBNetworkError) throw e;
        }
      }

      const retryAfterMs =
        response.headers && typeof response.headers.get === "function"
          ? parseRetryAfterMs(response.headers.get("retry-after"))
          : null;

      if (method === "HEAD") {
        return {
          kind: "response",
          response: {
            text: "",
            ok: response.ok,
            status: response.status,
            url: response.url || currentUrl.href,
          },
          retryAfterMs,
        };
      }

      if (response.headers && typeof response.headers.get === "function") {
        const contentType = response.headers.get("content-type");
        if (
          contentType &&
          contentType.trim() !== "" &&
          !isHtmlOrXmlContentType(contentType)
        ) {
          throw new USCCBNetworkError(
            `Expected HTML content type from ${sanitizeUrlForLog(currentUrl.href)}, but received ${contentType}`,
            {
              url: sanitizeUrlForLog(currentUrl.href),
              status: response.status,
              retryable: false,
            }
          );
        }
      }

      let text: string;
      try {
        text = await readBoundedText(response, maxResponseSizeBytes);
      } catch (error) {
        if (error instanceof USCCBError) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new USCCBNetworkError(
          `Failed to read response body from ${sanitizeUrlForLog(currentUrl.href)}: ${message}`,
          {
            cause: error,
            url: sanitizeUrlForLog(currentUrl.href),
            status: response.status,
          }
        );
      }

      return {
        kind: "response",
        response: {
          text,
          ok: response.ok,
          status: response.status,
          url: response.url || currentUrl.href,
        },
        retryAfterMs,
      };
    }
  }

  async function executeRequest(
    urlStr: string,
    method: "GET" | "HEAD",
    callerOptions?: HttpRequestOptions
  ): Promise<HttpResponse> {
    const signal = combineSignals(
      callerOptions?.timeoutMs ?? timeoutMs,
      callerOptions?.signal
    );

    let remainingBudgetMs = maxTotalRetryDelayMs;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) {
        signal.throwIfAborted();
      }

      const outcome = await executeSingleAttempt(urlStr, method, signal);

      if (outcome.kind === "response") {
        const { response, retryAfterMs } = outcome;
        if (
          !RETRYABLE_HTTP_STATUSES.has(response.status) ||
          attempt >= maxRetries
        ) {
          return response;
        }
        const delayMs = computeRetryDelayMs(
          attempt,
          retryAfterMs,
          remainingBudgetMs
        );
        if (delayMs === null) {
          return response;
        }
        remainingBudgetMs -= delayMs;
        await sleepWithSignal(delayMs, signal);
        continue;
      }

      if (attempt >= maxRetries) {
        throw outcome.error;
      }

      const delayMs = computeRetryDelayMs(attempt, null, remainingBudgetMs);
      if (delayMs === null) {
        throw outcome.error;
      }
      remainingBudgetMs -= delayMs;
      await sleepWithSignal(delayMs, signal);
    }

    throw new USCCBNetworkError(
      `Network request failed for ${sanitizeUrlForLog(urlStr)}`,
      { url: sanitizeUrlForLog(urlStr), retryable: true }
    );
  }

  const client: HttpClient = {
    async get(
      url: string,
      options?: HttpRequestOptions
    ): Promise<HttpResponse> {
      return executeRequest(url, "GET", options);
    },
    async head(
      url: string,
      options?: HttpRequestOptions
    ): Promise<HttpResponse> {
      return executeRequest(url, "HEAD", options);
    },
  };

  if ("reset" in resolvedFetch && typeof resolvedFetch.reset === "function") {
    client.reset = (origin?: string) => {
      (resolvedFetch.reset as (o?: string) => void)(origin);
    };
  }

  return client;
}
