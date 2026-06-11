import {
  GOSPEL_CLOSE_REMARKS,
  GOSPEL_CLOSE_RESPONSE,
  READING_CLOSE_REMARKS,
  READING_CLOSE_RESPONSE,
  READING_TITLE_FMT,
  SECTION_HEADER_READINGS,
  DAILY_READING_DEFAULT_MSS_URL_FMT,
  DAILY_READING_DAWN_MASS_URL_FMT,
  DAILY_READING_DAY_MASS_URL_FMT,
  DAILY_READING_NIGHT_MASS_URL_FMT,
  DAILY_READING_VIGIL_MASS_URL_FMT,
  DAILY_READING_YEAR_A_MASS_URL_FMT,
  DAILY_READING_YEAR_B_MASS_URL_FMT,
  DAILY_READING_YEAR_C_MASS_URL_FMT,
} from "./constants.js";
import {
  formatUrlDate,
  getReadingNumber,
  lookupBook,
  stripBookAbbreviationsFromText,
} from "./utils.js";

/** Liturgical mass variant for a given date (maps to USCCB URL suffixes). */
export enum MassType {
  DEFAULT = "",
  DAWN = "DAWN",
  DAY = "DAY",
  NIGHT = "NIGHT",
  VIGIL = "VIGIL",
  YEARA = "YEARA",
  YEARB = "YEARB",
  YEARC = "YEARC",
}

const MASS_TYPE_NAMES = Object.keys(MassType) as (keyof typeof MassType)[];

/** Parse a mass type string (case-insensitive). Throws on invalid input. */
export function parseMassType(value: string): MassType {
  if (value === "") {
    return MassType.DEFAULT;
  }
  for (const name of MASS_TYPE_NAMES) {
    if (name.toLowerCase() === value.toLowerCase()) {
      return MassType[name];
    }
  }
  for (const name of MASS_TYPE_NAMES) {
    if (MassType[name].toLowerCase() === value.toLowerCase()) {
      return MassType[name];
    }
  }
  throw new Error(`Invalid MassType: ${value}`);
}

/** Build the USCCB readings URL for a mass type and date. */
export function massTypeToUrl(type: MassType, date: Date): string {
  const dateStr = formatUrlDate(date);
  switch (type) {
    case MassType.DEFAULT:
      return DAILY_READING_DEFAULT_MSS_URL_FMT.replace("{DATE}", dateStr);
    case MassType.DAY:
      return DAILY_READING_DAY_MASS_URL_FMT.replace("{DATE}", dateStr);
    case MassType.DAWN:
      return DAILY_READING_DAWN_MASS_URL_FMT.replace("{DATE}", dateStr);
    case MassType.NIGHT:
      return DAILY_READING_NIGHT_MASS_URL_FMT.replace("{DATE}", dateStr);
    case MassType.VIGIL:
      return DAILY_READING_VIGIL_MASS_URL_FMT.replace("{DATE}", dateStr);
    case MassType.YEARA:
      return DAILY_READING_YEAR_A_MASS_URL_FMT.replace("{DATE}", dateStr);
    case MassType.YEARB:
      return DAILY_READING_YEAR_B_MASS_URL_FMT.replace("{DATE}", dateStr);
    case MassType.YEARC:
      return DAILY_READING_YEAR_C_MASS_URL_FMT.replace("{DATE}", dateStr);
    default:
      throw new Error(`Unsupported MassType: ${type}`);
  }
}

/** Category of a liturgical section within a mass (reading, gospel, psalm, etc.). */
export enum SectionType {
  UNKNOWN = "UNKNOWN",
  ALLELUIA = "ALLELUIA",
  ALTERNATIVE = "ALTERNATIVE",
  GOSPEL = "GOSPEL",
  PSALM = "PSALM",
  READING = "READING",
  SEQUENCE = "SEQUENCE",
}

/** Infer section type from the USCCB section header text. */
export function sectionTypeFromHeader(header: string): SectionType {
  const lower = header.toLowerCase();
  if (lower.includes("alleluia")) return SectionType.ALLELUIA;
  if (lower.includes("gospel")) return SectionType.GOSPEL;
  if (lower.includes("psalm")) return SectionType.PSALM;
  if (lower.includes("sequence")) return SectionType.SEQUENCE;
  if (lower.includes("reading")) return SectionType.READING;
  if (lower.includes("or")) return SectionType.ALTERNATIVE;
  return SectionType.UNKNOWN;
}

/** A Bible verse citation (reference text and link) within a reading. */
export interface Verse {
  text: string;
  link: string;
  book: string | null;
}

export function verseBookTitle(verse: Verse): string | null {
  if (!verse.book) return null;
  const details = lookupBook(verse.book);
  return details?.title ?? null;
}

export function verseToDict(verse: Verse): Record<string, unknown> {
  return { text: verse.text, link: verse.link, book: verse.book };
}

/** A single reading block with verse citations and full text. */
export interface Reading {
  verses: Verse[];
  text: string;
}

export function readingHeader(reading: Reading): string {
  const book = reading.verses.find((v) => v.book)?.book ?? null;
  if (!book) {
    return String(reading);
  }
  return (
    book +
    " " +
    reading.verses.map((v) => stripBookAbbreviationsFromText(v.text)).join(", ")
  );
}

export function readingTitle(reading: Reading): string | null {
  const bookTitle = reading.verses.map(verseBookTitle).find((t) => t) ?? null;
  if (!bookTitle) return null;
  return READING_TITLE_FMT.replace("{TITLE}", bookTitle);
}

/** Output format: full reading text or verse citations only. */
export type OutputFormat = "full" | "citations";

export function formatReading(reading: Reading, parent: Section): string {
  if (
    parent.type === SectionType.READING ||
    parent.type === SectionType.GOSPEL
  ) {
    return `${sectionDisplayHeader(parent)}: ${readingHeader(reading)}\n${readingTitle(reading)}\n\n${reading.text}\n${sectionFooter(parent)}`;
  }
  return `${sectionDisplayHeader(parent)}: ${readingHeader(reading)}\n\n${reading.text}`;
}

export function formatReadingCitations(
  reading: Reading,
  parent: Section
): string {
  return `${sectionDisplayHeader(parent)}: ${readingHeader(reading)}`;
}

export function readingWithText(reading: Reading, text: string): Reading {
  return { verses: reading.verses, text };
}

export function readingToDict(
  reading: Reading,
  format: OutputFormat = "full"
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    verses: reading.verses.map(verseToDict),
  };
  if (format === "full") {
    result.text = reading.text;
  }
  return result;
}

/** A liturgical section containing one or more readings (e.g. First Reading, Gospel). */
export interface Section {
  type: SectionType;
  header: string;
  readings: Reading[];
}

export function sectionDisplayHeader(section: Section): string {
  if (section.type === SectionType.READING) {
    const readingNumber = getReadingNumber(section.header);
    if (readingNumber) {
      return SECTION_HEADER_READINGS[readingNumber] ?? section.header;
    }
  }
  return section.header;
}

export function sectionFooter(section: Section): string {
  if (section.type === SectionType.READING) {
    return `\n${READING_CLOSE_REMARKS}\n${READING_CLOSE_RESPONSE}`;
  }
  if (section.type === SectionType.GOSPEL) {
    return `\n${GOSPEL_CLOSE_REMARKS}\n${GOSPEL_CLOSE_RESPONSE}`;
  }
  return "";
}

function adaptReading(section: Section, reading: Reading): Reading {
  return reading.verses.length > 0
    ? reading
    : {
        verses: section.readings[section.readings.length - 1].verses,
        text: reading.text,
      };
}

export function sectionAddAlternative(
  section: Section,
  reading: Reading | Reading[]
): Section {
  const additions = Array.isArray(reading) ? reading : [reading];
  return {
    ...section,
    readings: [
      ...section.readings,
      ...additions.map((r) => adaptReading(section, r)),
    ],
  };
}

export function sectionToString(
  section: Section,
  format: OutputFormat = "full"
): string {
  const formatter =
    format === "citations" ? formatReadingCitations : formatReading;
  return section.readings.map((r) => formatter(r, section)).join("\n\n");
}

export function sectionToDict(
  section: Section,
  format: OutputFormat = "full"
): Record<string, unknown> {
  return {
    type: section.type,
    header: section.header,
    readings: section.readings.map((r) => readingToDict(r, format)),
  };
}

/** Parsed daily mass readings for a date and liturgical type. */
export interface Mass {
  date: Date | null;
  type: MassType | string | null;
  url: string;
  title: string;
  sections: Section[];
}

export function massDateStr(mass: Mass): string {
  if (!mass.date) return "";
  return mass.date.toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });
}

/** Format a mass as human-readable text for CLI or logging. */
export function massToString(
  mass: Mass,
  format: OutputFormat = "full"
): string {
  const lines: string[] = [mass.title, massDateStr(mass), mass.url];
  for (const section of mass.sections) {
    lines.push("\n" + sectionToString(section, format));
  }
  return lines.join("\n");
}

/** Serialize a mass to a JSON-friendly object. */
export function massToDict(
  mass: Mass,
  format: OutputFormat = "full"
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    url: mass.url,
    title: mass.title,
    sections: mass.sections.map((s) => sectionToDict(s, format)),
  };
  if (mass.date) {
    result.date = formatIsoDate(mass.date);
  }
  if (mass.type) {
    result.type_ = mass.type;
  }
  return result;
}

function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
