import { type BibleBook } from "./constants.js";
export declare function formatUrlDate(date: Date): string;
export declare function parseIsoDate(value: string): Date;
export declare function todayInNewYork(): Date;
export declare function addDays(date: Date, days: number): Date;
export declare function getBookFromVerse(link: string, text: string): BibleBook | null;
export declare function getReadingNumber(text: string): number | null;
export declare function stripBookAbbreviationsFromText(text: string): string;
export declare function lookupBook(key: string | null | undefined): BibleBook | null;
export declare function parseUrl(url: string): [Date, string] | null;
//# sourceMappingURL=utils.d.ts.map