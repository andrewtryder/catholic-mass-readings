#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Command, Option } from "commander";

import {
  MassType,
  type OutputFormat,
  massToDict,
  massToString,
  parseMassType,
} from "./models.js";
import { createNodeHttpClient } from "./http-node.js";
import { USCCB } from "./usccb.js";
import { addDays, parseIsoDate, todayInNewYork } from "./utils.js";
import { USCCBArgumentError } from "./errors.js";

const DATE_FMT = "YYYY-MM-DD";
const MASS_TYPE_CHOICES = Object.keys(MassType) as (keyof typeof MassType)[];
const MASS_TYPE_HELP = `${MASS_TYPE_CHOICES.join(", ")} (case-insensitive)`;
const REVERSE_MASS_TYPE = new Map(
  Object.entries(MassType).map(([k, v]) => [v, k])
);

function massTypeOption(): Option {
  return new Option("-t, --type <type...>", `Mass type: ${MASS_TYPE_HELP}`);
}

function citationsOnlyOption(): Option {
  return new Option(
    "--citations-only",
    "Print only Bible citations (verse references), not full reading text"
  );
}

function concurrencyOption(): Option {
  return new Option(
    "--concurrency <count>",
    "Maximum number of concurrent requests"
  ).default("3");
}

function allowPartialOption(): Option {
  return new Option(
    "--allow-partial",
    "Allow partial results with exit code 0 if at least one date succeeded"
  );
}

function parseConcurrencyOption(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 20) {
    throw new USCCBArgumentError(
      `concurrency must be an integer between 1 and 20; received '${value}'`
    );
  }
  return n;
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  operation: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await operation(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}

function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateOption(value: string): Date {
  return parseIsoDate(value);
}

function parseMassTypes(values: string[] | undefined): MassType[] | undefined {
  if (!values || values.length === 0) return undefined;
  return values.map((value) => {
    try {
      return parseMassType(value);
    } catch {
      throw new USCCBArgumentError(
        `Invalid mass type '${value}'. Allowed choices are ${MASS_TYPE_CHOICES.join(", ")}.`
      );
    }
  });
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 4), "utf-8");
}

const LOG_LEVELS = {
  DEBUG: 10,
  INFO: 20,
  WARNING: 30,
  ERROR: 40,
  CRITICAL: 50,
  NOTSET: 0,
};

let currentLogLevel = LOG_LEVELS.INFO;

function setLogLevel(levelName: string) {
  const level = LOG_LEVELS[levelName as keyof typeof LOG_LEVELS];
  if (level !== undefined) {
    currentLogLevel = level;
  }
}

function log(
  messageLevel: number,
  prefix: string,
  args: readonly unknown[]
): void {
  if (
    currentLogLevel !== LOG_LEVELS.NOTSET &&
    currentLogLevel <= messageLevel
  ) {
    console.error(prefix, ...args);
  }
}

const logger = {
  debug: (...args: unknown[]) => log(LOG_LEVELS.DEBUG, "[DEBUG]", args),
  info: (...args: unknown[]) => log(LOG_LEVELS.INFO, "[INFO]", args),
  warn: (...args: unknown[]) => log(LOG_LEVELS.WARNING, "[WARNING]", args),
  error: (...args: unknown[]) => log(LOG_LEVELS.ERROR, "[ERROR]", args),
};

const today = todayInNewYork();
const todayStr = formatIsoDate(today);
const weekLaterStr = formatIsoDate(addDays(today, 7));

const program = new Command()
  .name("catholic-mass-readings")
  .description(
    "Catholic Mass Readings CLI — fetch daily readings from bible.usccb.org"
  )
  .addOption(
    new Option("--log-level <level>", "Logging level")
      .choices(["CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG", "NOTSET"])
      .default("INFO")
  )
  .hook("preAction", (thisCommand) => {
    setLogLevel(thisCommand.opts().logLevel);
  });

program
  .command("get-mass")
  .description(
    "Fetch the mass readings for a specific date and print them to stdout"
  )
  .option("--date <date>", `Date (${DATE_FMT})`, todayStr)
  .addOption(massTypeOption())
  .addOption(citationsOnlyOption())
  .option("--save <file>", "Save JSON output to file")
  .action(
    async (options: {
      date: string;
      type?: string[];
      citationsOnly?: boolean;
      save?: string;
    }) => {
      const date = parseDateOption(options.date);
      const types = parseMassTypes(options.type);
      const format = options.citationsOnly ? "citations" : "full";
      const usccb = new USCCB(await createNodeHttpClient());
      const mass = await usccb.getMassFromDate(date, types);
      if (!mass) {
        logger.error(
          `No readings found for ${options.date}. USCCB returned 404 for all checked mass types.`
        );
        process.exitCode = 1;
        return;
      }
      console.log(massToString(mass, format));
      if (options.save) {
        await writeJson(options.save, massToDict(mass, format));
      }
    }
  );

program
  .command("get-mass-types")
  .description("List all mass types available for a given date")
  .option("--date <date>", `Date (${DATE_FMT})`, todayStr)
  .action(async (options: { date: string }) => {
    const date = parseDateOption(options.date);
    const usccb = new USCCB(await createNodeHttpClient());
    const massTypes = await usccb.getMassTypes(date);
    for (const massType of massTypes) {
      console.log(REVERSE_MASS_TYPE.get(massType) ?? massType);
    }
  });

program
  .command("get-mass-range")
  .description("Fetch mass readings for each date in a range")
  .option("-s, --start <date>", `Start date (${DATE_FMT})`, todayStr)
  .option("-e, --end <date>", `End date (${DATE_FMT})`, weekLaterStr)
  .addOption(massTypeOption())
  .addOption(citationsOnlyOption())
  .addOption(concurrencyOption())
  .addOption(allowPartialOption())
  .option("--step <days>", "Number of days to step", "7")
  .option("--save <file>", "Save JSON output to file")
  .action(
    async (options: {
      start: string;
      end: string;
      type?: string[];
      citationsOnly?: boolean;
      concurrency: string;
      allowPartial?: boolean;
      step: string;
      save?: string;
    }) => {
      const start = parseDateOption(options.start);
      const end = parseDateOption(options.end);
      const types = parseMassTypes(options.type);
      const format = options.citationsOnly ? "citations" : "full";
      const concurrency = parseConcurrencyOption(options.concurrency);
      const dates = USCCB.getMassDates(start, end, Number(options.step));
      await printMassRange(
        dates,
        types,
        options.save,
        format,
        concurrency,
        options.allowPartial
      );
    }
  );

program
  .command("get-sunday-mass-range")
  .description("Fetch Sunday mass readings for each Sunday in a date range")
  .option("-s, --start <date>", `Start date (${DATE_FMT})`, todayStr)
  .option("-e, --end <date>", `End date (${DATE_FMT})`, weekLaterStr)
  .addOption(massTypeOption())
  .addOption(citationsOnlyOption())
  .addOption(concurrencyOption())
  .addOption(allowPartialOption())
  .option("--save <file>", "Save JSON output to file")
  .action(
    async (options: {
      start: string;
      end: string;
      type?: string[];
      citationsOnly?: boolean;
      concurrency: string;
      allowPartial?: boolean;
      save?: string;
    }) => {
      const start = parseDateOption(options.start);
      const end = parseDateOption(options.end);
      const types = parseMassTypes(options.type);
      const format = options.citationsOnly ? "citations" : "full";
      const concurrency = parseConcurrencyOption(options.concurrency);
      const dates = USCCB.getSundayMassDates(start, end);
      await printMassRange(
        dates,
        types,
        options.save,
        format,
        concurrency,
        options.allowPartial
      );
    }
  );

type DateFetchResult =
  | {
      date: Date;
      status: "success";
      mass: NonNullable<Awaited<ReturnType<USCCB["getMassFromDate"]>>>;
    }
  | { date: Date; status: "not-found" }
  | { date: Date; status: "failed"; error: unknown };

async function printMassRange(
  dates: Date[],
  types: MassType[] | undefined,
  save?: string,
  format: OutputFormat = "full",
  concurrency = 3,
  allowPartial = false
): Promise<void> {
  const usccb = new USCCB(await createNodeHttpClient());
  const results = await mapWithConcurrency<Date, DateFetchResult>(
    dates,
    concurrency,
    async (date) => {
      try {
        const mass = await usccb.getMassFromDate(date, types);
        if (mass) {
          return { date, status: "success", mass };
        }
        return { date, status: "not-found" };
      } catch (error) {
        return { date, status: "failed", error };
      }
    }
  );

  const successes = results.filter(
    (
      r
    ): r is {
      date: Date;
      status: "success";
      mass: NonNullable<Awaited<ReturnType<USCCB["getMassFromDate"]>>>;
    } => r.status === "success"
  );
  const notFound = results.filter((r) => r.status === "not-found");
  const failed = results.filter((r) => r.status === "failed");

  const masses = successes
    .map((r) => r.mass)
    .sort((a, b) => {
      const aOrdinal = a.date ? a.date.getTime() : -1;
      const bOrdinal = b.date ? b.date.getTime() : -1;
      return aOrdinal - bOrdinal;
    });

  for (const [index, mass] of masses.entries()) {
    const suffix = index === masses.length - 1 ? "\n" : "\n\n";
    process.stdout.write(massToString(mass, format) + suffix);
  }

  if (save) {
    await writeJson(
      save,
      masses.map((mass) => massToDict(mass, format))
    );
  }

  if (notFound.length > 0 || failed.length > 0) {
    logger.error(
      `Range fetch summary: ${successes.length} succeeded, ${notFound.length} not found, ${failed.length} failed`
    );
    for (const item of notFound) {
      logger.error(`Not found for date ${formatIsoDate(item.date)}`);
    }
    for (const item of failed) {
      if (item.status === "failed") {
        const message =
          item.error instanceof Error ? item.error.message : String(item.error);
        logger.error(`Failed for date ${formatIsoDate(item.date)}: ${message}`);
      }
    }

    if (!allowPartial || successes.length === 0) {
      process.exitCode = 1;
    }
  }
}

program.parseAsync(process.argv).catch((error: unknown) => {
  logger.error(error);
  process.exitCode = 1;
});
