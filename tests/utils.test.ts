import { describe, expect, it } from "vitest";

import { USCCBArgumentError } from "../src/errors.js";
import {
  addDays,
  assertUsccbReadingsUrl,
  assertValidDate,
  formatUrlDate,
  getBookFromVerse,
  getReadingNumber,
  lookupBook,
  parseIsoDate,
  parseUrl,
  stripBookAbbreviationsFromText,
} from "../src/utils.js";

describe("lookupBook", () => {
  it("finds books by abbreviation", () => {
    expect(lookupBook("Gn")?.name).toBe("Genesis");
    expect(lookupBook("1 Chr")?.name).toBe("1 Chronicles");
  });

  it("returns null for ambiguous abbreviations", () => {
    expect(lookupBook("Jd")).toBeNull();
  });
});

describe("stripBookAbbreviationsFromText", () => {
  it("removes book abbreviations", () => {
    expect(stripBookAbbreviationsFromText("Is 7:10-14")).toBe("7:10-14");
    expect(stripBookAbbreviationsFromText("Lk 1:26-38")).toBe("1:26-38");
  });
});

describe("getReadingNumber", () => {
  it("parses roman and arabic numerals", () => {
    expect(getReadingNumber("Reading I")).toBe(1);
    expect(getReadingNumber("Reading II")).toBe(2);
    expect(getReadingNumber("Reading 3")).toBe(3);
    expect(getReadingNumber("XIV")).toBe(14);
  });
});

describe("parseUrl", () => {
  it("parses USCCB reading URLs", () => {
    expect(
      parseUrl("https://bible.usccb.org/bible/readings/122525.cfm")
    ).toEqual([new Date(2025, 11, 25), ""]);
    expect(
      parseUrl("https://bible.usccb.org/bible/readings/040625-YearA.cfm")
    ).toEqual([new Date(2025, 3, 6), "YearA"]);
    expect(
      parseUrl("https://bible.usccb.org/bible/readings/122525-Dawn.cfm")
    ).toEqual([new Date(2025, 11, 25), "Dawn"]);
    expect(
      parseUrl(
        "https://bible.usccb.org/bible/readings/122525.cfm?foo=bar#section"
      )
    ).toEqual([new Date(2025, 11, 25), ""]);
  });

  it("returns null for invalid URLs or impossible calendar dates", () => {
    expect(parseUrl("https://example.com/unknown")).toBeNull();
    expect(
      parseUrl("https://bible.usccb.org/bible/readings/043125.cfm")
    ).toBeNull();
    expect(
      parseUrl("https://bible.usccb.org/bible/readings/022925.cfm")
    ).toBeNull();
  });
});

describe("getBookFromVerse", () => {
  it("resolves books from links and text", () => {
    expect(
      getBookFromVerse("https://bible.usccb.org/bible/luke/1?57", "Lk 1:26-38")
        ?.name
    ).toBe("Luke");
  });
});

describe("assertValidDate", () => {
  it("accepts valid finite dates", () => {
    expect(() => assertValidDate(new Date(2025, 0, 1), "date")).not.toThrow();
  });

  it("throws USCCBArgumentError for invalid finite date or non-date", () => {
    expect(() => assertValidDate(new Date(NaN), "date")).toThrow(
      USCCBArgumentError
    );
    expect(() =>
      assertValidDate("2025-01-01" as unknown as Date, "date")
    ).toThrow(USCCBArgumentError);
  });
});

describe("parseIsoDate", () => {
  it("parses valid YYYY-MM-DD date strings", () => {
    expect(parseIsoDate("2025-01-15")).toEqual(new Date(2025, 0, 15));
  });

  it("throws USCCBArgumentError on rollover dates like 2025-02-31", () => {
    expect(() => parseIsoDate("2025-02-31")).toThrow(USCCBArgumentError);
    expect(() => parseIsoDate("2026-99-99")).toThrow(USCCBArgumentError);
  });

  it("throws USCCBArgumentError on malformed format strings", () => {
    expect(() => parseIsoDate("2025-1-1")).toThrow(USCCBArgumentError);
    expect(() => parseIsoDate("invalid")).toThrow(USCCBArgumentError);
  });
});

describe("formatUrlDate", () => {
  it("formats date into MMDDYY", () => {
    expect(formatUrlDate(new Date(2025, 11, 25))).toBe("122525");
  });

  it("throws USCCBArgumentError when given invalid date", () => {
    expect(() => formatUrlDate(new Date(NaN))).toThrow(USCCBArgumentError);
  });
});

describe("addDays", () => {
  it("adds calendar days to valid date", () => {
    expect(addDays(new Date(2025, 0, 1), 10)).toEqual(new Date(2025, 0, 11));
  });

  it("throws USCCBArgumentError when given invalid date", () => {
    expect(() => addDays(new Date(NaN), 10)).toThrow(USCCBArgumentError);
  });
});

describe("assertUsccbReadingsUrl", () => {
  it("returns URL object for valid USCCB readings URL", () => {
    const url = assertUsccbReadingsUrl(
      "https://bible.usccb.org/bible/readings/080625.cfm"
    );
    expect(url.origin).toBe("https://bible.usccb.org");
    expect(url.pathname).toBe("/bible/readings/080625.cfm");
  });

  it("throws USCCBArgumentError for non-USCCB origin", () => {
    expect(() =>
      assertUsccbReadingsUrl("https://example.com/bible/readings/080625.cfm")
    ).toThrow(USCCBArgumentError);
  });

  it("throws USCCBArgumentError for path not starting with /bible/readings/", () => {
    expect(() =>
      assertUsccbReadingsUrl("https://bible.usccb.org/other/path/080625.cfm")
    ).toThrow(USCCBArgumentError);
  });

  it("throws USCCBArgumentError for URL with username or password", () => {
    expect(() =>
      assertUsccbReadingsUrl(
        "https://admin:secret@bible.usccb.org/bible/readings/080625.cfm"
      )
    ).toThrow(USCCBArgumentError);
  });

  it("throws USCCBArgumentError for invalid URL string", () => {
    expect(() => assertUsccbReadingsUrl("not-a-url")).toThrow(
      USCCBArgumentError
    );
  });
});
