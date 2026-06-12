import { createFetchClient } from "./http.js";
/**
 * Create an HTTP client recommended for live USCCB requests in Node.js.
 * The CLI uses this by default.
 */
export async function createNodeHttpClient() {
    const { fetchImpl, useDefaultHeaders } = await createNodeFetch();
    return createFetchClient(fetchImpl, { useDefaultHeaders });
}
async function createNodeFetch() {
    try {
        const { Impit } = await import("impit");
        const impit = new Impit({ browser: "chrome" });
        return {
            fetchImpl: (input, init) => impit.fetch(input, init),
            useDefaultHeaders: false,
        };
    }
    catch {
        return { fetchImpl: fetch, useDefaultHeaders: true };
    }
}
//# sourceMappingURL=http-node.js.map