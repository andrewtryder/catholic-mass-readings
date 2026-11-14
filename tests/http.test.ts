import { describe, expect, it, vi } from "vitest";
import {
  combineSignals,
  createFetchClient,
  parseRetryAfterMs,
} from "../src/http.js";
import { USCCBArgumentError, USCCBNetworkError } from "../src/errors.js";

function mockFetchResponse(options: {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  url?: string;
}) {
  const status = options.status ?? 200;
  const headers = new Headers(
    options.headers ?? { "content-type": "text/html" }
  );
  const bodyText = options.body ?? "<html><body>test</body></html>";
  const url =
    options.url ?? "https://bible.usccb.org/bible/readings/010125.cfm";

  let sent = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!sent) {
        sent = true;
        controller.enqueue(new TextEncoder().encode(bodyText));
      } else {
        controller.close();
      }
    },
  });

  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers,
    text: async () => bodyText,
    body: stream,
  };
}

describe("createFetchClient resource limits and security", () => {
  it("enforces required HTML content type", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () =>
      mockFetchResponse({
        headers: { "content-type": "application/json" },
        body: '{"error": true}',
      })
    );

    const client = createFetchClient(fetchImpl, { obolus: false });
    await expect(
      client.get("https://bible.usccb.org/bible/readings/010125.cfm")
    ).rejects.toThrow(USCCBNetworkError);
    await expect(
      client.get("https://bible.usccb.org/bible/readings/010125.cfm")
    ).rejects.toThrow(/Expected HTML content type/i);
  });

  it("enforces response size limit via bounded streaming", async () => {
    const largeBody = "a".repeat(200);
    const fetchImpl = vi.fn().mockImplementation(async () =>
      mockFetchResponse({
        body: largeBody,
      })
    );

    const client = createFetchClient(fetchImpl, {
      obolus: false,
      maxResponseSizeBytes: 100,
    });
    await expect(
      client.get("https://bible.usccb.org/bible/readings/010125.cfm")
    ).rejects.toThrow(USCCBNetworkError);
    await expect(
      client.get("https://bible.usccb.org/bible/readings/010125.cfm")
    ).rejects.toThrow(/exceeded maximum allowed size/i);
  });

  it("enforces maximum redirect count", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (urlStr: string) => {
      return mockFetchResponse({
        status: 302,
        headers: {
          location: "https://bible.usccb.org/bible/readings/next.cfm",
        },
        url: urlStr,
      });
    });

    const client = createFetchClient(fetchImpl, {
      obolus: false,
      maxRedirects: 2,
    });
    await expect(
      client.get("https://bible.usccb.org/bible/readings/010125.cfm")
    ).rejects.toThrow(USCCBNetworkError);
    await expect(
      client.get("https://bible.usccb.org/bible/readings/010125.cfm")
    ).rejects.toThrow(/Maximum redirect count exceeded/i);
  });

  it("enforces same-origin redirect constraints", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (urlStr: string) => {
      return mockFetchResponse({
        status: 302,
        headers: {
          location: "https://evil.example.com/steal-data",
        },
        url: urlStr,
      });
    });

    const client = createFetchClient(fetchImpl, { obolus: false });
    await expect(
      client.get("https://bible.usccb.org/bible/readings/010125.cfm")
    ).rejects.toThrow(USCCBNetworkError);
    await expect(
      client.get("https://bible.usccb.org/bible/readings/010125.cfm")
    ).rejects.toThrow(/Cross-origin redirect/i);
  });

  it("wraps raw network rejections in USCCBNetworkError with options and url metadata", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const client = createFetchClient(fetchImpl, { obolus: false });
    await expect(
      client.get("https://bible.usccb.org/bible/readings/010125.cfm")
    ).rejects.toThrow(USCCBNetworkError);
    await expect(
      client.get("https://bible.usccb.org/bible/readings/010125.cfm")
    ).rejects.toThrow(/ECONNREFUSED/);

    try {
      await client.get("https://bible.usccb.org/bible/readings/010125.cfm");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(USCCBNetworkError);
      const networkErr = err as USCCBNetworkError;
      expect(networkErr.url).toBe(
        "https://bible.usccb.org/bible/readings/010125.cfm"
      );
      expect(networkErr.options?.url).toBe(
        "https://bible.usccb.org/bible/readings/010125.cfm"
      );
    }
  });

  it("USCCBNetworkError supports both legacy cause argument and structured options object", () => {
    const causeErr = new Error("legacy");
    const legacy = new USCCBNetworkError("msg", causeErr);
    expect(legacy.cause).toBe(causeErr);
    expect(legacy.status).toBeUndefined();

    const structured = new USCCBNetworkError("msg", {
      cause: causeErr,
      status: 500,
      url: "https://bible.usccb.org",
      retryable: true,
    });
    expect(structured.cause).toBe(causeErr);
    expect(structured.status).toBe(500);
    expect(structured.url).toBe("https://bible.usccb.org");
    expect(structured.retryable).toBe(true);
    expect(structured.options?.status).toBe(500);
  });

  it("supports caller cancellation via AbortSignal", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockImplementation(async (_url, init) => {
      if (init?.signal?.aborted) {
        init.signal.throwIfAborted();
      }
      return mockFetchResponse({});
    });

    const client = createFetchClient(fetchImpl, { obolus: false });
    controller.abort();

    await expect(
      client.get("https://bible.usccb.org/bible/readings/010125.cfm", {
        signal: controller.signal,
      })
    ).rejects.toThrow();
  });

  it("aborts request when timeoutMs is exceeded", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (_url, init) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal.reason ?? new Error("Timeout"));
        });
      });
    });

    const client = createFetchClient(fetchImpl, {
      obolus: false,
      timeoutMs: 1,
    });

    await expect(
      client.get("https://bible.usccb.org/bible/readings/010125.cfm")
    ).rejects.toThrow();
  });

  it("enforces response size limit for non-streaming response bodies", async () => {
    const largeBody = "b".repeat(200);
    const fetchImpl = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      url: "https://bible.usccb.org/bible/readings/010125.cfm",
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => largeBody,
      body: null,
    }));

    const client = createFetchClient(fetchImpl, {
      obolus: false,
      maxResponseSizeBytes: 100,
    });

    await expect(
      client.get("https://bible.usccb.org/bible/readings/010125.cfm")
    ).rejects.toThrow(/exceeded maximum allowed size/i);
  });
});

describe("createFetchClient redirect and security limits with Obolus enabled (default)", () => {
  it("enforces maximum redirect count when obolus is enabled", async () => {
    let callCount = 0;
    const fetchImpl = vi.fn().mockImplementation(async (urlStr: string) => {
      callCount++;
      return mockFetchResponse({
        status: 302,
        headers: {
          location: "https://bible.usccb.org/bible/readings/next.cfm",
        },
        url: urlStr,
      });
    });

    const client = createFetchClient(fetchImpl, {
      obolus: true,
      maxRedirects: 2,
    });
    await expect(
      client.get("https://bible.usccb.org/bible/readings/010125.cfm")
    ).rejects.toThrow(/Maximum redirect count exceeded/i);
    expect(callCount).toBe(3); // Initial + 2 redirects
  });

  it("prevents cross-origin redirects from contacting target origin when obolus is enabled", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async (input: string | URL | Request) => {
        const urlStr = typeof input === "string" ? input : input.toString();
        const parsedUrl = new URL(urlStr);
        if (parsedUrl.hostname === "bible.usccb.org") {
          return mockFetchResponse({
            status: 302,
            headers: {
              location: "https://evil.example.com/steal-data",
            },
            url: urlStr,
          });
        }
        return mockFetchResponse({ body: "should not be reached" });
      });

    const client = createFetchClient(fetchImpl, { obolus: true });
    await expect(
      client.get("https://bible.usccb.org/bible/readings/010125.cfm")
    ).rejects.toThrow(
      /Cross-origin redirect from https:\/\/bible\.usccb\.org to https:\/\/evil\.example\.com is not allowed/i
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("follows relative and same-origin redirects with obolus enabled", async () => {
    let callCount = 0;
    const fetchImpl = vi
      .fn()
      .mockImplementation(async (input: string | URL | Request) => {
        callCount++;
        const urlStr = typeof input === "string" ? input : input.toString();
        if (callCount === 1) {
          return mockFetchResponse({
            status: 302,
            headers: {
              location: "/bible/readings/010225.cfm",
            },
            url: urlStr,
          });
        }
        return mockFetchResponse({
          status: 200,
          body: "<html><body>Reading 2</body></html>",
          url: urlStr,
        });
      });

    const client = createFetchClient(fetchImpl, { obolus: true });
    const response = await client.get(
      "https://bible.usccb.org/bible/readings/010125.cfm"
    );
    expect(response.status).toBe(200);
    expect(response.text).toBe("<html><body>Reading 2</body></html>");
    expect(callCount).toBe(2);
  });

  it("exposes and forwards client.reset() when obolus is enabled", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => mockFetchResponse({}));
    const client = createFetchClient(fetchImpl, { obolus: true });
    expect(typeof client.reset).toBe("function");
    expect(() => client.reset?.()).not.toThrow();
  });
});

describe("option and timeout validation", () => {
  it("createFetchClient rejects negative, fractional, and nonfinite timeoutMs", () => {
    expect(() => createFetchClient(vi.fn(), { timeoutMs: -1 })).toThrow(
      USCCBArgumentError
    );
    expect(() => createFetchClient(vi.fn(), { timeoutMs: 10.5 })).toThrow(
      USCCBArgumentError
    );
    expect(() => createFetchClient(vi.fn(), { timeoutMs: NaN })).toThrow(
      USCCBArgumentError
    );
    expect(() => createFetchClient(vi.fn(), { timeoutMs: Infinity })).toThrow(
      USCCBArgumentError
    );
  });

  it("createFetchClient rejects negative, fractional, and nonfinite maxResponseSizeBytes", () => {
    expect(() =>
      createFetchClient(vi.fn(), { maxResponseSizeBytes: -1 })
    ).toThrow(USCCBArgumentError);
    expect(() =>
      createFetchClient(vi.fn(), { maxResponseSizeBytes: 100.5 })
    ).toThrow(USCCBArgumentError);
    expect(() =>
      createFetchClient(vi.fn(), { maxResponseSizeBytes: NaN })
    ).toThrow(USCCBArgumentError);
    expect(() =>
      createFetchClient(vi.fn(), { maxResponseSizeBytes: Infinity })
    ).toThrow(USCCBArgumentError);
  });

  it("createFetchClient rejects negative, fractional, and nonfinite maxRedirects", () => {
    expect(() => createFetchClient(vi.fn(), { maxRedirects: -1 })).toThrow(
      USCCBArgumentError
    );
    expect(() => createFetchClient(vi.fn(), { maxRedirects: 2.5 })).toThrow(
      USCCBArgumentError
    );
    expect(() => createFetchClient(vi.fn(), { maxRedirects: NaN })).toThrow(
      USCCBArgumentError
    );
    expect(() =>
      createFetchClient(vi.fn(), { maxRedirects: Infinity })
    ).toThrow(USCCBArgumentError);
  });

  it("combineSignals rejects negative, fractional, and nonfinite timeoutMs override", () => {
    expect(() => combineSignals(-100)).toThrow(USCCBArgumentError);
    expect(() => combineSignals(5.5)).toThrow(USCCBArgumentError);
    expect(() => combineSignals(NaN)).toThrow(USCCBArgumentError);
    expect(() => combineSignals(Infinity)).toThrow(USCCBArgumentError);
  });

  it("blocks unsafe non-http/https redirect targets", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (urlStr: string) =>
      mockFetchResponse({
        status: 302,
        headers: { location: "file:///etc/passwd" },
        url: urlStr,
      })
    );

    const client = createFetchClient(fetchImpl, { obolus: false });
    await expect(
      client.get("https://bible.usccb.org/bible/readings/010125.cfm")
    ).rejects.toThrow(/Unsafe redirect target/i);
  });
});

describe("createFetchClient retry and backoff behavior", () => {
  it("retries transient HTTP 429, 502, 503, and 504 responses and succeeds", async () => {
    for (const status of [429, 502, 503, 504]) {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse({ status, body: "busy" }))
        .mockResolvedValueOnce(
          mockFetchResponse({ status: 200, body: "<html>ok</html>" })
        );

      const client = createFetchClient(fetchImpl, {
        obolus: false,
        maxRetries: 2,
        retryBaseDelayMs: 1,
        retryMaxDelayMs: 10,
        random: () => 0.5,
      });

      const res = await client.get(
        "https://bible.usccb.org/bible/readings/010125.cfm"
      );
      expect(res.ok).toBe(true);
      expect(res.text).toBe("<html>ok</html>");
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    }
  });

  it("retries transient network rejections and throws USCCBNetworkError when exhausted", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error("ECONNRESET: socket hang up"));

    const client = createFetchClient(fetchImpl, {
      obolus: false,
      maxRetries: 2,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 10,
      random: () => 0,
    });

    const err = await client
      .get("https://bible.usccb.org/bible/readings/010125.cfm")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(USCCBNetworkError);
    expect((err as USCCBNetworkError).retryable).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry permanent HTTP errors like 404 or 500", async () => {
    for (const status of [400, 404, 500]) {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(mockFetchResponse({ status, body: "err" }));
      const client = createFetchClient(fetchImpl, {
        obolus: false,
        maxRetries: 2,
        retryBaseDelayMs: 1,
      });
      const res = await client.get(
        "https://bible.usccb.org/bible/readings/010125.cfm"
      );
      expect(res.status).toBe(status);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("respects Retry-After header and stops when Retry-After exceeds budget", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      mockFetchResponse({
        status: 429,
        headers: { "content-type": "text/html", "retry-after": "60" },
        body: "rate limited",
      })
    );

    const client = createFetchClient(fetchImpl, {
      obolus: false,
      maxRetries: 2,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 500,
      maxTotalRetryDelayMs: 500,
    });

    const res = await client.get(
      "https://bible.usccb.org/bible/readings/010125.cfm"
    );
    expect(res.status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("cancels retry sleep immediately when AbortSignal aborts", async () => {
    const controller = new AbortController();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(mockFetchResponse({ status: 503, body: "busy" }));

    const client = createFetchClient(fetchImpl, {
      obolus: false,
      maxRetries: 3,
      retryBaseDelayMs: 5000,
      retryMaxDelayMs: 5000,
      maxTotalRetryDelayMs: 10000,
    });

    const promise = client.get(
      "https://bible.usccb.org/bible/readings/010125.cfm",
      { signal: controller.signal }
    );
    setTimeout(() => controller.abort(new Error("user cancelled")), 20);
    await expect(promise).rejects.toThrow("user cancelled");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("parseRetryAfterMs parses integer seconds and HTTP-dates", () => {
    expect(parseRetryAfterMs("5", 1000)).toBe(5000);
    expect(parseRetryAfterMs("0", 1000)).toBe(0);
    const future = new Date(10_000).toUTCString();
    expect(parseRetryAfterMs(future, 4000)).toBe(6000);
    expect(parseRetryAfterMs("invalid")).toBeNull();
    expect(parseRetryAfterMs(null)).toBeNull();
  });
});
