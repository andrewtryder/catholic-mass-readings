import type { CreateFetchClientOptions, HttpClient } from "./http.js";
import { createFetchClient } from "./http.js";

/**
 * Creates the recommended Node.js HTTP client. It uses the optional Impit backend when available and falls back to the platform Fetch API.
 */
export async function createNodeHttpClient(
  options: CreateFetchClientOptions = {}
): Promise<HttpClient> {
  const { fetchImpl, useDefaultHeaders } = await createNodeFetch();
  return createFetchClient(fetchImpl, {
    useDefaultHeaders: options.useDefaultHeaders ?? useDefaultHeaders,
    ...options,
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
