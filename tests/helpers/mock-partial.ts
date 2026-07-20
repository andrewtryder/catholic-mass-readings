import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Impit } from "impit";

const testDir = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(testDir, "..", "data", "mass-single-reading.html");
const html = readFileSync(htmlPath, "utf-8");

function mockResponse(input: unknown, init?: { method?: string }) {
  const urlString =
    typeof input === "string"
      ? input
      : input && typeof input === "object" && "url" in input
        ? String((input as { url: unknown }).url)
        : String(input);
  const method = (init?.method || "GET").toUpperCase();

  if (urlString.includes("072126")) {
    throw new TypeError("fetch failed: network error on 2026-07-21");
  }

  if (urlString.includes("072226")) {
    return {
      text: async () => "",
      ok: false,
      status: 404,
      url: urlString,
    };
  }

  return {
    text: async () => (method === "HEAD" ? "" : html),
    ok: true,
    status: 200,
    url: urlString,
  };
}

globalThis.fetch = async (input, init) =>
  mockResponse(input, init as { method?: string }) as unknown as ReturnType<
    typeof globalThis.fetch
  >;

Impit.prototype.fetch = async (input, init) =>
  mockResponse(input, init as { method?: string }) as unknown as ReturnType<
    typeof Impit.prototype.fetch
  >;
