import { USCCBArgumentError, USCCBError, USCCBNetworkError } from "./errors.js";
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

/**
 * Create an {@link HttpClient} backed by the platform `fetch` API (or a compatible implementation).
 */
export function createFetchClient(
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  options: CreateFetchClientOptions = {}
): HttpClient {
  if (
    options.timeoutMs !== undefined &&
    (!Number.isFinite(options.timeoutMs) ||
      options.timeoutMs < 0 ||
      !Number.isInteger(options.timeoutMs))
  ) {
    throw new USCCBArgumentError(
      `timeoutMs must be a non-negative integer; received '${options.timeoutMs}'`
    );
  }
  if (
    options.maxResponseSizeBytes !== undefined &&
    (!Number.isFinite(options.maxResponseSizeBytes) ||
      options.maxResponseSizeBytes < 0 ||
      !Number.isInteger(options.maxResponseSizeBytes))
  ) {
    throw new USCCBArgumentError(
      `maxResponseSizeBytes must be a non-negative integer; received '${options.maxResponseSizeBytes}'`
    );
  }
  if (
    options.maxRedirects !== undefined &&
    (!Number.isFinite(options.maxRedirects) ||
      options.maxRedirects < 0 ||
      !Number.isInteger(options.maxRedirects))
  ) {
    throw new USCCBArgumentError(
      `maxRedirects must be a non-negative integer; received '${options.maxRedirects}'`
    );
  }

  const {
    useDefaultHeaders = true,
    obolus = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxResponseSizeBytes = MAX_RESPONSE_SIZE_BYTES,
    maxRedirects = MAX_REDIRECTS,
  } = options;
  const resolvedFetch = obolus
    ? wrapFetchWithObolus(fetchImpl, { maxResponseSizeBytes })
    : fetchImpl;

  async function executeRequest(
    urlStr: string,
    method: "GET" | "HEAD",
    callerOptions?: HttpRequestOptions
  ): Promise<HttpResponse> {
    const signal = combineSignals(
      callerOptions?.timeoutMs ?? timeoutMs,
      callerOptions?.signal
    );

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
        if (error instanceof USCCBError) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new USCCBNetworkError(
          `Network request failed for ${currentUrl.href}: ${message}`,
          { cause: error, url: currentUrl.href }
        );
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
              url: currentUrl.href,
            });
          }
          const targetUrl = new URL(location, currentUrl);
          if (targetUrl.origin !== currentUrl.origin) {
            throw new USCCBNetworkError(
              `Cross-origin redirect from ${currentUrl.origin} to ${targetUrl.origin} is not allowed`,
              { url: currentUrl.href }
            );
          }
          currentUrl = targetUrl;
          redirects++;
          continue;
        }
      }

      if (response.url) {
        try {
          const finalUrl = new URL(response.url);
          const originalUrl = new URL(urlStr);
          if (finalUrl.origin !== originalUrl.origin) {
            throw new USCCBNetworkError(
              `Cross-origin redirect detected: ${originalUrl.origin} -> ${finalUrl.origin}`,
              { url: response.url }
            );
          }
        } catch (e) {
          if (e instanceof USCCBNetworkError) throw e;
        }
      }

      if (method === "HEAD") {
        return {
          text: "",
          ok: response.ok,
          status: response.status,
          url: response.url || currentUrl.href,
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
            `Expected HTML content type from ${currentUrl.href}, but received ${contentType}`,
            { url: currentUrl.href, status: response.status }
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
          `Failed to read response body from ${currentUrl.href}: ${message}`,
          { cause: error, url: currentUrl.href, status: response.status }
        );
      }

      return {
        text,
        ok: response.ok,
        status: response.status,
        url: response.url || currentUrl.href,
      };
    }
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
