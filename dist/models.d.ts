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
export declare function parseMassType(value: string): MassType;
export declare function massTypeToUrl(type: MassType, date: Date): string;
export declare enum SectionType {
    UNKNOWN = "UNKNOWN",
    ALLELUIA = "ALLELUIA",
    ALTERNATIVE = "ALTERNATIVE",
    GOSPEL = "GOSPEL",
    PSALM = "PSALM",
    READING = "READING",
    SEQUENCE = "SEQUENCE"
}
export declare function sectionTypeFromHeader(header: string): SectionType;
export interface Verse {
    text: string;
    link: string;
    book: string | null;
}
export declare function verseBookTitle(verse: Verse): string | null;
export declare function verseToDict(verse: Verse): Record<string, unknown>;
export interface Reading {
    verses: Verse[];
    text: string;
}
export declare function readingHeader(reading: Reading): string;
export declare function readingTitle(reading: Reading): string | null;
export type OutputFormat = "full" | "citations";
export declare function formatReading(reading: Reading, parent: Section): string;
export declare function formatReadingCitations(reading: Reading, parent: Section): string;
export declare function readingWithText(reading: Reading, text: string): Reading;
export declare function readingToDict(reading: Reading, format?: OutputFormat): Record<string, unknown>;
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
export interface Mass {
    date: Date | null;
    type: MassType | string | null;
    url: string;
    title: string;
    sections: Section[];
}
export declare function massDateStr(mass: Mass): string;
export declare function massToString(mass: Mass, format?: OutputFormat): string;
export declare function massToDict(mass: Mass, format?: OutputFormat): Record<string, unknown>;
//# sourceMappingURL=models.d.ts.map