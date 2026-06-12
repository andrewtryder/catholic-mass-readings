import { wrapFetchWithObolus } from "./http-obolus.js";
const DEFAULT_HEADERS = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};
/**
 * Create an {@link HttpClient} backed by the platform `fetch` API (or a compatible implementation).
 */
export function createFetchClient(fetchImpl = fetch, options = {}) {
    const { useDefaultHeaders = true, obolus = true } = options;
    const resolvedFetch = obolus ? wrapFetchWithObolus(fetchImpl) : fetchImpl;
    return {
        async get(url) {
            const response = await resolvedFetch(url, useDefaultHeaders ? { headers: DEFAULT_HEADERS } : undefined);
            const text = await response.text();
            return {
                text,
                ok: response.ok,
                status: response.status,
                url: response.url || url,
            };
        },
        async head(url) {
            const response = await resolvedFetch(url, useDefaultHeaders
                ? { method: "HEAD", headers: DEFAULT_HEADERS }
                : { method: "HEAD" });
            return {
                text: "",
                ok: response.ok,
                status: response.status,
                url: response.url || url,
            };
        },
    };
}
//# sourceMappingURL=http.js.map