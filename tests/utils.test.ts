import { describe, expect, it } from "vitest";

import {
  getBookFromVerse,
  getReadingNumber,
  lookupBook,
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
  });

  it("returns null for invalid URLs", () => {
    expect(parseUrl("https://example.com/unknown")).toBeNull();
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
