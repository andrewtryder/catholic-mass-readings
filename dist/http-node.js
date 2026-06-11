import { createFetchClient } from "./http.js";
/**
 * Create an HTTP client for Node.js using `impit` TLS impersonation when available.
 * Falls back to plain `fetch` if `impit` is not installed.
 */
export async function createNodeHttpClient() {
    try {
        const { Impit } = await import("impit");
        const impit = new Impit({ browser: "chrome" });
        return createFetchClient((input, init) => impit.fetch(input, init));
    }
    catch {
        return createFetchClient();
    }
}
//# sourceMappingURL=http-node.js.map