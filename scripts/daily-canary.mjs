/* global console, process, URL */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  MassType,
  SectionType,
  USCCB,
  createNodeHttpClient,
  parseIsoDate,
} from "catholic-mass-readings";

const startedAt = Date.now();

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

const client = await createNodeHttpClient({
  timeoutMs: 30_000,
  maxResponseSizeBytes: 3 * 1024 * 1024,
  maxRedirects: 3,
});

const usccb = new USCCB(client);

// Stable historical fixture: verifies that parsing and anti-bot handling work.
const fixedMass = await usccb.getMass(
  parseIsoDate("2025-08-06"),
  MassType.DEFAULT,
  { timeoutMs: 30_000 }
);
validateMass(fixedMass, "fixed-date");

// Current readings: detects publication changes or date-resolution failures.
const currentDate = USCCB.today();
const currentMass = await usccb.getMassFromDate(currentDate, {
  timeoutMs: 30_000,
});
validateMass(currentMass, "current-date");

console.log(
  JSON.stringify(
    {
      status: "UP",
      packageVersion: packageJson.version,
      nodeVersion: process.version,
      fixedTitle: fixedMass.title,
      currentDate: currentDate.toISOString().slice(0, 10),
      currentTitle: currentMass.title,
      durationMs: Date.now() - startedAt,
    },
    null,
    2
  )
);
