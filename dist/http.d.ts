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
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Pick<Response, "text" | "ok" | "status" | "url">>;
/**
 * Create an {@link HttpClient} backed by the platform `fetch` API (or a compatible implementation).
 */
export declare function createFetchClient(fetchImpl?: FetchLike, options?: {
    useDefaultHeaders?: boolean;
}): HttpClient;
export {};
//# sourceMappingURL=http.d.ts.map