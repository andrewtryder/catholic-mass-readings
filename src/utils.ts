import {
  DATE_FMT,
  NEW_TESTAMENT_BOOKS,
  OLD_TESTAMENT_BOOKS,
  USCCB_ORIGIN,
  type BibleBook,
} from "./constants.js";
import { USCCBArgumentError } from "./errors.js";

const ABBREVIATED_BOOK_PATTERN = /([0-9]?\s?[A-Z][a-z]*):?/g;
const BOOK_LINK_PATTERN = /bible\/([^/]+)/;
const ROMAN_NUMERAL_PATTERN = /\s?([IVXLCDM]+)$/i;
const NUMERAL_PATTERN = /\s?([0-9]+)$/i;
const URL_PATTERN = /readings\/(?<DATE>\d{6})-?(?<TYPE>[A-Z]*)\.cfm$/i;

const ROMAN_VALUES: Record<string, number> = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000,
};

const oldTestamentLookup: Map<string, BibleBook> =
  buildTestamentBookLookup(OLD_TESTAMENT_BOOKS);
const newTestamentLookup: Map<string, BibleBook> =
  buildTestamentBookLookup(NEW_TESTAMENT_BOOKS);

/** Validate that a value is a valid, finite Date instance. */
export function assertValidDate(date: Date, name: string): void {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new USCCBArgumentError(`${name} must be a valid date`);
  }
}

/** Validate that a string is a trusted USCCB readings URL (`https://bible.usccb.org/bible/readings/`). */
export function assertUsccbReadingsUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new USCCBArgumentError("URL must be a USCCB readings URL");
  }

  if (
    url.origin !== USCCB_ORIGIN ||
    !url.pathname.startsWith("/bible/readings/") ||
    url.username ||
    url.password
  ) {
    throw new USCCBArgumentError("URL must be a USCCB readings URL");
  }

  return url;
}

/** Format a date as `MMDDYY` for USCCB URL paths. */
export function formatUrlDate(date: Date): string {
  assertValidDate(date, "date");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yy = String(date.getFullYear() % 100).padStart(2, "0");
  return `${mm}${dd}${yy}`;
}

/** Parse an ISO date string (`YYYY-MM-DD`) into a local `Date`. */
export function parseIsoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new USCCBArgumentError(
      `Invalid date format: ${value}. Expected YYYY-MM-DD`
    );
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new USCCBArgumentError(
      `Invalid date format: ${value}. Expected valid calendar date in YYYY-MM-DD`
    );
  }
  return date;
}

/** Today's date in America/New_York timezone. */
export function todayInNewYork(): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value) - 1;
  const day = Number(parts.find((p) => p.type === "day")!.value);
  return new Date(year, month, day);
}

/** Add calendar days to a date. */
export function addDays(date: Date, days: number): Date {
  assertValidDate(date, "date");
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function getBookFromVerse(link: string, text: string): BibleBook | null {
  const book = lookupBook(getBookNameFromLink(link));
  if (book) return book;
  for (const abbrev of getBookAbbreviationsFromText(text)) {
    const found = lookupBook(abbrev);
    if (found) return found;
  }
  return null;
}

export function getReadingNumber(text: string): number | null {
  const roman = romanToInt(text);
  if (roman !== null) return roman;
  const match = NUMERAL_PATTERN.exec(text);
  return match ? parseInt(match[1], 10) : null;
}

function romanToInt(text: string): number | null {
  const match = ROMAN_NUMERAL_PATTERN.exec(text);
  if (!match) return null;
  const roman = match[1].toUpperCase();
  let total = 0;
  let prevValue = 0;
  for (const char of [...roman].reverse()) {
    const value = ROMAN_VALUES[char];
    if (value < prevValue) {
      total -= value;
    } else {
      total += value;
    }
    prevValue = value;
  }
  return total;
}

export function stripBookAbbreviationsFromText(text: string): string {
  return text.replace(ABBREVIATED_BOOK_PATTERN, "").trim();
}

function getBookNameFromLink(link: string): string | null {
  const match = BOOK_LINK_PATTERN.exec(link);
  return match ? match[1] : null;
}

function* getBookAbbreviationsFromText(text: string): Generator<string> {
  for (const match of text.matchAll(ABBREVIATED_BOOK_PATTERN)) {
    yield match[1];
  }
}

export function lookupBook(key: string | null | undefined): BibleBook | null {
  if (!key) return null;
  const normalized = key.replace(/\s/g, "").toLowerCase();
  const ot = oldTestamentLookup;
  const nt = newTestamentLookup;
  const otBook = ot.get(normalized);
  const ntBook = nt.get(normalized);
  if (otBook) {
    if (ntBook) return null;
    return otBook;
  }
  return ntBook ?? null;
}

/** Parse a USCCB readings URL into `[date, massTypeSuffix]`, or `null` if invalid. */
export function parseUrl(rawUrl: string): [Date, string] | null {
  let pathname: string;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    pathname = rawUrl;
  }

  const match = URL_PATTERN.exec(pathname);
  if (!match?.groups?.DATE) return null;

  const parsed = DATE_FMT.exec(match.groups.DATE);
  if (!parsed) return null;

  const month = Number(parsed[1]);
  const day = Number(parsed[2]);
  const year = 2000 + Number(parsed[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return [date, match.groups.TYPE ?? ""];
}

function buildTestamentBookLookup(books: BibleBook[]): Map<string, BibleBook> {
  const lookup = new Map<string, BibleBook>();
  const abbrevLookup = new Map<string, BibleBook[]>();

  for (const book of books) {
    const name = book.name.toLowerCase();
    const longAbbreviation = book.long_abbreviation.toLowerCase();
    const shortAbbreviation = book.short_abbreviation.toLowerCase();

    lookup.set(longAbbreviation, book);
    lookup.set(name, book);
    if (name.includes(" ")) {
      lookup.set(name.replace(/\s/g, ""), book);
    }

    const existing = abbrevLookup.get(shortAbbreviation) ?? [];
    existing.push(book);
    abbrevLookup.set(shortAbbreviation, existing);
  }

  for (const [shortAbbreviation, bookList] of abbrevLookup) {
    if (bookList.length > 1) continue;
    lookup.set(shortAbbreviation, bookList[0]);
  }

  return lookup;
}
