import type { HttpClient } from "./http.js";
import { MassType, type Mass } from "./models.js";
export declare const DEFAULT_MASS_TYPES: MassType[];
export declare class USCCB {
    private readonly client;
    constructor(client?: HttpClient);
    static today(): Date;
    static maxQueryDate(): Date;
    static getSundayMassDates(start: Date, end?: Date): Date[];
    static getMassDates(start: Date, end?: Date, stepDays?: number): Date[];
    getTodayMass(type?: MassType): Promise<Mass | null>;
    getMass(date: Date, type: MassType): Promise<Mass | null>;
    getMassFromDate(date: Date, types?: MassType[]): Promise<Mass | null>;
    getMassFromUrl(url: string): Promise<Mass | null>;
    getMassTypes(date: Date): Promise<MassType[]>;
    private fetchMass;
    parseMass(html: string, url: string, date: Date | null, type: MassType | string | null): Mass;
    private getSections;
    private getVerses;
    private createVerse;
    private getReadings;
    private getRawReadings;
}
export declare function cleanText(input: string): string;
//# sourceMappingURL=usccb.d.ts.map