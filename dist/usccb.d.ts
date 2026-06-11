import type { HttpClient } from "./http.js";
import { MassType, type Mass } from "./models.js";
/** Default mass types tried in order when resolving a date without an explicit type. */
export declare const DEFAULT_MASS_TYPES: MassType[];
/**
 * Client for fetching and parsing USCCB daily mass readings.
 *
 * @example
 * ```ts
 * import { USCCB, MassType } from "catholic-mass-readings";
 *
 * const usccb = new USCCB();
 * const mass = await usccb.getMass(new Date(2024, 11, 25), MassType.VIGIL);
 * ```
 */
export declare class USCCB {
    private readonly client;
    /** @param client - HTTP client for fetching pages (defaults to `fetch`). */
    constructor(client?: HttpClient);
    /** Today's date in America/New_York (USCCB liturgical calendar). */
    static today(): Date;
    /** Latest date for which USCCB publishes readings (roughly end of next liturgical year). */
    static maxQueryDate(): Date;
    /** Generate Sunday dates between `start` and `end` (inclusive start, exclusive end). */
    static getSundayMassDates(start: Date, end?: Date): Date[];
    /** Generate dates stepping by `stepDays` from `start` until `end` (capped at {@link maxQueryDate}). */
    static getMassDates(start: Date, end?: Date, stepDays?: number): Date[];
    /** Fetch today's mass, optionally for a specific {@link MassType}. */
    getTodayMass(type?: MassType): Promise<Mass | null>;
    /** Fetch mass for a date and explicit mass type. */
    getMass(date: Date, type: MassType): Promise<Mass | null>;
    /**
     * Fetch mass for a date, trying each type in `types` until one succeeds.
     * @param types - Mass types to try in order (defaults to {@link DEFAULT_MASS_TYPES}).
     */
    getMassFromDate(date: Date, types?: MassType[]): Promise<Mass | null>;
    /** Fetch and parse mass from a USCCB readings URL. */
    getMassFromUrl(url: string): Promise<Mass | null>;
    /** List mass types available for a date (via HEAD requests). */
    getMassTypes(date: Date): Promise<MassType[]>;
    private fetchMass;
    /**
     * Parse USCCB HTML into a {@link Mass} object.
     * Useful for testing with fixture HTML without network requests.
     */
    parseMass(html: string, url: string, date: Date | null, type: MassType | string | null): Mass;
    private getSections;
    private getVerses;
    private createVerse;
    private getReadings;
    private getRawReadings;
}
/** Normalize whitespace and HTML entities in reading text extracted from USCCB pages. */
export declare function cleanText(input: string): string;
//# sourceMappingURL=usccb.d.ts.map