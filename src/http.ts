/** HTTP response returned by {@link HttpClient}. */
export interface HttpResponse {
  text: string;
  ok: boolean;
  status: number;
  url: string;
}

/**
 * Pluggable HTTP client used by {@link USCCB} for fetching mass pages.
 * Inject a custom implementation for testing or TLS impersonation (CLI uses `impit`).
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

/**
 * Create an {@link HttpClient} backed by the platform `fetch` API (or a compatible implementation).
 */
export function createFetchClient(fetchImpl: FetchLike = fetch): HttpClient {
  return {
    async get(url: string): Promise<HttpResponse> {
      const response = await fetchImpl(url, { headers: DEFAULT_HEADERS });
      const text = await response.text();
      return {
        text,
        ok: response.ok,
        status: response.status,
        url: response.url || url,
      };
    },
    async head(url: string): Promise<HttpResponse> {
      const response = await fetchImpl(url, {
        method: "HEAD",
        headers: DEFAULT_HEADERS,
      });
      return {
        text: "",
        ok: response.ok,
        status: response.status,
        url: response.url || url,
      };
    },
  };
}
