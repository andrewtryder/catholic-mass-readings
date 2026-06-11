# catholic-mass-readings

[![npm version](https://img.shields.io/npm/v/catholic-mass-readings)](https://www.npmjs.com/package/catholic-mass-readings)
[![CI](https://github.com/andrewtryder/catholic-mass-readings/actions/workflows/ci.yml/badge.svg)](https://github.com/andrewtryder/catholic-mass-readings/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/catholic-mass-readings)](https://github.com/andrewtryder/catholic-mass-readings/blob/main/LICENSE)
[![Provenance](https://img.shields.io/badge/provenance-SLSA-blue)](https://docs.npmjs.com/trusted-publishers)

TypeScript port of [rcolfin/catholic-mass-readings](https://github.com/rcolfin/catholic-mass-readings) — a library and CLI for querying Daily Mass readings from [bible.usccb.org](https://bible.usccb.org/bible/readings/).

## Features

- **Library** — scrape and parse USCCB mass readings
- **CLI** — same commands as the Python package

## Installation

**Library:**

```bash
npm install catholic-mass-readings
```

**CLI (global):**

```bash
npm install -g catholic-mass-readings
```

Requires Node.js `>=20`.

## CLI Usage

```bash
# Get mass for a date
catholic-mass-readings get-mass --date 2024-12-25 --type vigil

# List available mass types
catholic-mass-readings get-mass-types --date 2025-12-25

# Get a range of masses
catholic-mass-readings get-mass-range --start 2024-12-25 --end 2025-01-01 --step 7

# Get Sunday masses in a range
catholic-mass-readings get-sunday-mass-range --start 2024-12-25 --end 2025-01-01

# Save to JSON
catholic-mass-readings get-mass --date 2024-12-25 --type vigil --save mass.json

# Citations only (verse references, no reading text)
catholic-mass-readings get-mass --date 2025-08-06 --citations-only
```

## Library Usage

```typescript
import { USCCB, MassType } from "catholic-mass-readings";

const usccb = new USCCB();
const mass = await usccb.getMass(new Date(2024, 11, 25), MassType.VIGIL);
console.log(mass);
```

## Documentation

API reference (TypeDoc) is published to GitHub Pages after each release:

https://andrewtryder.github.io/catholic-mass-readings/

## Live fetching note

USCCB uses bot protection (Varnish challenge pages) that blocks many automated requests. The Python package solves this with `curl_cffi` TLS impersonation; this TypeScript port uses [`impit`](https://www.npmjs.com/package/impit) for the CLI.

If live requests return 403 in your environment, parsing is still verified against the Python project's HTML fixtures (`npm test`).

## Development

Requires Node 24 for local development (see `.nvmrc`).

```bash
git clone https://github.com/andrewtryder/catholic-mass-readings.git
cd catholic-mass-readings
npm install
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run docs
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for commit conventions and PR workflow.

### CI/CD (GitHub Actions)

| Workflow                    | Trigger        | Purpose                                    |
| --------------------------- | -------------- | ------------------------------------------ |
| `ci.yml`                    | Pull request   | format, lint, typecheck, coverage, build   |
| `semantic-pull-request.yml` | Pull request   | PR title must be Conventional Commits      |
| `release-please.yml`        | Push to `main` | Opens/updates Release PR with changelog    |
| `publish.yml`               | GitHub Release | Publishes to npm (OIDC trusted publishing) |
| `docs.yml`                  | GitHub Release | Deploys TypeDoc to GitHub Pages            |
| `codeql.yml`                | PR + schedule  | Security static analysis                   |
| `dependency-review.yml`     | Pull request   | Flags vulnerable dependency changes        |

Publishing setup: [PUBLISHING.md](PUBLISHING.md).

### Dependency updates

Install the [Renovate GitHub App](https://github.com/apps/renovate) on the repo to receive grouped update PRs (configured in `renovate.json`).

## License

Apache-2.0 — see [LICENSE](LICENSE).
