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
});
