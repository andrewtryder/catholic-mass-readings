import {
  DATE_FMT,
  NEW_TESTAMENT_BOOKS,
  OLD_TESTAMENT_BOOKS,
  type BibleBook,
} from "./constants.js";

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

let oldTestamentLookup: Map<string, BibleBook> | null = null;
let newTestamentLookup: Map<string, BibleBook> | null = null;

export function formatUrlDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yy = String(date.getFullYear() % 100).padStart(2, "0");
  return `${mm}${dd}${yy}`;
}

export function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

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

export function addDays(date: Date, days: number): Date {
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
  const ot = getOldTestamentBookLookup();
  const nt = getNewTestamentBookLookup();
  const otBook = ot.get(normalized);
  const ntBook = nt.get(normalized);
  if (otBook) {
    if (ntBook) return null;
    return otBook;
  }
  return ntBook ?? null;
}

export function parseUrl(url: string): [Date, string] | null {
  const match = URL_PATTERN.exec(url);
  if (!match?.groups?.DATE) return null;
  const dateStr = match.groups.DATE;
  const parsed = DATE_FMT.exec(dateStr);
  if (!parsed) return null;
  const month = parseInt(parsed[1], 10) - 1;
  const day = parseInt(parsed[2], 10);
  const year = 2000 + parseInt(parsed[3], 10);
  return [new Date(year, month, day), match.groups.TYPE ?? ""];
}

function getOldTestamentBookLookup(): Map<string, BibleBook> {
  if (!oldTestamentLookup) {
    oldTestamentLookup = buildTestamentBookLookup(OLD_TESTAMENT_BOOKS);
  }
  return oldTestamentLookup;
}

function getNewTestamentBookLookup(): Map<string, BibleBook> {
  if (!newTestamentLookup) {
    newTestamentLookup = buildTestamentBookLookup(NEW_TESTAMENT_BOOKS);
  }
  return newTestamentLookup;
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
