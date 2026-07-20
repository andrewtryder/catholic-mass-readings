import { describe, expect, it, vi } from "vitest";
import { createFetchClient } from "../src/http.js";
import { USCCBNetworkError } from "../src/errors.js";

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

  it("wraps raw network rejections in USCCBNetworkError", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const client = createFetchClient(fetchImpl, { obolus: false });
    await expect(
      client.get("https://bible.usccb.org/bible/readings/010125.cfm")
    ).rejects.toThrow(USCCBNetworkError);
    await expect(
      client.get("https://bible.usccb.org/bible/readings/010125.cfm")
    ).rejects.toThrow(/ECONNREFUSED/);
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
        if (urlStr.includes("bible.usccb.org")) {
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
