import { createFetchClient } from "./http.js";
import { wrapFetchWithObolus } from "./http-obolus.js";

/**
 * Create an HTTP client for Node.js using `impit` TLS impersonation when available.
 * Falls back to plain `fetch` if `impit` is not installed.
 * Automatically solves USCCB Obolus proof-of-work challenges.
 */
export async function createNodeHttpClient() {
  const { fetchImpl, useDefaultHeaders } = await createNodeFetch();
  return createFetchClient(wrapFetchWithObolus(fetchImpl), {
    useDefaultHeaders,
  });
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
