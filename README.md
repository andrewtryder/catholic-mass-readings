# catholic-mass-readings

[![npm version](https://img.shields.io/npm/v/catholic-mass-readings)](https://www.npmjs.com/package/catholic-mass-readings)
[![CI](https://github.com/andrewtryder/catholic-mass-readings/actions/workflows/ci.yml/badge.svg)](https://github.com/andrewtryder/catholic-mass-readings/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/catholic-mass-readings)](https://github.com/andrewtryder/catholic-mass-readings/blob/main/LICENSE)
[![Provenance](https://img.shields.io/badge/provenance-SLSA-blue)](https://docs.npmjs.com/trusted-publishers)

A fast, easy-to-use tool and JavaScript/TypeScript library for fetching official Daily Mass readings directly from the **[United States Conference of Catholic Bishops (USCCB)](https://bible.usccb.org/bible/readings/)**.

Whether you are a parish volunteer preparing a weekly bulletin, a catechist or liturgy coordinator double-checking upcoming readings, a student of Scripture, or a developer building a server-side backend for a Catholic web or mobile application, this package gives you instant, structured access to official Scripture texts, responsorial psalms, alleluia verses, and Bible citations.

---

## What Can You Do With It?

- 📖 **Quickly Look Up Readings**: View the First Reading, Responsorial Psalm, Second Reading, and Gospel for today or any specific date right from your computer's command line—**no coding required**.
- 📂 **Export to JSON**: Easily save Scripture texts and citations to JSON files for newsletters, parish slides, display boards, or personal study.
- ⛪ **Support for All Mass Types**: Automatically handles Sunday celebrations, Daily Masses, and special liturgical variations (`Vigil`, `Dawn`, `Day`, `Night`, `Year A/B/C`).
- 🛠️ **Developer & App Ready**: Integrate daily readings into server-side web or mobile backends with full TypeScript support and verified parsing accuracy.

---

## Quick Start (No Coding Required!)

If you just want to look up Mass readings on your computer, you don't even need to write code! You can use our Command Line Tool (CLI).

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) (version 20 or higher) installed on your computer.

### Option 1: Run Instantly with `npx` (No Installation Needed)

You can run commands directly in your terminal/command prompt:

```bash
# Look up today's Mass readings
npx catholic-mass-readings get-mass

# Look up readings for a specific date (YYYY-MM-DD)
npx catholic-mass-readings get-mass --date 2024-12-25 --type vigil
```

### Option 2: Install Globally

If you plan to use it often, install it once globally so you can type `catholic-mass-readings` anywhere:

```bash
npm install -g catholic-mass-readings
```

---

## Command Line Guide & Examples

### 1. Look Up Mass Readings (`get-mass`)

Fetch full Scripture texts or just verse citations for any given date.

```bash
# Get today's readings
catholic-mass-readings get-mass

# Get readings for Christmas Vigil Mass
catholic-mass-readings get-mass --date 2024-12-25 --type vigil

# Print ONLY the verse citations (e.g., "Isaiah 62:1-5", "Psalm 89:4-5, 16-17, 27, 29") without reading text
catholic-mass-readings get-mass --date 2024-12-25 --type vigil --citations-only

# Save the full readings to a JSON file for use in other programs or parish software
catholic-mass-readings get-mass --date 2024-12-25 --type vigil --save christmas-vigil.json
```

#### Example Output (`get-mass --date 2024-12-25 --type vigil`)

```text
The Nativity of the Lord (Christmas) Vigil Mass
December 25, 2024
https://bible.usccb.org/bible/readings/122524-vigil-mass.cfm

Reading 1: Isaiah 62:1-5
For Zion’s sake I will not be silent...

Responsorial Psalm: Psalm 89:4-5, 16-17, 27, 29
R. (2a) For ever I will sing the goodness of the Lord.
I have made a covenant with my chosen one...

Gospel: Matthew 1:1-25
The book of the genealogy of Jesus Christ...
```

---

### 2. Check Available Mass Types (`get-mass-types`)

Some major feast days and Sundays have multiple unique Masses (e.g., _Vigil_, _Dawn_, _Day_, or _Night_ Masses). You can check what is available on any date:

```bash
catholic-mass-readings get-mass-types --date 2024-12-25
```

_Output:_

```text
VIGIL
NIGHT
DAWN
DAY
```

---

### 3. Fetch Multiple Days (`get-mass-range` & `get-sunday-mass-range`)

Need readings for an entire week, month, or upcoming liturgical season?

```bash
# Fetch every day between Christmas and New Year's Day
catholic-mass-readings get-mass-range --start 2024-12-25 --end 2025-01-01

# Fetch one day every week (e.g., stepping every 7 days)
catholic-mass-readings get-mass-range --start 2024-12-25 --end 2025-01-22 --step 7

# Fetch only Sunday Masses over a date range and save to a file
catholic-mass-readings get-sunday-mass-range --start 2024-12-01 --end 2024-12-31 --save december-sundays.json
```

#### Concurrency and error handling

By default, `get-mass-range` fetches up to **3 dates simultaneously**. You can raise or lower
this with `--concurrency`:

```bash
# Limit simultaneous requests (default is 3)
catholic-mass-readings get-mass-range \
  --start 2026-01-01 \
  --end 2026-02-01 \
  --step 1 \
  --concurrency 3
```

By default, **any** missing or failed date causes the command to exit with code `1`. Use
`--allow-partial` to exit with code `0` as long as at least one date succeeds:

```bash
# Return exit code 0 when at least one date succeeds
catholic-mass-readings get-mass-range \
  --start 2026-01-01 \
  --end 2026-02-01 \
  --allow-partial
```

| Scenario                       | Without `--allow-partial` | With `--allow-partial` |
| ------------------------------ | ------------------------- | ---------------------- |
| All dates succeed              | exit 0                    | exit 0                 |
| Some dates fail or are missing | exit 1                    | exit 0                 |
| All dates fail                 | exit 1                    | exit 1                 |

---

## For Developers: Library Usage

If you are building an application, you can install the library directly into your project:

```bash
npm install catholic-mass-readings
```

### TypeScript / JavaScript Example

```typescript
import { USCCB, MassType, createNodeHttpClient } from "catholic-mass-readings";

async function main() {
  // Creates the recommended Node.js HTTP client (uses Impit when available, falls back to platform Fetch)
  const usccb = new USCCB(await createNodeHttpClient());

  // Fetch readings for a specific date and Mass type
  const mass = await usccb.getMass(new Date(2024, 11, 25), MassType.VIGIL);

  if (mass) {
    console.log(`Title: ${mass.title}`);
    console.log(`URL: ${mass.url}`);

    for (const section of mass.sections) {
      console.log(`\nSection Type: ${section.type}`);
      console.log(`Header: ${section.header}`);
      for (const reading of section.readings) {
        console.log(`Verses:`, reading.verses);
        console.log(`Text: ${reading.text.substring(0, 100)}...`);
      }
    }
  }
}

main();
```

### Supported Mass Types (`MassType` enum)

- `DEFAULT` (`""`) — The standard Daily Mass readings for the given date
- `VIGIL` — Vigil Mass readings
- `NIGHT` — Mass during the Night
- `DAWN` — Mass at Dawn
- `DAY` — Mass during the Day
- `YEARA`, `YEARB`, `YEARC` — Liturgical year-specific cycles (when applicable)

### API Documentation

Full API definitions, interfaces (`Mass`, `Section`, `Reading`, `Verse`), and TypeDoc documentation are published automatically to GitHub Pages:
👉 **[Full API Reference](https://andrewtryder.github.io/catholic-mass-readings/)**

---

## Contributing & Developer Guide

If you are interested in contributing, running tests, or understanding the project's architecture and CI/CD workflows, please check out our developer documentation:

- 🛠️ **[Developer Guide (DEVELOPMENT.md)](DEVELOPMENT.md)** — Local setup, verification suite, architecture, and workflow details
- 🤝 **[Contributing Guidelines (CONTRIBUTING.md)](CONTRIBUTING.md)** — Conventional Commits, pull request rules, and code standards
- 📦 **[Publishing Guide (PUBLISHING.md)](PUBLISHING.md)** — Release procedures and npm publishing setup

---

## Content Notice & License

### Software License

The source code of **catholic-mass-readings** (including our CLI and parsing library) is licensed under the **[Apache-2.0 License](LICENSE)**. This project is a TypeScript port and expansion of [`rcolfin/catholic-mass-readings`](https://github.com/rcolfin/catholic-mass-readings).

### Scripture Content Notice

This package retrieves Scripture texts, verse citations, and liturgical content directly from the **[United States Conference of Catholic Bishops (USCCB)](https://bible.usccb.org/bible/readings/)** website. The Apache-2.0 software license covers only the code in this repository and does not grant copyright or usage rights in the retrieved Scripture text or liturgical content. Users are responsible for complying with the applicable **[USCCB Terms of Use and Copyright Guidelines](https://www.usccb.org/)** when reproducing, displaying, or distributing fetched readings in their own applications or publications.
