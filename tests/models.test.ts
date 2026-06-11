import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  MassType,
  formatReadingCitations,
  massToDict,
  massToString,
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

    for (const section of dict.sections as Array<{
      readings: Array<Record<string, unknown>>;
    }>) {
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
});
