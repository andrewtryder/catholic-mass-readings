import { createFetchClient } from "./http.js";

/**
 * Create an HTTP client recommended for live USCCB requests in Node.js.
 * The CLI uses this by default.
 */
export async function createNodeHttpClient() {
  const { fetchImpl, useDefaultHeaders } = await createNodeFetch();
  return createFetchClient(fetchImpl, { useDefaultHeaders });
}

async function createNodeFetch(): Promise<{
  fetchImpl: (
    input: string | URL | Request,
    init?: RequestInit
  ) => Promise<Pick<Response, "text" | "ok" | "status" | "url">>;
  useDefaultHeaders: boolean;
}> {
  try {
    const { Impit } = await import("impit");
    const impit = new Impit({ browser: "chrome" });
    return {
      fetchImpl: (input, init) =>
        impit.fetch(input, init as Parameters<typeof impit.fetch>[1]),
      useDefaultHeaders: false,
    };
  } catch {
    return { fetchImpl: fetch, useDefaultHeaders: true };
  }
}
