import { type BibleBook } from "./constants.js";
/** Format a date as `MMDDYY` for USCCB URL paths. */
export declare function formatUrlDate(date: Date): string;
/** Parse an ISO date string (`YYYY-MM-DD`) into a local `Date`. */
export declare function parseIsoDate(value: string): Date;
/** Today's date in America/New_York timezone. */
export declare function todayInNewYork(): Date;
/** Add calendar days to a date. */
export declare function addDays(date: Date, days: number): Date;
export declare function getBookFromVerse(link: string, text: string): BibleBook | null;
export declare function getReadingNumber(text: string): number | null;
export declare function stripBookAbbreviationsFromText(text: string): string;
export declare function lookupBook(key: string | null | undefined): BibleBook | null;
/** Parse a USCCB readings URL into `[date, massTypeSuffix]`, or `null` if invalid. */
export declare function parseUrl(url: string): [Date, string] | null;
//# sourceMappingURL=utils.d.ts.map