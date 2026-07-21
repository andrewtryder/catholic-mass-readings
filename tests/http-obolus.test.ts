import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { wrapFetchWithObolus } from "../src/http-obolus.js";
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

  it("supports client-local reset via wrapped.reset()", async () => {
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

  // --- P2 tests: HEAD challenge GET preserves init ---

  it("HEAD challenge GET receives the original headers", async () => {
    const capturedInits: RequestInit[] = [];
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        if (init) capturedInits.push(init);
        // HEAD → 403 (triggers challenge GET), challenge GET → returns challenge
        if (capturedInits.length === 1) return mockResponse(403, "");
        if (capturedInits.length === 2) return mockResponse(403, challengeHtml);
        // retry HEAD → 200
        return mockResponse(200, "");
      }
    );

    const wrapped = wrapFetchWithObolus(fetchImpl);
    await wrapped("https://bible.usccb.org/bible/readings/080625.cfm", {
      method: "HEAD",
      headers: {
        Accept: "text/html",
        "Accept-Language": "en-US",
        "User-Agent": "TestBot/1.0",
      },
    });

    // The challenge GET (2nd call) should carry the original headers
    const challengeInit = capturedInits[1];
    const headers = new Headers(challengeInit.headers);
    expect(challengeInit.method).toBe("GET");
    expect(headers.get("Accept")).toBe("text/html");
    expect(headers.get("Accept-Language")).toBe("en-US");
    expect(headers.get("User-Agent")).toBe("TestBot/1.0");
    expect(challengeInit.redirect).toBe("manual");
  });

  it("cross-origin redirect from the challenge GET does not contact its target", async () => {
    const contactedUrls: string[] = [];
    const fetchImpl = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        contactedUrls.push(url);

        const method = init?.method ?? "GET";
        // HEAD → 403
        if (method === "HEAD") return mockResponse(403, "");
        // Challenge GET → returns 302 to cross-origin
        return {
          ok: false,
          status: 302,
          url,
          headers: new Headers({
            location: "https://evil.example.com/steal",
          }),
          text: async (): Promise<string> => "",
        };
      }
    );

    const wrapped = wrapFetchWithObolus(fetchImpl);
    const response = await wrapped(
      "https://bible.usccb.org/bible/readings/080625.cfm",
      { method: "HEAD" }
    );

    // The challenge GET returns a 302, which the wrapper returns untouched
    expect(response.status).toBe(302);
    // The evil URL was never contacted — only the original USCCB URL was fetched
    expect(
      contactedUrls.every((u) => u.startsWith("https://bible.usccb.org/"))
    ).toBe(true);
  });

  it("withCookie enforces redirect: manual even without a proof cookie", async () => {
    const capturedInits: RequestInit[] = [];
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        if (init) capturedInits.push(init);
        return mockResponse(200, successHtml);
      }
    );

    const wrapped = wrapFetchWithObolus(fetchImpl);
    // First request — no proof cookie cached yet
    await wrapped("https://bible.usccb.org/bible/readings/080625.cfm");

    // Even with no cookie, the redirect policy should be manual
    expect(capturedInits[0].redirect).toBe("manual");
  });

  it("custom headers survive both challenge and verification GETs", async () => {
    const capturedInits: RequestInit[] = [];
    let callCount = 0;
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        if (init) capturedInits.push(init);
        callCount++;
        // Call 1: HEAD → 403
        // Call 2: challenge GET → challenge
        // Call 3: retry HEAD → 403 again
        // Call 4: verification GET → challenge (to exercise both paths)
        // Call 5: next attempt HEAD → 200
        if (callCount === 1) return mockResponse(403, "");
        if (callCount === 2) return mockResponse(403, challengeHtml);
        if (callCount === 3) return mockResponse(403, "");
        if (callCount === 4) return mockResponse(403, challengeHtml);
        return mockResponse(200, "");
      }
    );

    const wrapped = wrapFetchWithObolus(fetchImpl);
    await wrapped("https://bible.usccb.org/bible/readings/080625.cfm", {
      method: "HEAD",
      headers: {
        "X-Custom-Header": "keep-me",
        "Accept-Language": "fr-FR",
      },
    });

    // Challenge GET is call index 1, verification GET is call index 3
    for (const idx of [1, 3]) {
      const init = capturedInits[idx];
      const headers = new Headers(init.headers);
      expect(init.method).toBe("GET");
      expect(headers.get("X-Custom-Header")).toBe("keep-me");
      expect(headers.get("Accept-Language")).toBe("fr-FR");
      expect(init.redirect).toBe("manual");
    }
  });
});
