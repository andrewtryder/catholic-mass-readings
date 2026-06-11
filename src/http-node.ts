import { createFetchClient } from "./http.js";

export async function createNodeHttpClient() {
  try {
    const { Impit } = await import("impit");
    const impit = new Impit({ browser: "chrome" });
    return createFetchClient((input, init) =>
      impit.fetch(input, init as Parameters<typeof impit.fetch>[1])
    );
  } catch {
    return createFetchClient();
  }
}
