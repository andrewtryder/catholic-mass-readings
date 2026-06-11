import { createFetchClient } from "./http.js";
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