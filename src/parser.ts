import * as cheerio from "cheerio";
import type { Element } from "domhandler";

import { OR_PATTERN } from "./constants.js";
import { USCCBParseError } from "./errors.js";
import {
  type Mass,
  type MassType,
  type Reading,
  type Section,
  SectionType,
  type Verse,
  readingWithText,
  sectionAddAlternative,
  sectionTypeFromHeader,
} from "./models.js";
import { isObolusChallenge } from "./obolus.js";
import { getBookFromVerse } from "./utils.js";

/**
 * Parse USCCB HTML into a {@link Mass} domain object.
 *
 * @throws {@link USCCBParseError} When the HTML is a challenge/block page, lacks a title,
 * contains no recognizable reading sections, or has no reading content.
 */
export function parseMassHtml(
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

  const sections = getSections($);
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

function getSections($: cheerio.CheerioAPI): Section[] {
  const sections: Section[] = [];
  let prevExpectsChildren = false;

  for (const container of $(".container").toArray()) {
    const name = $(container).find(".name").first();
    if (!name.length) continue;

    const header = cleanText(name.text()).trim();
    if (!header) continue;

    const address = $(container).find(".address").first();
    const contentBody = $(container).find(".content-body").first();

    let verses = address.length ? getVerses($, address) : [];
    if (verses.length === 0 && address.length) {
      const addrText = cleanText(address.text()).trim();
      if (addrText) {
        const bookDict = getBookFromVerse("", addrText);
        verses = [{ text: addrText, link: "", book: bookDict?.name ?? null }];
      }
    }

    const hasBodyText =
      contentBody.length > 0 && cleanText(contentBody.text()).trim().length > 0;
    if (verses.length === 0 && !hasBodyText) {
      continue;
    }

    const sectionType = sectionTypeFromHeader(header);

    let section: Section | null = null;
    let expectsChildren = false;
    for (const reading of getReadings($, contentBody, verses)) {
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

function getVerses(
  $: cheerio.CheerioAPI,
  parent: cheerio.Cheerio<Element>
): Verse[] {
  return parent
    .find("a[href]")
    .toArray()
    .map((anchor) => createVerse($, anchor));
}

function createVerse($: cheerio.CheerioAPI, anchor: Element): Verse {
  const text = cleanText($(anchor).text().trim());
  const link = ($(anchor).attr("href") ?? "").trim();
  const bookDict = getBookFromVerse(link, text);
  return { text, link, book: bookDict?.name ?? null };
}

function* getReadings(
  $: cheerio.CheerioAPI,
  contentBody: cheerio.Cheerio<Element>,
  verses: Verse[]
): Generator<Reading> {
  if (contentBody.length === 0) {
    if (verses.length > 0) {
      yield { verses, text: "" };
    }
    return;
  }

  let empty = true;

  for (const [currentVerses, lines] of getRawReadings($, contentBody, verses)) {
    const text = cleanText(lines.join("\n")).trim();
    if (text) {
      yield { verses: currentVerses, text };
      empty = false;
    }
  }

  if (empty) {
    const bodyEl = contentBody.get(0);
    const fallbackText = bodyEl
      ? cleanText(getElementText($, bodyEl)).trim()
      : "";
    yield {
      verses,
      text: fallbackText,
    };
  }
}

function* getRawReadings(
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

    const currVerses = getVerses($, $(paragraph));
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

function getElementText($: cheerio.CheerioAPI, element: Element): string {
  const clone = $(element).clone();
  clone.find("br").replaceWith("\n");
  return clone.text();
}

/** Normalize whitespace and HTML entities in reading text extracted from USCCB pages. */
export function cleanText(input: string): string {
  let text = input
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&amp;/g, "&");

  text = text
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
  text = text.replace(/\.([A-Z])/g, ". $1");
  text = text.replace(/,([A-Z])/g, ", $1");
  text = text.replace(/;([A-Z])/g, "; $1");
  text = text.replace(/\n[^\S\n]*\n/g, "\n\n");
  text = text.replace(/([.!?])[^\S\n]*\n([A-Z])/g, "$1\n\n$2");

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.join("\n\n").trim();
}
