/** Liturgical mass variant for a given date (maps to USCCB URL suffixes). */
export declare enum MassType {
    DEFAULT = "",
    DAWN = "DAWN",
    DAY = "DAY",
    NIGHT = "NIGHT",
    VIGIL = "VIGIL",
    YEARA = "YEARA",
    YEARB = "YEARB",
    YEARC = "YEARC"
}
/** Parse a mass type string (case-insensitive). Throws on invalid input. */
export declare function parseMassType(value: string): MassType;
/** Build the USCCB readings URL for a mass type and date. */
export declare function massTypeToUrl(type: MassType, date: Date): string;
/** Category of a liturgical section within a mass (reading, gospel, psalm, etc.). */
export declare enum SectionType {
    UNKNOWN = "UNKNOWN",
    ALLELUIA = "ALLELUIA",
    ALTERNATIVE = "ALTERNATIVE",
    GOSPEL = "GOSPEL",
    PSALM = "PSALM",
    READING = "READING",
    SEQUENCE = "SEQUENCE"
}
/** Infer section type from the USCCB section header text. */
export declare function sectionTypeFromHeader(header: string): SectionType;
/** A Bible verse citation (reference text and link) within a reading. */
export interface Verse {
    text: string;
    link: string;
    book: string | null;
}
export declare function verseBookTitle(verse: Verse): string | null;
export declare function verseToDict(verse: Verse): Record<string, unknown>;
/** A single reading block with verse citations and full text. */
export interface Reading {
    verses: Verse[];
    text: string;
}
export declare function readingHeader(reading: Reading): string;
export declare function readingTitle(reading: Reading): string | null;
/** Output format: full reading text or verse citations only. */
export type OutputFormat = "full" | "citations";
export declare function formatReading(reading: Reading, parent: Section): string;
export declare function formatReadingCitations(reading: Reading, parent: Section): string;
export declare function readingWithText(reading: Reading, text: string): Reading;
export declare function readingToDict(reading: Reading, format?: OutputFormat): Record<string, unknown>;
/** A liturgical section containing one or more readings (e.g. First Reading, Gospel). */
export interface Section {
    type: SectionType;
    header: string;
    readings: Reading[];
}
export declare function sectionDisplayHeader(section: Section): string;
export declare function sectionFooter(section: Section): string;
export declare function sectionAddAlternative(section: Section, reading: Reading | Reading[]): Section;
export declare function sectionToString(section: Section, format?: OutputFormat): string;
export declare function sectionToDict(section: Section, format?: OutputFormat): Record<string, unknown>;
/** Parsed daily mass readings for a date and liturgical type. */
export interface Mass {
    date: Date | null;
    type: MassType | string | null;
    url: string;
    title: string;
    sections: Section[];
}
export declare function massDateStr(mass: Mass): string;
/** Format a mass as human-readable text for CLI or logging. */
export declare function massToString(mass: Mass, format?: OutputFormat): string;
/** Serialize a mass to a JSON-friendly object. */
export declare function massToDict(mass: Mass, format?: OutputFormat): Record<string, unknown>;
//# sourceMappingURL=models.d.ts.map