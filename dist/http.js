const DEFAULT_HEADERS = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};
/**
 * Create an {@link HttpClient} backed by the platform `fetch` API (or a compatible implementation).
 */
export function createFetchClient(fetchImpl = fetch) {
    return {
        async get(url) {
            const response = await fetchImpl(url, { headers: DEFAULT_HEADERS });
            const text = await response.text();
            return {
                text,
                ok: response.ok,
                status: response.status,
                url: response.url || url,
            };
        },
        async head(url) {
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
//# sourceMappingURL=http.js.map