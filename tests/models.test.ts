import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  Mass,
  MassType,
  Reading,
  Section,
  SectionType,
  SerializedMass,
  formatReading,
  formatReadingCitations,
  massToDict,
  massToString,
  readingHeader,
  readingToDict,
  sectionToDict,
  sectionTypeFromHeader,
  verseToDict,
  Verse,
} from "../src/models.js";
import { USCCB } from "../src/usccb.js";
import { parseIsoDate } from "../src/utils.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const dataDir = join(testDir, "data");

describe("citations output format", () => {
  it("omits reading text from JSON", () => {
    const html = readFileSync(
      join(dataDir, "mass-single-reading.html"),
      "utf-8"
    );
    const usccb = new USCCB();
    const mass = usccb.parseMass(
      html,
      "https://bible.usccb.org/bible/readings/080625.cfm",
      parseIsoDate("2025-08-06"),
      MassType.DEFAULT
    );
    const dict = massToDict(mass, "citations");

    for (const section of dict.sections) {
      for (const reading of section.readings) {
        expect(reading.text).toBeUndefined();
        expect(reading.verses).toBeDefined();
      }
    }
  });

  it("prints section headers with verse citations only", () => {
    const html = readFileSync(
      join(dataDir, "mass-single-reading.html"),
      "utf-8"
    );
    const usccb = new USCCB();
    const mass = usccb.parseMass(
      html,
      "https://bible.usccb.org/bible/readings/080625.cfm",
      parseIsoDate("2025-08-06"),
      MassType.DEFAULT
    );
    const output = massToString(mass, "citations");

    expect(output).toContain("First Reading: Daniel 7:9-10, 13-14");
    expect(output).toContain("Responsorial Psalm: Psalms 97:1-2, 5-6, 9");
    expect(output).not.toContain("As I watched:");
    expect(output).not.toContain("The word of the Lord.");
  });

  it("includes alternative reading citations", () => {
    const html = readFileSync(
      join(dataDir, "mass-multiple-readings.html"),
      "utf-8"
    );
    const usccb = new USCCB();
    const mass = usccb.parseMass(
      html,
      "https://bible.usccb.org/bible/readings/081025.cfm",
      parseIsoDate("2025-08-10"),
      MassType.DEFAULT
    );
    const gospelSection = mass.sections.find((s) => s.type === "GOSPEL");
    expect(gospelSection?.readings).toHaveLength(2);
    expect(
      formatReadingCitations(gospelSection!.readings[1], gospelSection!)
    ).toContain("Luke 12:35-40");
  });

  it("readingHeader falls back to raw citations when book is missing and never returns [object Object] or null", () => {
    const reading = {
      verses: [{ text: "Some Book 1:1-2", link: "", book: null }],
      text: "Reading text",
    };
    const header = readingHeader(reading);
    expect(header).toBe("Some Book 1:1-2");
    expect(header).not.toContain("[object Object]");
    expect(header).not.toContain("null");

    const emptyReading = { verses: [], text: "No citation text" };
    const emptyHeader = readingHeader(emptyReading);
    expect(emptyHeader).toBe("(citation unavailable)");
    expect(emptyHeader).not.toContain("[object Object]");
    expect(emptyHeader).not.toContain("null");
  });

  it("formatReading omits null title and never prints [object Object] or literal null when readingTitle returns null", () => {
    const reading = {
      verses: [{ text: "Unknown Book 1:1", link: "", book: null }],
      text: "Reading text",
    };
    const section = {
      type: SectionType.READING,
      header: "Reading 1",
      readings: [reading],
    };
    const formatted = formatReading(reading, section);
    expect(formatted).not.toContain("null");
    expect(formatted).not.toContain("[object Object]");
    expect(formatted).toContain("First Reading: Unknown Book 1:1");
    expect(formatted).toContain("Reading text");
  });
});

describe("verseToDict", () => {
  it("converts a standard verse with a book to a dictionary", () => {
    const verse: Verse = {
      text: "John 3:16",
      link: "https://bible.usccb.org/bible/john/3?16",
      book: "John",
    };
    const dict = verseToDict(verse);
    expect(dict).toEqual({
      text: "John 3:16",
      link: "https://bible.usccb.org/bible/john/3?16",
      book: "John",
    });
  });

  it("handles a verse where book is null", () => {
    const verse: Verse = {
      text: "Some verse text",
      link: "https://example.com",
      book: null,
    };
    const dict = verseToDict(verse);
    expect(dict).toEqual({
      text: "Some verse text",
      link: "https://example.com",
      book: null,
    });
  });

  it("handles empty strings for text and link", () => {
    const verse: Verse = {
      text: "",
      link: "",
      book: "Genesis",
    };
    const dict = verseToDict(verse);
    expect(dict).toEqual({
      text: "",
      link: "",
      book: "Genesis",
    });
  });
});

describe("dictionary serialization and DTOs", () => {
  const sampleVerse: Verse = {
    text: "John 1:1",
    link: "https://example.com/john/1?1",
    book: "John",
  };
  const sampleReading: Reading = {
    verses: [sampleVerse],
    text: "In the beginning was the Word.",
  };
  const sampleSection: Section = {
    type: SectionType.GOSPEL,
    header: "Gospel",
    readings: [sampleReading],
  };

  it("readingToDict returns SerializedReading respecting format option", () => {
    const full = readingToDict(sampleReading, "full");
    expect(full).toEqual({
      verses: [verseToDict(sampleVerse)],
      text: "In the beginning was the Word.",
    });

    const citations = readingToDict(sampleReading, "citations");
    expect(citations).toEqual({
      verses: [verseToDict(sampleVerse)],
    });
    expect(citations.text).toBeUndefined();
  });

  it("sectionToDict returns SerializedSection with nested readings", () => {
    const dict = sectionToDict(sampleSection, "citations");
    expect(dict).toEqual({
      type: SectionType.GOSPEL,
      header: "Gospel",
      readings: [{ verses: [verseToDict(sampleVerse)] }],
    });
  });

  it("massToDict serializes type_ consistently even when MassType is DEFAULT ('')", () => {
    const defaultMass: Mass = {
      date: new Date(2025, 7, 6), // Aug 6 2025
      type: MassType.DEFAULT,
      url: "https://example.com/mass",
      title: "Transfiguration",
      sections: [sampleSection],
    };
    const serialized: SerializedMass = massToDict(defaultMass);
    expect(serialized.type_).toBe("");
    expect(serialized.date).toBe("2025-08-06");
  });

  it("massToDict serializes type_ when MassType is DAY", () => {
    const dayMass: Mass = {
      date: new Date(2025, 11, 25),
      type: MassType.DAY,
      url: "https://example.com/day",
      title: "Christmas Day",
      sections: [],
    };
    const serialized = massToDict(dayMass);
    expect(serialized.type_).toBe("DAY");
  });

  it("massToDict omits type_ only when mass.type is null or undefined", () => {
    const nullTypeMass: Mass = {
      date: null,
      type: null,
      url: "https://example.com/null",
      title: "No Date Or Type",
      sections: [],
    };
    const serialized = massToDict(nullTypeMass);
    expect("type_" in serialized).toBe(false);
    expect("date" in serialized).toBe(false);
  });
});

describe("sectionTypeFromHeader", () => {
  it("classifies Gospel acclamations and Verse Before the Gospel as ALLELUIA, never GOSPEL", () => {
    expect(sectionTypeFromHeader("Verse Before the Gospel")).toBe(
      SectionType.ALLELUIA
    );
    expect(sectionTypeFromHeader("Gospel Acclamation")).toBe(
      SectionType.ALLELUIA
    );
    expect(sectionTypeFromHeader("Alleluia")).toBe(SectionType.ALLELUIA);
    expect(
      sectionTypeFromHeader("Praise to you, Lord Jesus Christ, King of glory!")
    ).toBe(SectionType.ALLELUIA);
    expect(
      sectionTypeFromHeader("Glory and praise to you, Lord Jesus Christ!")
    ).toBe(SectionType.ALLELUIA);
    expect(
      sectionTypeFromHeader("Glory to you, Word of God, Lord Jesus Christ!")
    ).toBe(SectionType.ALLELUIA);
  });

  it("classifies Gospel, Reading, Psalm, Sequence, and Alternative headers accurately", () => {
    expect(sectionTypeFromHeader("Gospel")).toBe(SectionType.GOSPEL);
    expect(sectionTypeFromHeader("Gospel (Long Form)")).toBe(
      SectionType.GOSPEL
    );
    expect(sectionTypeFromHeader("Responsorial Psalm")).toBe(SectionType.PSALM);
    expect(sectionTypeFromHeader("Reading 1")).toBe(SectionType.READING);
    expect(sectionTypeFromHeader("Reading II")).toBe(SectionType.READING);
    expect(sectionTypeFromHeader("Sequence")).toBe(SectionType.SEQUENCE);
    expect(sectionTypeFromHeader("OR")).toBe(SectionType.ALTERNATIVE);
    expect(sectionTypeFromHeader("Or:")).toBe(SectionType.ALTERNATIVE);
    expect(sectionTypeFromHeader("Alternative")).toBe(SectionType.ALTERNATIVE);
    expect(sectionTypeFromHeader("Memorial")).toBe(SectionType.UNKNOWN);
  });

  it("never appends Gospel conclusions to Verse Before the Gospel when formatted", () => {
    const verseSection: Section = {
      type: sectionTypeFromHeader("Verse Before the Gospel"),
      header: "Verse Before the Gospel",
      readings: [
        {
          verses: [
            {
              text: "Joel 2:12-13",
              link: "https://bible.usccb.org/bible/joel/2?12",
              book: "Joel",
            },
          ],
          text: "Return to the Lord, your God.",
        },
      ],
    };
    const formatted = formatReading(verseSection.readings[0], verseSection);
    expect(formatted).toContain("Verse Before the Gospel: Joel 2:12-13");
    expect(formatted).not.toContain("The Gospel of the Lord.");
    expect(formatted).not.toContain("Praise to you, Lord Jesus Christ.");
    expect(formatted).not.toContain("A reading from");
  });
});
