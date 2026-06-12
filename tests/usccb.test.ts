import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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

  it("getSundayMassDates adjusts end when before first Sunday", () => {
    const dates = USCCB.getSundayMassDates(
      parseIsoDate("2025-01-06"),
      parseIsoDate("2025-01-07")
    );
    expect(dates).toHaveLength(1);
    expect(dates[0].toISOString().slice(0, 10)).toBe("2025-01-12");
  });
});

describe("cleanText", () => {
  it("decodes html entities", () => {
    expect(cleanText("Hello &amp; World")).toBe("Hello & World");
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
});

describe("parseMassType", () => {
  it("parses case-insensitively", () => {
    expect(parseMassType("vigil")).toBe(MassType.VIGIL);
    expect(parseMassType("YearA")).toBe(MassType.YEARA);
  });
});
