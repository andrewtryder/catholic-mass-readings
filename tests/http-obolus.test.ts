import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetObolusState, wrapFetchWithObolus } from "../src/http-obolus.js";

vi.mock("../src/obolus.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/obolus.js")>();
  return {
    ...actual,
    solveObolusChallenge: vi.fn(async () => "ts:nonce:token:10:42"),
  };
});

const testDir = dirname(fileURLToPath(import.meta.url));
const dataDir = join(testDir, "data");
const challengeHtml = readFileSync(
  join(dataDir, "obolus-challenge.html"),
  "utf-8"
);
const successHtml = readFileSync(
  join(dataDir, "mass-single-reading.html"),
  "utf-8"
);

function mockResponse(
  status: number,
  text: string
): Pick<Response, "text" | "ok" | "status" | "url"> {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: "https://bible.usccb.org/bible/readings/061226.cfm",
    text: async () => text,
  };
}

describe("wrapFetchWithObolus", () => {
  beforeEach(() => {
    resetObolusState();
    vi.clearAllMocks();
  });

  it("returns successful responses without solving", async () => {
    const fetchImpl = vi.fn(async () => mockResponse(200, successHtml));
    const wrapped = wrapFetchWithObolus(fetchImpl);

    const response = await wrapped("https://example.test/readings");
    const text = await response.text();

    expect(text).toContain("Feast of the Transfiguration");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("solves a challenge and retries once", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(403, challengeHtml))
      .mockResolvedValueOnce(mockResponse(200, successHtml));

    const wrapped = wrapFetchWithObolus(fetchImpl);
    const response = await wrapped("https://example.test/readings");
    const text = await response.text();

    expect(response.ok).toBe(true);
    expect(text).toContain("Feast of the Transfiguration");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("handles HEAD requests after solving a challenge", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(403, ""))
      .mockResolvedValueOnce(mockResponse(403, challengeHtml))
      .mockResolvedValueOnce(mockResponse(200, ""));

    const wrapped = wrapFetchWithObolus(fetchImpl);
    const response = await wrapped("https://example.test/readings", {
      method: "HEAD",
    });

    expect(response.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("clears a rejected proof cookie and solves again", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(403, challengeHtml))
      .mockResolvedValueOnce(mockResponse(403, challengeHtml))
      .mockResolvedValueOnce(mockResponse(403, challengeHtml))
      .mockResolvedValueOnce(mockResponse(200, successHtml));

    const wrapped = wrapFetchWithObolus(fetchImpl);
    const response = await wrapped("https://example.test/readings");
    const text = await response.text();

    expect(response.ok).toBe(true);
    expect(text).toContain("Feast of the Transfiguration");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
