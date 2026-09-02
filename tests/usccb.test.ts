import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  USCCBArgumentError,
  USCCBNetworkError,
  USCCBParseError,
} from "../src/errors.js";
import type { HttpClient } from "../src/http.js";
import { MassType, massToDict, parseMassType } from "../src/models.js";
import { cleanText, USCCB } from "../src/usccb.js";
import { parseIsoDate } from "../src/utils.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const dataDir = join(testDir, "data");

function createMockClient(fixturePath: string): HttpClient {
  const html = readFileSync(fixturePath, "utf-8");
  return {
    async get() {
      return { text: html, ok: true, status: 200, url: "" };
    },
    async head(url: string) {
      const isDefault = url.includes("080625.cfm") && !url.includes("-");
      return { text: "", ok: isDefault, status: isDefault ? 200 : 404, url };
    },
  };
}

async function testMassParse(htmlFile: string, jsonFile: string) {
  const expected = JSON.parse(readFileSync(join(dataDir, jsonFile), "utf-8"));
  const usccb = new USCCB(createMockClient(join(dataDir, htmlFile)));
  const date = parseIsoDate(expected.date);
  const mass = await usccb.getMass(date, MassType.DEFAULT);
  expect(mass).not.toBeNull();
  expect(massToDict(mass!)).toEqual(expected);
}

describe("USCCB parsing", () => {
  it("parses mass with single reading", async () => {
    await testMassParse("mass-single-reading.html", "mass-single-reading.json");
  });

  it("parses mass with multiple readings", async () => {
    await testMassParse(
      "mass-multiple-readings.html",
      "mass-multiple-readings.json"
    );
  });
});

describe("USCCB static helpers", () => {
  it("returns today as a date", () => {
    expect(USCCB.today()).toBeInstanceOf(Date);
  });

  it("max query date is after today", () => {
    expect(USCCB.maxQueryDate().getTime()).toBeGreaterThan(
      USCCB.today().getTime()
    );
  });

  it("getMassDates yields weekly sequence", () => {
    const dates = USCCB.getMassDates(
      parseIsoDate("2025-01-01"),
      parseIsoDate("2025-01-22"),
      7
    );
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2025-01-01",
      "2025-01-08",
      "2025-01-15",
    ]);
  });

  it("getMassDates rejects invalid range", () => {
    expect(() =>
      USCCB.getMassDates(parseIsoDate("2025-01-15"), parseIsoDate("2025-01-01"))
    ).toThrow(/Invalid range/);
  });

  it("getSundayMassDates starting on Sunday", () => {
    const dates = USCCB.getSundayMassDates(
      parseIsoDate("2025-01-05"),
      parseIsoDate("2025-01-27")
    );
    expect(dates.every((d) => d.getDay() === 0)).toBe(true);
    expect(dates[0].toISOString().slice(0, 10)).toBe("2025-01-05");
  });

  it("getSundayMassDates advances to next Sunday", () => {
    const dates = USCCB.getSundayMassDates(
      parseIsoDate("2025-01-06"),
      parseIsoDate("2025-01-27")
    );
    expect(dates.every((d) => d.getDay() === 0)).toBe(true);
    expect(dates[0].toISOString().slice(0, 10)).toBe("2025-01-12");
  });

  it("getSundayMassDates returns empty array when range ends before or at first Sunday (exclusive end)", () => {
    expect(
      USCCB.getSundayMassDates(
        parseIsoDate("2025-01-06"),
        parseIsoDate("2025-01-07")
      )
    ).toEqual([]);
    // start is Sunday Jan 5, end is Sunday Jan 5 (start >= end -> throws USCCBArgumentError)
    expect(() =>
      USCCB.getSundayMassDates(
        parseIsoDate("2025-01-05"),
        parseIsoDate("2025-01-05")
      )
    ).toThrow(USCCBArgumentError);
    // start < end (Mon Jan 6 -> Sun Jan 12), firstSunday is Jan 12 which equals end -> empty
    expect(
      USCCB.getSundayMassDates(
        parseIsoDate("2025-01-06"),
        parseIsoDate("2025-01-12")
      )
    ).toEqual([]);
  });

  it("getMassDates rejects 0, -1, 0.5, NaN, and Infinity stepDays", () => {
    const start = parseIsoDate("2025-01-01");
    const end = parseIsoDate("2025-01-15");
    for (const stepVal of [0, -1, 0.5, NaN, Infinity]) {
      expect(() => USCCB.getMassDates(start, end, stepVal)).toThrow(
        USCCBArgumentError
      );
    }
  });

  it("getMassDates and getSundayMassDates reject invalid dates", () => {
    const valid = parseIsoDate("2025-01-01");
    const invalid = new Date(NaN);
    expect(() => USCCB.getMassDates(invalid, valid)).toThrow(
      USCCBArgumentError
    );
    expect(() => USCCB.getMassDates(valid, invalid)).toThrow(
      USCCBArgumentError
    );
    expect(() => USCCB.getSundayMassDates(invalid, valid)).toThrow(
      USCCBArgumentError
    );
    expect(() => USCCB.getSundayMassDates(valid, invalid)).toThrow(
      USCCBArgumentError
    );
  });
});

describe("cleanText", () => {
  it("decodes html entities", () => {
    expect(cleanText("Hello &amp; World")).toBe("Hello & World");
    expect(cleanText("&amp;lt;")).toBe("&lt;");
  });

  it("replaces nbsp", () => {
    expect(cleanText("Hello\u00a0World")).toBe("Hello World");
  });

  it("collapses whitespace", () => {
    expect(cleanText("Hello   World")).toBe("Hello World");
  });

  it("adds space after period", () => {
    expect(cleanText("Hello.World")).toContain("Hello. World");
  });

  it("preserves newlines while collapsing horizontal whitespace", () => {
    expect(cleanText("Paragraph one.\n\nParagraph two.")).toBe(
      "Paragraph one.\n\nParagraph two."
    );
    expect(cleanText("Line one\r\nLine two\n\n\nLine three")).toBe(
      "Line one\n\nLine two\n\nLine three"
    );
  });
});

describe("getMassFromDate", () => {
  it("retries all mass types after resetting fetch state", async () => {
    const html = readFileSync(
      join(dataDir, "mass-single-reading.html"),
      "utf-8"
    );
    let calls = 0;
    const usccb = new USCCB({
      async get() {
        calls++;
        if (calls < 2) {
          return { text: "", ok: false, status: 403, url: "" };
        }
        return {
          text: html,
          ok: true,
          status: 200,
          url: "https://bible.usccb.org/bible/readings/080625.cfm",
        };
      },
      async head() {
        return { text: "", ok: false, status: 403, url: "" };
      },
    });

    const mass = await usccb.getMassFromDate(parseIsoDate("2025-08-06"), [
      MassType.DEFAULT,
    ]);

    expect(mass).not.toBeNull();
    expect(calls).toBe(2);
  });

  it("throws non-retryable network error directly without continuing or returning null", async () => {
    let calls = 0;
    const usccb = new USCCB({
      async get() {
        calls++;
        throw new USCCBNetworkError("Server Error 500", {
          status: 500,
          retryable: false,
          url: "https://bible.usccb.org/bible/readings/080625.cfm",
        });
      },
      async head() {
        return { text: "", ok: false, status: 500, url: "" };
      },
    });

    await expect(
      usccb.getMassFromDate(parseIsoDate("2025-08-06"), [
        MassType.DEFAULT,
        MassType.VIGIL,
      ])
    ).rejects.toThrow(USCCBNetworkError);
    expect(calls).toBe(1);
  });

  it("throws USCCBParseError immediately when bot challenge is detected", async () => {
    let calls = 0;
    const challengeHtml =
      "<html><head><title>Just a moment...</title></head><body>Enable JS</body></html>";
    const usccb = new USCCB({
      async get() {
        calls++;
        return {
          text: challengeHtml,
          ok: true,
          status: 200,
          url: "https://bible.usccb.org/bible/readings/080625.cfm",
        };
      },
      async head() {
        return { text: "", ok: true, status: 200, url: "" };
      },
    });

    await expect(
      usccb.getMassFromDate(parseIsoDate("2025-08-06"), [
        MassType.DEFAULT,
        MassType.VIGIL,
      ])
    ).rejects.toThrow(USCCBParseError);
    expect(calls).toBe(1);
  });

  it("returns null only when every checked mass type returns 404", async () => {
    let calls = 0;
    const usccb = new USCCB({
      async get() {
        calls++;
        throw new USCCBNetworkError("Not Found", {
          status: 404,
          retryable: false,
          url: "https://bible.usccb.org/bible/readings/080625.cfm",
        });
      },
      async head() {
        return { text: "", ok: false, status: 404, url: "" };
      },
    });

    const mass = await usccb.getMassFromDate(parseIsoDate("2025-08-06"), [
      MassType.DEFAULT,
      MassType.VIGIL,
    ]);
    expect(mass).toBeNull();
    expect(calls).toBe(2);
  });

  it("continues past persistent 403 on speculative candidate during final recovery pass to succeed on later candidate", async () => {
    const html = readFileSync(
      join(dataDir, "mass-single-reading.html"),
      "utf-8"
    );
    const requestedUrls: string[] = [];
    let resets = 0;
    const client: HttpClient = {
      async get(url: string) {
        requestedUrls.push(url);
        if (url.includes("-Day.cfm")) {
          // Speculative candidate consistently returns retryable 403
          return { text: "", ok: false, status: 403, url };
        }
        if (url.includes("-YearA.cfm")) {
          // Speculative candidate returns 404
          return { text: "", ok: false, status: 404, url };
        }
        // DEFAULT candidate succeeds
        return {
          text: html,
          ok: true,
          status: 200,
          url,
        };
      },
      async head() {
        return { text: "", ok: false, status: 404, url: "" };
      },
      reset() {
        resets++;
      },
    };

    const usccb = new USCCB(client);
    const mass = await usccb.getMassFromDate(parseIsoDate("2025-08-06"), [
      MassType.DAY,
      MassType.YEARA,
      MassType.DEFAULT,
    ]);

    expect(mass).not.toBeNull();
    expect(mass?.type).toBe(MassType.DEFAULT);
    expect(resets).toBe(1);
    // Pass 0: tries DAY -> 403 (retryable), breaks to reset
    // Pass 1: resets client, tries DAY -> 403 (continues), YEARA -> 404 (continues), DEFAULT -> 200
    expect(requestedUrls).toEqual([
      "https://bible.usccb.org/bible/readings/080625-Day.cfm",
      "https://bible.usccb.org/bible/readings/080625-Day.cfm",
      "https://bible.usccb.org/bible/readings/080625-YearA.cfm",
      "https://bible.usccb.org/bible/readings/080625.cfm",
    ]);
  });

  it("throws remembered retryable USCCBNetworkError when all candidates fail and does not return null", async () => {
    const requestedUrls: string[] = [];
    let resets = 0;
    const client: HttpClient = {
      async get(url: string) {
        requestedUrls.push(url);
        if (url.includes("-Day.cfm")) {
          return { text: "", ok: false, status: 403, url };
        }
        return { text: "", ok: false, status: 404, url };
      },
      async head() {
        return { text: "", ok: false, status: 404, url: "" };
      },
      reset() {
        resets++;
      },
    };

    const usccb = new USCCB(client);
    let error: unknown = null;
    try {
      await usccb.getMassFromDate(parseIsoDate("2025-08-06"), [
        MassType.DAY,
        MassType.DEFAULT,
      ]);
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(USCCBNetworkError);
    const netErr = error as USCCBNetworkError;
    expect(netErr.status).toBe(403);
    expect(netErr.retryable).toBe(true);
    expect(resets).toBe(1);
    expect(requestedUrls).toEqual([
      "https://bible.usccb.org/bible/readings/080625-Day.cfm",
      "https://bible.usccb.org/bible/readings/080625-Day.cfm",
      "https://bible.usccb.org/bible/readings/080625.cfm",
    ]);
  });

  it("respects AbortSignal and aborts immediately without attempting recovery passes", async () => {
    const controller = new AbortController();
    let calls = 0;
    const client: HttpClient = {
      async get(url: string) {
        calls++;
        controller.abort();
        return { text: "", ok: false, status: 403, url };
      },
      async head() {
        return { text: "", ok: false, status: 404, url: "" };
      },
    };

    const usccb = new USCCB(client);
    await expect(
      usccb.getMassFromDate(
        parseIsoDate("2025-08-06"),
        [MassType.DAY, MassType.DEFAULT],
        { signal: controller.signal }
      )
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
});

describe("getMassFromUrl", () => {
  it("parses date and type from URL", async () => {
    const usccb = new USCCB(
      createMockClient(join(dataDir, "mass-single-reading.html"))
    );
    const mass = await usccb.getMassFromUrl(
      "https://bible.usccb.org/bible/readings/080625.cfm"
    );
    expect(mass).not.toBeNull();
    expect(mass!.date?.toISOString().slice(0, 10)).toBe("2025-08-06");
    expect(mass!.type).toBe(MassType.DEFAULT);
  });

  it("throws USCCBArgumentError for non-USCCB URLs", async () => {
    const usccb = new USCCB();
    await expect(
      usccb.getMassFromUrl("https://example.com/bible/readings/080625.cfm")
    ).rejects.toThrow(USCCBArgumentError);
  });

  it("throws USCCBArgumentError for credentials in URL", async () => {
    const usccb = new USCCB();
    await expect(
      usccb.getMassFromUrl(
        "https://admin:pass@bible.usccb.org/bible/readings/080625.cfm"
      )
    ).rejects.toThrow(USCCBArgumentError);
  });
});

describe("getMassFromTrustedUrl", () => {
  it("allows non-USCCB URLs when explicitly invoked", async () => {
    const usccb = new USCCB(
      createMockClient(join(dataDir, "mass-single-reading.html"))
    );
    const mass = await usccb.getMassFromTrustedUrl(
      "https://internal-mirror.example.org/readings/080625.cfm"
    );
    expect(mass).not.toBeNull();
    expect(mass!.date?.toISOString().slice(0, 10)).toBe("2025-08-06");
    expect(mass!.type).toBe(MassType.DEFAULT);
  });

  it("throws USCCBArgumentError for credentials in trusted URL", async () => {
    const usccb = new USCCB();
    await expect(
      usccb.getMassFromTrustedUrl(
        "https://admin:pass@internal-mirror.example.org/readings/080625.cfm"
      )
    ).rejects.toThrow(USCCBArgumentError);
  });

  it("throws USCCBArgumentError for invalid URL strings", async () => {
    const usccb = new USCCB();
    await expect(usccb.getMassFromTrustedUrl("not-a-url")).rejects.toThrow(
      USCCBArgumentError
    );
  });

  it("throws USCCBArgumentError for non-http/https protocols", async () => {
    const usccb = new USCCB();
    await expect(
      usccb.getMassFromTrustedUrl("file:///etc/passwd")
    ).rejects.toThrow(USCCBArgumentError);
    await expect(
      usccb.getMassFromTrustedUrl("ftp://example.com/readings/080625.cfm")
    ).rejects.toThrow(USCCBArgumentError);
    await expect(
      usccb.getMassFromTrustedUrl("data:text/html,<h1>Reading</h1>")
    ).rejects.toThrow(USCCBArgumentError);
  });
});

describe("getMassTypes", () => {
  it("returns matching types", async () => {
    const usccb = new USCCB({
      async get() {
        return { text: "", ok: true, status: 200, url: "" };
      },
      async head(url: string) {
        const isDefault = url.endsWith("080625.cfm");
        return { text: "", ok: isDefault, status: isDefault ? 200 : 404, url };
      },
    });
    const types = await usccb.getMassTypes(parseIsoDate("2025-08-06"));
    expect(types).toEqual([MassType.DEFAULT]);
  });

  it("does not reject when one probe fails if others succeed", async () => {
    const usccb = new USCCB({
      async get() {
        return { text: "", ok: true, status: 200, url: "" };
      },
      async head(url: string) {
        if (url.includes("-day.cfm")) {
          throw new Error("Temporary network error on DAY");
        }
        const isDefault = url.endsWith("080625.cfm");
        return { text: "", ok: isDefault, status: isDefault ? 200 : 404, url };
      },
    });
    const types = await usccb.getMassTypes(parseIsoDate("2025-08-06"));
    expect(types).toEqual([MassType.DEFAULT]);
  });

  it("rejects invalid dates on instance methods", async () => {
    const usccb = new USCCB();
    const invalid = new Date(NaN);
    await expect(usccb.getMass(invalid, MassType.DEFAULT)).rejects.toThrow(
      USCCBArgumentError
    );
    await expect(usccb.getMassFromDate(invalid)).rejects.toThrow(
      USCCBArgumentError
    );
    await expect(usccb.getMassTypes(invalid)).rejects.toThrow(
      USCCBArgumentError
    );
  });

  it("returns [] when every probe is 404 (date has no Mass)", async () => {
    const usccb = new USCCB({
      async get() {
        return { text: "", ok: true, status: 200, url: "" };
      },
      async head(url: string) {
        return { text: "", ok: false, status: 404, url };
      },
    });
    const types = await usccb.getMassTypes(parseIsoDate("2025-08-06"));
    expect(types).toEqual([]);
  });

  it("throws USCCBNetworkError when all probes are 403 (block/outage)", async () => {
    const usccb = new USCCB({
      async get() {
        return { text: "", ok: true, status: 200, url: "" };
      },
      async head(url: string) {
        return { text: "", ok: false, status: 403, url };
      },
    });
    await expect(
      usccb.getMassTypes(parseIsoDate("2025-08-06"))
    ).rejects.toThrow(USCCBNetworkError);
  });

  it("throws USCCBNetworkError when all probes are 503 (server outage)", async () => {
    const usccb = new USCCB({
      async get() {
        return { text: "", ok: true, status: 200, url: "" };
      },
      async head(url: string) {
        return { text: "", ok: false, status: 503, url };
      },
    });
    const err = await usccb
      .getMassTypes(parseIsoDate("2025-08-06"))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(USCCBNetworkError);
    expect((err as USCCBNetworkError).retryable).toBe(true);
  });

  it("throws USCCBNetworkError when probes are a mix of 404 and rejections", async () => {
    const usccb = new USCCB({
      async get() {
        return { text: "", ok: true, status: 200, url: "" };
      },
      async head(url: string) {
        if (url.includes("-Day.cfm")) {
          throw new Error("DNS failure");
        }
        return { text: "", ok: false, status: 404, url };
      },
    });
    await expect(
      usccb.getMassTypes(parseIsoDate("2025-08-06"))
    ).rejects.toThrow(USCCBNetworkError);
  });

  it("returns only successful types when some probes fail", async () => {
    const usccb = new USCCB({
      async get() {
        return { text: "", ok: true, status: 200, url: "" };
      },
      async head(url: string) {
        if (url.includes("-Day.cfm")) {
          return { text: "", ok: true, status: 200, url };
        }
        if (url.includes("-Vigil.cfm")) {
          return { text: "", ok: false, status: 503, url };
        }
        return { text: "", ok: false, status: 404, url };
      },
    });
    const types = await usccb.getMassTypes(parseIsoDate("2025-08-06"));
    expect(types).toEqual([MassType.DAY]);
  });
});

describe("parseMassType", () => {
  it("parses case-insensitively", () => {
    expect(parseMassType("vigil")).toBe(MassType.VIGIL);
    expect(parseMassType("YearA")).toBe(MassType.YEARA);
  });
});

describe("USCCBNetworkError", () => {
  it("has no cause when constructed with only a message", () => {
    const err = new USCCBNetworkError("Request failed");
    expect(err.cause).toBeUndefined();
    expect(err.options).toEqual({});
    expect(err.message).toBe("Request failed");
  });

  it("preserves cause when passed as a plain error object", () => {
    const cause = new Error("underlying error");
    const err = new USCCBNetworkError("Wrapped", cause);
    expect(err.cause).toBe(cause);
    expect(err.options.cause).toBe(cause);
  });

  it("reads structured options fields correctly", () => {
    const err = new USCCBNetworkError("Network error", {
      status: 503,
      retryable: true,
      url: "https://example.com",
    });
    expect(err.status).toBe(503);
    expect(err.retryable).toBe(true);
    expect(err.url).toBe("https://example.com");
    expect(err.cause).toBeUndefined();
  });
});

describe("parseMass contract validation", () => {
  const usccb = new USCCB({
    async get() {
      return { text: "", ok: true, status: 200, url: "" };
    },
    async head(url: string) {
      return { text: "", ok: true, status: 200, url };
    },
  });

  it("throws USCCBParseError when page did not contain a title", () => {
    const html = `
      <html>
        <body>
          <div class="container">
            <div class="name">First Reading</div>
            <div class="address"><a href="bible/gen/1/1">Gen 1:1</a></div>
            <div class="content-body">In the beginning...</div>
          </div>
        </body>
      </html>
    `;
    expect(() =>
      usccb.parseMass(html, "https://bible.usccb.org/test", null, null)
    ).toThrow(USCCBParseError);
    expect(() =>
      usccb.parseMass(html, "https://bible.usccb.org/test", null, null)
    ).toThrow("USCCB page did not contain a title");
  });

  it("throws USCCBParseError when page contained no recognizable reading sections", () => {
    const html = `
      <html>
        <head><title>Daily Readings | USCCB</title></head>
        <body>
          <div>No reading container here</div>
        </body>
      </html>
    `;
    expect(() =>
      usccb.parseMass(html, "https://bible.usccb.org/test", null, null)
    ).toThrow(USCCBParseError);
    expect(() =>
      usccb.parseMass(html, "https://bible.usccb.org/test", null, null)
    ).toThrow("USCCB page contained no recognizable reading sections");
  });

  it("throws USCCBParseError when reading sections contain no text or citations", () => {
    const html = `
      <html>
        <head><title>Daily Readings | USCCB</title></head>
        <body>
          <div class="container">
            <div class="name">First Reading</div>
            <div class="address">   </div>
            <div class="content-body">   </div>
          </div>
        </body>
      </html>
    `;
    expect(() =>
      usccb.parseMass(html, "https://bible.usccb.org/test", null, null)
    ).toThrow(USCCBParseError);
    expect(() =>
      usccb.parseMass(html, "https://bible.usccb.org/test", null, null)
    ).toThrow("USCCB page contained no recognizable reading sections");
  });

  it("throws USCCBParseError when section has no reading content", () => {
    const html = `
      <html>
        <head><title>Daily Readings | USCCB</title></head>
        <body>
          <div class="container">
            <div class="name">First Reading</div>
            <div class="address"><a href="">   </a></div>
            <div class="content-body">   </div>
          </div>
        </body>
      </html>
    `;
    expect(() =>
      usccb.parseMass(html, "https://bible.usccb.org/test", null, null)
    ).toThrow("USCCB page contained no reading text or citations");
  });

  it("throws USCCBParseError when given empty HTML string", () => {
    expect(() =>
      usccb.parseMass("", "https://bible.usccb.org/test", null, null)
    ).toThrow(USCCBParseError);
    expect(() =>
      usccb.parseMass("", "https://bible.usccb.org/test", null, null)
    ).toThrow("USCCB page did not contain a title");
  });

  it("throws USCCBParseError when given malformed HTML without valid sections", () => {
    const malformed =
      "<html><head><title>Test | USCCB</title></head><body><div><p>Broken structure";
    expect(() =>
      usccb.parseMass(malformed, "https://bible.usccb.org/test", null, null)
    ).toThrow(USCCBParseError);
    expect(() =>
      usccb.parseMass(malformed, "https://bible.usccb.org/test", null, null)
    ).toThrow("USCCB page contained no recognizable reading sections");
  });

  it("throws USCCBParseError when given soft-block or Obolus challenge HTML", () => {
    const challengeHtml = readFileSync(
      join(dataDir, "obolus-challenge.html"),
      "utf-8"
    );
    expect(() =>
      usccb.parseMass(challengeHtml, "https://bible.usccb.org/test", null, null)
    ).toThrow(USCCBParseError);
    expect(() =>
      usccb.parseMass(challengeHtml, "https://bible.usccb.org/test", null, null)
    ).toThrow(
      "USCCB returned a block or challenge page instead of readings content"
    );

    const accessDenied =
      "<html><body><h1>Access Denied</h1><p>You do not have permission to access USCCB.</p></body></html>";
    expect(() =>
      usccb.parseMass(accessDenied, "https://bible.usccb.org/test", null, null)
    ).toThrow(USCCBParseError);
    expect(() =>
      usccb.parseMass(accessDenied, "https://bible.usccb.org/test", null, null)
    ).toThrow(
      "USCCB returned a block or challenge page instead of readings content"
    );
  });
});
