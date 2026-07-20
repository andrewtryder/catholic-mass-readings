import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetObolusState, wrapFetchWithObolus } from "../src/http-obolus.js";
import { USCCBArgumentError } from "../src/errors.js";

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

    const response = await wrapped(
      "https://bible.usccb.org/bible/readings/080625.cfm"
    );
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
    const response = await wrapped(
      "https://bible.usccb.org/bible/readings/080625.cfm"
    );
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
    const response = await wrapped(
      "https://bible.usccb.org/bible/readings/080625.cfm",
      {
        method: "HEAD",
      }
    );

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
    const response = await wrapped(
      "https://bible.usccb.org/bible/readings/080625.cfm"
    );
    const text = await response.text();

    expect(response.ok).toBe(true);
    expect(text).toContain("Feast of the Transfiguration");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("bypasses Obolus challenge handling for non-USCCB origins", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(403, challengeHtml));

    const wrapped = wrapFetchWithObolus(fetchImpl);
    const response = await wrapped("https://example.test/readings");

    expect(response.status).toBe(403);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("scopes proof cookie inside the wrapper instance and not globally", async () => {
    const fetchImpl1 = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(403, challengeHtml))
      .mockResolvedValueOnce(mockResponse(200, successHtml));

    const wrapped1 = wrapFetchWithObolus(fetchImpl1);
    await wrapped1("https://bible.usccb.org/bible/readings/080625.cfm");
    expect(fetchImpl1).toHaveBeenCalledTimes(2);

    const fetchImpl2 = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(403, challengeHtml))
      .mockResolvedValueOnce(mockResponse(200, successHtml));

    const wrapped2 = wrapFetchWithObolus(fetchImpl2);
    await wrapped2("https://bible.usccb.org/bible/readings/080625.cfm");
    expect(fetchImpl2).toHaveBeenCalledTimes(2);
  });

  it("returns 3xx redirect responses untouched without following them", async () => {
    const redirectResponse: Pick<Response, "text" | "ok" | "status" | "url"> & {
      headers: Headers;
    } = {
      ok: false,
      status: 302,
      url: "https://bible.usccb.org/bible/readings/080625.cfm",
      headers: new Headers({ location: "https://evil.example.com/capture" }),
      text: async () => "",
    };

    const fetchImpl = vi
      .fn()
      .mockImplementation(
        async (input: string | URL | Request, init?: RequestInit) => {
          const cookieHeader = init?.headers
            ? new Headers(init.headers).get("Cookie")
            : null;
          if (cookieHeader?.includes("X_Obolus_Proof")) {
            return redirectResponse;
          }
          return mockResponse(403, challengeHtml);
        }
      );

    const wrapped = wrapFetchWithObolus(fetchImpl);
    const response = await wrapped(
      "https://bible.usccb.org/bible/readings/080625.cfm"
    );

    expect(response.status).toBe(302);
    expect(response.headers?.get("location")).toBe(
      "https://evil.example.com/capture"
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("prevents two concurrent requests from overwriting or resetting each other's active solver state", async () => {
    let challengeResponses = 0;
    const fetchImpl = vi
      .fn()
      .mockImplementation(
        async (_input: string | URL | Request, init?: RequestInit) => {
          const cookieHeader = init?.headers
            ? new Headers(init.headers).get("Cookie")
            : null;
          if (cookieHeader?.includes("X_Obolus_Proof")) {
            return mockResponse(200, successHtml);
          }
          challengeResponses++;
          return mockResponse(403, challengeHtml);
        }
      );

    const wrapped = wrapFetchWithObolus(fetchImpl);
    const [res1, res2] = await Promise.all([
      wrapped("https://bible.usccb.org/bible/readings/080625.cfm"),
      wrapped("https://bible.usccb.org/bible/readings/080625.cfm"),
    ]);

    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    expect(await res1.text()).toContain("Feast of the Transfiguration");
    expect(await res2.text()).toContain("Feast of the Transfiguration");
    expect(challengeResponses).toBe(2);
  });

  it("enforces response size limit during GET inside Obolus wrapper using readBoundedText", async () => {
    const largeBody = "x".repeat(200);
    const fetchImpl = vi.fn(async () => mockResponse(200, largeBody));

    const wrapped = wrapFetchWithObolus(fetchImpl, {
      maxResponseSizeBytes: 50,
    });

    await expect(
      wrapped("https://bible.usccb.org/bible/readings/080625.cfm")
    ).rejects.toThrow(/exceeded maximum allowed size/i);
  });

  it("supports client-local reset via wrapped.reset() and prunes dead WeakRef entries", async () => {
    const fetchImpl1 = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(403, challengeHtml))
      .mockResolvedValueOnce(mockResponse(200, successHtml))
      .mockResolvedValueOnce(mockResponse(403, challengeHtml))
      .mockResolvedValueOnce(mockResponse(200, successHtml));

    const wrapped1 = wrapFetchWithObolus(fetchImpl1);
    await wrapped1("https://bible.usccb.org/bible/readings/080625.cfm");
    expect(fetchImpl1).toHaveBeenCalledTimes(2);

    wrapped1.reset();
    await wrapped1("https://bible.usccb.org/bible/readings/080625.cfm");
    expect(fetchImpl1).toHaveBeenCalledTimes(4);

    expect(() => resetObolusState()).not.toThrow();
  });

  it("rejects negative, fractional, and nonfinite maxResponseSizeBytes", () => {
    expect(() =>
      wrapFetchWithObolus(vi.fn(), { maxResponseSizeBytes: -1 })
    ).toThrow(USCCBArgumentError);
    expect(() =>
      wrapFetchWithObolus(vi.fn(), { maxResponseSizeBytes: 50.5 })
    ).toThrow(USCCBArgumentError);
    expect(() =>
      wrapFetchWithObolus(vi.fn(), { maxResponseSizeBytes: NaN })
    ).toThrow(USCCBArgumentError);
    expect(() =>
      wrapFetchWithObolus(vi.fn(), { maxResponseSizeBytes: Infinity })
    ).toThrow(USCCBArgumentError);
  });
});
