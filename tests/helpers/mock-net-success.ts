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
  if (method === "HEAD") {
    const isDefault =
      urlString.includes("080625.cfm") && !urlString.includes("-");
    return {
      text: async () => "",
      ok: isDefault,
      status: isDefault ? 200 : 404,
      url: urlString,
    };
  }
  return {
    text: async () => html,
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
