import * as cheerio from "cheerio";
import { OR_PATTERN, SUNDAY_DAY_OF_WEEK } from "./constants.js";
import { createFetchClient } from "./http.js";
import { MassType, SectionType, massTypeToUrl, parseMassType, readingWithText, sectionAddAlternative, sectionTypeFromHeader, } from "./models.js";
import { addDays, getBookFromVerse, parseUrl, todayInNewYork, } from "./utils.js";
export const DEFAULT_MASS_TYPES = [
    MassType.DAY,
    MassType.YEARA,
    MassType.YEARB,
    MassType.YEARC,
    MassType.DEFAULT,
];
export class USCCB {
    client;
    constructor(client = createFetchClient()) {
        this.client = client;
    }
    static today() {
        return todayInNewYork();
    }
    static maxQueryDate() {
        const today = USCCB.today();
        const dt = addDays(new Date(today.getFullYear() + 1, today.getMonth(), 1), 31);
        return new Date(dt.getFullYear(), dt.getMonth(), 1);
    }
    static getSundayMassDates(start, end) {
        if (end !== undefined && start >= end) {
            throw new Error(`Invalid range (${formatIsoDate(start)} >= ${formatIsoDate(end)})`);
        }
        let adjustedStart = start;
        let adjustedEnd = end;
        if (start.getDay() !== SUNDAY_DAY_OF_WEEK) {
            const daysUntilSunday = (7 - start.getDay()) % 7;
            const newStart = addDays(start, daysUntilSunday);
            if (adjustedEnd !== undefined && adjustedEnd < newStart) {
                adjustedEnd = addDays(adjustedEnd, daysUntilSunday);
            }
            adjustedStart = newStart;
        }
        return USCCB.getMassDates(adjustedStart, adjustedEnd, 7);
    }
    static getMassDates(start, end, stepDays = 7) {
        const maxDate = USCCB.maxQueryDate();
        const effectiveEnd = end === undefined
            ? maxDate
            : new Date(Math.min(end.getTime(), maxDate.getTime()));
        if (start >= effectiveEnd) {
            throw new Error(`Invalid range (${formatIsoDate(start)} >= ${formatIsoDate(effectiveEnd)})`);
        }
        const dates = [];
        let current = new Date(start);
        while (current < effectiveEnd) {
            dates.push(new Date(current));
            current = addDays(current, stepDays);
        }
        return dates;
    }
    async getTodayMass(type) {
        const today = USCCB.today();
        if (type !== undefined) {
            return this.getMass(today, type);
        }
        return this.getMassFromDate(today);
    }
    async getMass(date, type) {
        const url = massTypeToUrl(type, date);
        return this.fetchMass(url, date, type);
    }
    async getMassFromDate(date, types = DEFAULT_MASS_TYPES) {
        for (const type of types) {
            const url = massTypeToUrl(type, date);
            try {
                return await this.fetchMass(url, date, type);
            }
            catch {
                continue;
            }
        }
        return null;
    }
    async getMassFromUrl(url) {
        let date = null;
        let type = null;
        const parsed = parseUrl(url);
        if (parsed) {
            [date, type] = parsed;
            try {
                type = parseMassType(type);
            }
            catch {
                type = parsed[1];
            }
        }
        return this.fetchMass(url, date, type);
    }
    async getMassTypes(date) {
        const urlsToType = new Map(Object.values(MassType).map((type) => [massTypeToUrl(type, date), type]));
        const responses = await Promise.all([...urlsToType.keys()].map((url) => this.client.head(url)));
        const found = responses
            .filter((response) => response.ok)
            .map((response) => urlsToType.get(response.url))
            .filter((type) => type !== undefined);
        return found.sort((a, b) => a.localeCompare(b));
    }
    async fetchMass(url, date, type) {
        const response = await this.client.get(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch mass from ${url}: ${response.status}`);
        }
        return this.parseMass(response.text, url, date, type);
    }
    parseMass(html, url, date, type) {
        const $ = cheerio.load(html);
        const title = $("title").text().trim().split("|")[0].trim();
        const sections = this.getSections($);
        return { date, type, url, title, sections };
    }
    getSections($) {
        const sections = [];
        let prevExpectsChildren = false;
        for (const container of $(".container").toArray()) {
            const name = $(container).find(".name").first();
            const address = $(container).find(".address").first();
            if (!name.length || !address.length)
                continue;
            const verses = this.getVerses($, address);
            if (verses.length === 0)
                continue;
            const header = name.text().trim();
            const sectionType = sectionTypeFromHeader(header);
            let section = null;
            let expectsChildren = false;
            for (const reading of this.getReadings($, container, verses)) {
                if (section === null) {
                    const orMatch = OR_PATTERN.exec(reading.text);
                    if (orMatch) {
                        expectsChildren = true;
                        section = {
                            type: sectionType,
                            header,
                            readings: [
                                readingWithText(reading, reading.text.slice(0, orMatch.index).trim()),
                            ],
                        };
                    }
                    else {
                        expectsChildren = false;
                        section = { type: sectionType, header, readings: [reading] };
                    }
                }
                else {
                    section = sectionAddAlternative(section, reading);
                }
            }
            if (!section)
                continue;
            if (sections.length > 0 &&
                ((sectionType === SectionType.UNKNOWN && prevExpectsChildren) ||
                    sectionType === SectionType.ALTERNATIVE)) {
                sections[sections.length - 1] = sectionAddAlternative(sections[sections.length - 1], section.readings);
                prevExpectsChildren = false;
                continue;
            }
            prevExpectsChildren = expectsChildren;
            sections.push(section);
        }
        return sections;
    }
    getVerses($, parent) {
        return parent
            .find("a[href]")
            .toArray()
            .map((anchor) => this.createVerse($, anchor));
    }
    createVerse($, anchor) {
        const text = cleanText($(anchor).text().trim());
        const link = ($(anchor).attr("href") ?? "").trim();
        const bookDict = getBookFromVerse(link, text);
        return { text, link, book: bookDict?.name ?? null };
    }
    *getReadings($, container, verses) {
        const contentBody = $(container).find(".content-body").first();
        let empty = true;
        for (const [currentVerses, lines] of this.getRawReadings($, contentBody, verses)) {
            const text = cleanText(lines.join("")).trim();
            if (text) {
                yield { verses: currentVerses, text };
                empty = false;
            }
        }
        if (empty) {
            yield {
                verses,
                text: cleanText(getElementText($, contentBody.get(0))).trim(),
            };
        }
    }
    *getRawReadings($, contentBody, initialVerses) {
        let lines = [];
        let verses = [...initialVerses];
        for (const paragraph of contentBody.find("p").toArray()) {
            const txt = getElementText($, paragraph).trim();
            if (OR_PATTERN.test(txt.trim())) {
                yield [verses, lines];
                lines = [];
                verses = [];
                continue;
            }
            const currVerses = this.getVerses($, $(paragraph));
            if (currVerses.length > 0) {
                yield [verses, lines];
                lines = [];
                verses = currVerses;
                continue;
            }
            lines.push(txt);
        }
        yield [verses, lines];
    }
}
function getElementText($, element) {
    const clone = $(element).clone();
    clone.find("br").replaceWith("\n");
    return clone.text();
}
export function cleanText(input) {
    let text = input
        .replace(/\u00a0/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    text = text.replace(/\s+/g, " ");
    text = text.replace(/\.([A-Z])/g, ". $1");
    text = text.replace(/,([A-Z])/g, ", $1");
    text = text.replace(/;([A-Z])/g, "; $1");
    text = text.replace(/\n\s*\n/g, "\n\n");
    text = text.replace(/([.!?])\s*\n([A-Z])/g, "$1\n\n$2");
    const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    return lines.join("\n\n").trim();
}
function formatIsoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
//# sourceMappingURL=usccb.js.map