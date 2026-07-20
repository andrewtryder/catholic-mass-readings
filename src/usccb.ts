import * as cheerio from "cheerio";
import type { Element } from "domhandler";

import { OR_PATTERN } from "./constants.js";
import type { HttpClient, HttpRequestOptions, HttpResponse } from "./http.js";
import { createFetchClient } from "./http.js";
import {
  USCCBArgumentError,
  USCCBError,
  USCCBNetworkError,
  USCCBParseError,
} from "./errors.js";

const MAX_RETRIES = 2;
import { resetObolusState } from "./http-obolus.js";
import { isObolusChallenge } from "./obolus.js";
import {
  MassType,
  SectionType,
  type Mass,
  type Reading,
  type Section,
  type Verse,
  massTypeToUrl,
  parseMassType,
  readingWithText,
  sectionAddAlternative,
  sectionTypeFromHeader,
} from "./models.js";
import {
  addDays,
  assertUsccbReadingsUrl,
  assertValidDate,
  getBookFromVerse,
  parseUrl,
  todayInNewYork,
} from "./utils.js";

/** Default mass types tried in order when resolving a date without an explicit type. */
export const DEFAULT_MASS_TYPES: MassType[] = [
  MassType.DAY,
  MassType.YEARA,
  MassType.YEARB,
  MassType.YEARC,
  MassType.DEFAULT,
];

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
export class USCCB {
  private readonly client: HttpClient;

  /** @param client - HTTP client for fetching pages (defaults to `fetch`). */
  constructor(client: HttpClient = createFetchClient()) {
    this.client = client;
  }

  /** Today's date in America/New_York (USCCB liturgical calendar). */
  static today(): Date {
    return todayInNewYork();
  }

  /** Latest date for which USCCB publishes readings (roughly end of next liturgical year). */
  static maxQueryDate(): Date {
    const today = USCCB.today();
    const dt = addDays(
      new Date(today.getFullYear() + 1, today.getMonth(), 1),
      31
    );
    return new Date(dt.getFullYear(), dt.getMonth(), 1);
  }

  /** Generate Sunday dates between `start` and `end` (inclusive start, exclusive end). */
  static getSundayMassDates(start: Date, end?: Date): Date[] {
    assertValidDate(start, "start");
    if (end !== undefined) {
      assertValidDate(end, "end");
      if (start >= end) {
        throw new USCCBArgumentError(
          `Invalid range (${formatIsoDate(start)} >= ${formatIsoDate(end)})`
        );
      }
    }

    const firstSunday = addDays(start, (7 - start.getDay()) % 7);

    if (end !== undefined && firstSunday >= end) {
      return [];
    }

    return USCCB.getMassDates(firstSunday, end, 7);
  }

  /** Generate dates stepping by `stepDays` from `start` until `end` (capped at {@link maxQueryDate}). */
  static getMassDates(start: Date, end?: Date, stepDays = 7): Date[] {
    assertValidDate(start, "start");
    if (end !== undefined) {
      assertValidDate(end, "end");
    }
    if (!Number.isInteger(stepDays) || stepDays <= 0) {
      throw new USCCBArgumentError(
        `stepDays must be a positive integer; received ${stepDays}`
      );
    }

    const maxDate = USCCB.maxQueryDate();
    const effectiveEnd =
      end === undefined
        ? maxDate
        : new Date(Math.min(end.getTime(), maxDate.getTime()));

    if (start >= effectiveEnd) {
      throw new USCCBArgumentError(
        `Invalid range (${formatIsoDate(start)} >= ${formatIsoDate(effectiveEnd)})`
      );
    }

    const dates: Date[] = [];
    let current = new Date(start);
    while (current < effectiveEnd) {
      dates.push(new Date(current));
      current = addDays(current, stepDays);
    }
    return dates;
  }

  /** Fetch today's mass, optionally for a specific {@link MassType}. */
  async getTodayMass(
    typeOrOptions?: MassType | (HttpRequestOptions & { type?: MassType }),
    options?: HttpRequestOptions
  ): Promise<Mass | null> {
    const today = USCCB.today();
    let type: MassType | undefined;
    let opts: HttpRequestOptions | undefined = options;
    if (typeof typeOrOptions === "string") {
      type = typeOrOptions as MassType;
    } else if (typeOrOptions && typeof typeOrOptions === "object") {
      type = typeOrOptions.type;
      opts = { ...typeOrOptions, ...options };
    }
    if (type !== undefined) {
      return this.getMass(today, type, opts);
    }
    return this.getMassFromDate(today, undefined, opts);
  }

  /** Fetch mass for a date and explicit mass type. */
  async getMass(
    date: Date,
    type: MassType,
    options?: HttpRequestOptions
  ): Promise<Mass | null> {
    assertValidDate(date, "date");
    const url = massTypeToUrl(type, date);
    return this.fetchMass(url, date, type, options);
  }

  /**
   * Fetch mass for a date, trying each type in `types` until one succeeds.
   * @param types - Mass types to try in order (defaults to {@link DEFAULT_MASS_TYPES}).
   */
  async getMassFromDate(
    date: Date,
    typesOrOptions:
      | MassType[]
      | (HttpRequestOptions & { types?: MassType[] }) = DEFAULT_MASS_TYPES,
    options?: HttpRequestOptions
  ): Promise<Mass | null> {
    assertValidDate(date, "date");
    let types: MassType[] = DEFAULT_MASS_TYPES;
    let opts: HttpRequestOptions | undefined = options;
    if (Array.isArray(typesOrOptions)) {
      types = typesOrOptions;
    } else if (typesOrOptions && typeof typesOrOptions === "object") {
      if (typesOrOptions.types) types = typesOrOptions.types;
      opts = { ...typesOrOptions, ...options };
    }
    for (let recovery = 0; recovery < MAX_RETRIES; recovery++) {
      if (recovery > 0) {
        if (typeof this.client.reset === "function") {
          this.client.reset();
        } else {
          resetObolusState();
        }
      }

      for (const type of types) {
        if (opts?.signal?.aborted) {
          opts.signal.throwIfAborted();
        }
        const url = massTypeToUrl(type, date);
        try {
          return await this.fetchMass(url, date, type, opts);
        } catch (err) {
          if (opts?.signal?.aborted) {
            throw err;
          }
          continue;
        }
      }
    }
    return null;
  }

  /** Fetch and parse mass from a USCCB readings URL (`https://bible.usccb.org/bible/readings/`). */
  async getMassFromUrl(
    url: string,
    options?: HttpRequestOptions
  ): Promise<Mass | null> {
    assertUsccbReadingsUrl(url);
    return this.getMassFromTrustedUrl(url, options);
  }

  /**
   * Fetch and parse mass from any trusted URL without USCCB origin and path enforcement.
   * Requires explicit opt-in when fetching from sources outside `https://bible.usccb.org`.
   */
  async getMassFromTrustedUrl(
    url: string,
    options?: HttpRequestOptions
  ): Promise<Mass | null> {
    let validUrl: URL;
    try {
      validUrl = new URL(url);
    } catch {
      throw new USCCBArgumentError("URL must be valid");
    }
    if (validUrl.username || validUrl.password) {
      throw new USCCBArgumentError("URL must not contain credentials");
    }
    let date: Date | null = null;
    let type: MassType | string | null = null;
    const parsed = parseUrl(url);
    if (parsed) {
      [date, type] = parsed;
      try {
        type = parseMassType(type);
      } catch {
        type = parsed[1];
      }
    }
    return this.fetchMass(url, date, type, options);
  }

  /** List mass types available for a date (via HEAD requests). */
  async getMassTypes(
    date: Date,
    options?: HttpRequestOptions
  ): Promise<MassType[]> {
    assertValidDate(date, "date");
    const checks = await Promise.allSettled(
      Object.values(MassType).map(async (type) => ({
        type,
        response: await this.client.head(massTypeToUrl(type, date), options),
      }))
    );

    if (
      checks.length > 0 &&
      checks.every((item) => item.status === "rejected")
    ) {
      const firstError = (checks[0] as PromiseRejectedResult).reason;
      if (firstError instanceof USCCBError) {
        throw firstError;
      }
      const message =
        firstError instanceof Error ? firstError.message : String(firstError);
      throw new USCCBNetworkError(
        `Failed to probe mass types: ${message}`,
        firstError
      );
    }

    return checks
      .filter(
        (
          item
        ): item is PromiseFulfilledResult<{
          type: MassType;
          response: HttpResponse;
        }> => item.status === "fulfilled" && item.value.response.ok
      )
      .map((item) => item.value.type)
      .sort((a, b) => a.localeCompare(b));
  }

  private async fetchMass(
    url: string,
    date: Date | null,
    type: MassType | string | null,
    options?: HttpRequestOptions
  ): Promise<Mass | null> {
    let response: HttpResponse;
    try {
      response = await this.client.get(url, options);
    } catch (error) {
      if (error instanceof USCCBError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new USCCBNetworkError(
        `Failed to fetch mass from ${url}: ${message}`,
        error
      );
    }
    if (!response.ok) {
      throw new USCCBNetworkError(
        `Failed to fetch mass from ${url}: ${response.status}`
      );
    }
    return this.parseMass(response.text, url, date, type);
  }

  /**
   * Parse USCCB HTML into a {@link Mass} object.
   * Useful for testing with fixture HTML without network requests.
   */
  parseMass(
    html: string,
    url: string,
    date: Date | null,
    type: MassType | string | null
  ): Mass {
    if (isObolusChallenge(html) || html.includes("Access Denied")) {
      throw new USCCBParseError(
        "USCCB returned a block or challenge page instead of readings content"
      );
    }

    const $ = cheerio.load(html);
    const title = $("title").text().trim().split("|")[0].trim();
    if (!title) {
      throw new USCCBParseError("USCCB page did not contain a title");
    }

    const sections = this.getSections($);
    if (sections.length === 0) {
      throw new USCCBParseError(
        "USCCB page contained no recognizable reading sections"
      );
    }

    const hasReadingContent = sections.some((section) =>
      section.readings.some(
        (reading) =>
          reading.text.trim().length > 0 ||
          reading.verses.some(
            (v) => v.text.trim().length > 0 || v.link.trim().length > 0
          )
      )
    );
    if (!hasReadingContent) {
      throw new USCCBParseError(
        "USCCB page contained no reading text or citations"
      );
    }

    return { date, type, url, title, sections };
  }

  private getSections($: cheerio.CheerioAPI): Section[] {
    const sections: Section[] = [];
    let prevExpectsChildren = false;

    for (const container of $(".container").toArray()) {
      const name = $(container).find(".name").first();
      const address = $(container).find(".address").first();
      if (!name.length || !address.length) continue;

      const verses = this.getVerses($, address);
      if (verses.length === 0) continue;

      const header = name.text().trim();
      const sectionType = sectionTypeFromHeader(header);

      let section: Section | null = null;
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
                readingWithText(
                  reading,
                  reading.text.slice(0, orMatch.index).trim()
                ),
              ],
            };
          } else {
            expectsChildren = false;
            section = { type: sectionType, header, readings: [reading] };
          }
        } else {
          section = sectionAddAlternative(section, reading);
        }
      }

      if (!section) continue;

      if (
        sections.length > 0 &&
        ((sectionType === SectionType.UNKNOWN && prevExpectsChildren) ||
          sectionType === SectionType.ALTERNATIVE)
      ) {
        sections[sections.length - 1] = sectionAddAlternative(
          sections[sections.length - 1],
          section.readings
        );
        prevExpectsChildren = false;
        continue;
      }

      prevExpectsChildren = expectsChildren;
      sections.push(section);
    }

    return sections;
  }

  private getVerses(
    $: cheerio.CheerioAPI,
    parent: cheerio.Cheerio<Element>
  ): Verse[] {
    return parent
      .find("a[href]")
      .toArray()
      .map((anchor) => this.createVerse($, anchor));
  }

  private createVerse($: cheerio.CheerioAPI, anchor: Element): Verse {
    const text = cleanText($(anchor).text().trim());
    const link = ($(anchor).attr("href") ?? "").trim();
    const bookDict = getBookFromVerse(link, text);
    return { text, link, book: bookDict?.name ?? null };
  }

  private *getReadings(
    $: cheerio.CheerioAPI,
    container: Element,
    verses: Verse[]
  ): Generator<Reading> {
    const contentBody = $(container).find(".content-body").first();
    let empty = true;

    for (const [currentVerses, lines] of this.getRawReadings(
      $,
      contentBody,
      verses
    )) {
      const text = cleanText(lines.join("\n")).trim();
      if (text) {
        yield { verses: currentVerses, text };
        empty = false;
      }
    }

    if (empty) {
      yield {
        verses,
        text: cleanText(getElementText($, contentBody.get(0)!)).trim(),
      };
    }
  }

  private *getRawReadings(
    $: cheerio.CheerioAPI,
    contentBody: cheerio.Cheerio<Element>,
    initialVerses: Verse[]
  ): Generator<[Verse[], string[]]> {
    let lines: string[] = [];
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

function getElementText($: cheerio.CheerioAPI, element: Element): string {
  const clone = $(element).clone();
  clone.find("br").replaceWith("\n");
  return clone.text();
}

/** Normalize whitespace and HTML entities in reading text extracted from USCCB pages. */
export function cleanText(input: string): string {
  let text = input
    .replace(/\u00a0/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  text = text
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
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

function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
