/* global console, process, URL */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  MassType,
  SectionType,
  USCCB,
  createNodeHttpClient,
  massTypeToUrl,
  parseIsoDate,
} from "catholic-mass-readings";

const startedAt = Date.now();

function isoUtcNow() {
  return new Date().toISOString();
}

function summarizeError(error) {
  if (!error || typeof error !== "object") {
    return { type: "unknown", message: String(error) };
  }
  const err = /** @type {Error & { status?: number; cause?: unknown }} */ (
    error
  );
  const cause =
    err.cause && typeof err.cause === "object" && "message" in err.cause
      ? String(/** @type {{ message: unknown }} */ (err.cause).message)
      : undefined;
  return {
    type: err.constructor?.name ?? "Error",
    message: err.message,
    status: err.status,
    cause,
  };
}

function validateMass(mass, label) {
  assert.ok(mass, `${label}: no Mass was returned`);
  assert.equal(
    new URL(mass.url).origin,
    "https://bible.usccb.org",
    `${label}: unexpected source origin`
  );
  assert.ok(mass.title.trim().length > 4, `${label}: title is empty`);
  assert.ok(mass.sections.length >= 2, `${label}: too few sections`);

  assert.ok(
    mass.sections.some((section) => section.type === SectionType.READING),
    `${label}: no reading section`
  );

  assert.ok(
    mass.sections.some((section) => section.type === SectionType.GOSPEL),
    `${label}: no Gospel section`
  );

  const readings = mass.sections.flatMap((section) => section.readings);

  assert.ok(readings.length >= 2, `${label}: too few readings`);
  assert.ok(
    readings.every((reading) => reading.text.trim().length > 20),
    `${label}: one or more readings are empty`
  );
  assert.ok(
    readings.some((reading) =>
      reading.verses.some((verse) => verse.book !== null)
    ),
    `${label}: no recognized Bible citations`
  );
}

const packageJson = JSON.parse(
  await readFile(
    new URL(
      "./node_modules/catholic-mass-readings/package.json",
      import.meta.url
    ),
    "utf8"
  )
);

const diagnostics = {
  phase: "startup",
  utcStartedAt: isoUtcNow(),
  packageVersion: packageJson.version,
  nodeVersion: process.version,
  httpClientFactory: "createNodeHttpClient",
};

console.log(
  JSON.stringify({
    event: "canary_diagnostics",
    ...diagnostics,
  })
);

const client = await createNodeHttpClient({
  timeoutMs: 30_000,
  maxResponseSizeBytes: 3 * 1024 * 1024,
  maxRedirects: 3,
});

const usccb = new USCCB(client);

const checkDefs = [
  {
    id: "fixed-date",
    date: parseIsoDate("2025-08-06"),
    type: MassType.DEFAULT,
    url: massTypeToUrl(MassType.DEFAULT, parseIsoDate("2025-08-06")),
  },
  {
    id: "current-date",
    getDate: () => USCCB.today(),
    getUrl: () => {
      const date = USCCB.today();
      return massTypeToUrl(MassType.DEFAULT, date);
    },
  },
];

/** @type {Record<string, { ok: boolean; durationMs: number; error?: ReturnType<typeof summarizeError>; title?: string; url?: string }>} */
const results = {};

for (const check of checkDefs) {
  const date =
    "date" in check && check.date
      ? check.date
      : (check.getDate?.() ?? USCCB.today());
  const url =
    "url" in check && check.url
      ? check.url
      : (check.getUrl?.() ?? massTypeToUrl(MassType.DEFAULT, date));
  const checkStarted = Date.now();

  console.log(
    JSON.stringify({
      event: "canary_check_start",
      checkId: check.id,
      requestedDate: date.toISOString().slice(0, 10),
      requestedUrl: url,
      utcStartedAt: isoUtcNow(),
    })
  );

  try {
    const mass =
      "type" in check && check.type
        ? await usccb.getMass(date, check.type, { timeoutMs: 30_000 })
        : await usccb.getMassFromDate(date, { timeoutMs: 30_000 });
    validateMass(mass, check.id);
    results[check.id] = {
      ok: true,
      durationMs: Date.now() - checkStarted,
      title: mass.title,
      url: mass.url,
    };
    console.log(
      JSON.stringify({
        event: "canary_check_success",
        checkId: check.id,
        title: mass.title,
        resolvedUrl: mass.url,
        durationMs: Date.now() - checkStarted,
      })
    );
  } catch (error) {
    results[check.id] = {
      ok: false,
      durationMs: Date.now() - checkStarted,
      error: summarizeError(error),
      url,
    };
    console.error(
      JSON.stringify({
        event: "canary_check_failure",
        checkId: check.id,
        requestedUrl: url,
        durationMs: Date.now() - checkStarted,
        error: summarizeError(error),
      })
    );
  }
}

const failures = Object.entries(results).filter(([, result]) => !result.ok);
const status = failures.length === 0 ? "UP" : "DOWN";

console.log(
  JSON.stringify(
    {
      status,
      packageVersion: packageJson.version,
      nodeVersion: process.version,
      utcFinishedAt: isoUtcNow(),
      checks: results,
      durationMs: Date.now() - startedAt,
    },
    null,
    2
  )
);

if (failures.length > 0) {
  process.exitCode = 1;
}
