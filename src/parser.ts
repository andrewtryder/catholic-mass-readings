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
    section.readings.some((reading) => reading.text.trim().length > 0)
  );
  if (!hasReadingContent) {
    throw new USCCBParseError(
      "USCCB page contained no reading text or citations"
    );
  }

  return { date, type, url, title, sections };
}

type ReadingUnit = {
  header: string;
  address: cheerio.Cheerio<Element>;
  contentBody: cheerio.Cheerio<Element>;
};

function getSections($: cheerio.CheerioAPI): Section[] {
  const sections: Section[] = [];
  let prevExpectsChildren = false;

  for (const unit of collectReadingUnits($)) {
    const header = unit.header;

    let verses = unit.address.length ? getVerses($, unit.address) : [];
    if (verses.length === 0 && unit.address.length) {
      const addrText = cleanText(unit.address.text()).trim();
      if (addrText) {
        const bookDict = getBookFromVerse("", addrText);
        verses = [{ text: addrText, link: "", book: bookDict?.name ?? null }];
      }
    }

    const hasCitations = verses.some(
      (v) => v.text.trim().length > 0 || v.link.trim().length > 0
    );
    const hasBodyText =
      unit.contentBody.length > 0 &&
      cleanText(unit.contentBody.text()).trim().length > 0;
    if (verses.length === 0 && !hasBodyText) {
      continue;
    }
    if (hasCitations && !hasBodyText) {
      throw new USCCBParseError(
        `USCCB reading section "${header}" is missing reading text`
      );
    }

    const sectionType = sectionTypeFromHeader(header);

    let section: Section | null = null;
    let expectsChildren = false;
    for (const reading of getReadings($, unit.contentBody, verses)) {
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

const USCCB_BIBLE_CITATION_PATTERN = /bible\.usccb\.org\/bible\//i;

function collectReadingUnits($: cheerio.CheerioAPI): ReadingUnit[] {
  const contentHeaders = collectContentHeaders($);
  if (contentHeaders.length > 0) {
    return contentHeaders
      .map((headerEl) => readingUnitFromContentHeader($, $(headerEl)))
      .filter((unit): unit is ReadingUnit => unit !== null);
  }

  const units: ReadingUnit[] = [];
  for (const container of $(".container").toArray()) {
    const unit = readingUnitFromContainer($, $(container));
    if (unit) units.push(unit);
  }
  return units;
}

function collectContentHeaders($: cheerio.CheerioAPI): Element[] {
  const lectionaryHeaders = $(".wr-block.b-verse .content-header").toArray();
  if (lectionaryHeaders.length > 0) {
    return lectionaryHeaders;
  }

  return $(".content-header")
    .toArray()
    .filter((headerEl) => isReadingContentHeader($, $(headerEl)));
}

function isReadingContentHeader(
  $: cheerio.CheerioAPI,
  headerBlock: cheerio.Cheerio<Element>
): boolean {
  const name = headerBlock.find(".name").first();
  if (!name.length || !cleanText(name.text()).trim()) {
    return false;
  }

  const address = headerBlock.find(".address").first();
  if (!address.length) {
    return false;
  }

  const hasUsccbCitationLink = address
    .find("a[href]")
    .toArray()
    .some((anchor) =>
      USCCB_BIBLE_CITATION_PATTERN.test(($(anchor).attr("href") ?? "").trim())
    );
  if (hasUsccbCitationLink) {
    return true;
  }

  const addrText = cleanText(address.text()).trim();
  if (!addrText) {
    return false;
  }

  return getBookFromVerse("", addrText) !== null;
}

function readingUnitFromContentHeader(
  $: cheerio.CheerioAPI,
  headerBlock: cheerio.Cheerio<Element>
): ReadingUnit | null {
  const name = headerBlock.find(".name").first();
  if (!name.length) return null;

  const header = cleanText(name.text()).trim();
  if (!header) return null;

  const address = headerBlock.find(".address").first();
  const contentBody = resolveContentBody($, headerBlock);
  return { header, address, contentBody };
}

function readingUnitFromContainer(
  $: cheerio.CheerioAPI,
  container: cheerio.Cheerio<Element>
): ReadingUnit | null {
  const name = container.find(".name").first();
  if (!name.length) return null;

  const header = cleanText(name.text()).trim();
  if (!header) return null;

  const address = container.find(".address").first();
  const contentBody = container.find(".content-body").first();
  return { header, address, contentBody };
}

/**
 * USCCB serves reading text inside `.content-body` (older pages) or as sibling
 * paragraphs immediately following `.content-header` (newer flat layout).
 */
function resolveContentBody(
  $: cheerio.CheerioAPI,
  headerBlock: cheerio.Cheerio<Element>
): cheerio.Cheerio<Element> {
  const boundedBody = headerBlock
    .nextUntil(".content-header")
    .filter(".content-body")
    .first();
  if (boundedBody.length > 0) {
    return boundedBody;
  }

  const inlineParagraphs: Element[] = [];
  for (const sibling of headerBlock.nextUntil(".content-header").toArray()) {
    const el = $(sibling);
    if (el.is(".content-body")) {
      return el;
    }
    if (el.is("p")) {
      inlineParagraphs.push(sibling);
      continue;
    }
    for (const paragraph of el.find("p").toArray()) {
      inlineParagraphs.push(paragraph);
    }
  }

  return $(inlineParagraphs);
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

  for (const paragraph of contentParagraphs($, contentBody)) {
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

function contentParagraphs(
  $: cheerio.CheerioAPI,
  contentBody: cheerio.Cheerio<Element>
): Element[] {
  const nested = contentBody.find("p").toArray();
  if (nested.length > 0) {
    return nested;
  }
  return contentBody.filter("p").toArray();
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
