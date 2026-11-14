import { Impit } from "impit";

function mockResponse(input: unknown) {
  const urlString =
    typeof input === "string"
      ? input
      : input && typeof input === "object" && "url" in input
        ? String((input as { url: unknown }).url)
        : String(input);

  if (urlString.includes("-Day.cfm")) {
    return {
      text: async () => "",
      ok: true,
      status: 200,
      url: urlString,
    };
  }

  if (urlString.includes("-Vigil.cfm")) {
    return {
      text: async () => "",
      ok: false,
      status: 503,
      url: urlString,
    };
  }

  return {
    text: async () => "",
    ok: false,
    status: 404,
    url: urlString,
  };
}

globalThis.fetch = async (input) =>
  mockResponse(input) as unknown as ReturnType<typeof globalThis.fetch>;

Impit.prototype.fetch = async (input) =>
  mockResponse(input) as unknown as ReturnType<typeof Impit.prototype.fetch>;
