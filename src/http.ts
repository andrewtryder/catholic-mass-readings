import { wrapFetchWithObolus } from "./http-obolus.js";

/** HTTP response returned by {@link HttpClient}. */
export interface HttpResponse {
  text: string;
  ok: boolean;
  status: number;
  url: string;
}

/**
 * Pluggable HTTP client used by {@link USCCB} for fetching mass pages.
 * Inject a custom implementation for testing or alternate fetch backends.
 */
export interface HttpClient {
  /** Fetch a URL with GET. */
  get(url: string): Promise<HttpResponse>;
  /** Fetch a URL with HEAD (used to probe available mass types). */
  head(url: string): Promise<HttpResponse>;
}

const DEFAULT_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Pick<Response, "text" | "ok" | "status" | "url">>;

export type CreateFetchClientOptions = {
  useDefaultHeaders?: boolean;
  /** Apply USCCB-specific fetch handling for live requests (default: true). */
  obolus?: boolean;
};

/**
 * Create an {@link HttpClient} backed by the platform `fetch` API (or a compatible implementation).
 */
export function createFetchClient(
  fetchImpl: FetchLike = fetch,
  options: CreateFetchClientOptions = {}
): HttpClient {
  const { useDefaultHeaders = true, obolus = true } = options;
  const resolvedFetch = obolus ? wrapFetchWithObolus(fetchImpl) : fetchImpl;

  return {
    async get(url: string): Promise<HttpResponse> {
      const response = await resolvedFetch(
        url,
        useDefaultHeaders ? { headers: DEFAULT_HEADERS } : undefined
      );
      const text = await response.text();
      return {
        text,
        ok: response.ok,
        status: response.status,
        url: response.url || url,
      };
    },
    async head(url: string): Promise<HttpResponse> {
      const response = await resolvedFetch(
        url,
        useDefaultHeaders
          ? { method: "HEAD", headers: DEFAULT_HEADERS }
          : { method: "HEAD" }
      );
      return {
        text: "",
        ok: response.ok,
        status: response.status,
        url: response.url || url,
      };
    },
  };
}
