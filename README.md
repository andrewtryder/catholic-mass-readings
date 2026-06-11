# catholic-mass-readings (TypeScript)

TypeScript port of [rcolfin/catholic-mass-readings](https://github.com/rcolfin/catholic-mass-readings) — a library and CLI for querying Daily Mass readings from [bible.usccb.org](https://bible.usccb.org/bible/readings/).

## Features

- **Shared library** — scrape and parse USCCB mass readings
- **CLI** — same commands as the Python package

For a hosted HTTP API, see [dailyreadings-api](https://github.com/andrewtryder/dailyreadings-api) (Cloudflare Worker).

## Installation

```bash
npm install
npm run build
```

Link the CLI globally:

```bash
npm link
```

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

During development:

```bash
npm run cli -- get-mass --date 2025-08-06
```

## Library Usage

```typescript
import { USCCB, MassType } from "catholic-mass-readings";

const usccb = new USCCB();
const mass = await usccb.getMass(new Date(2024, 11, 25), MassType.VIGIL);
console.log(mass);
```

## Live fetching note

USCCB uses bot protection (Varnish challenge pages) that blocks many automated requests. The Python package solves this with `curl_cffi` TLS impersonation; this TypeScript port uses [`impit`](https://www.npmjs.com/package/impit) for the CLI.

If live requests return 403 in your environment, parsing is still verified against the Python project's HTML fixtures (`npm test`).

## Development

Requires Node 24 (see `.nvmrc`).

```bash
npm install          # installs deps + Husky git hooks
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run build
```

### Local git hooks

- **pre-commit** — `lint-staged` runs ESLint --fix and Prettier on staged files
- **commit-msg** — `commitlint` enforces Conventional Commits (`feat: add login`, etc.)

### CI/CD (GitHub Actions)

| Workflow                    | Trigger        | Purpose                                  |
| --------------------------- | -------------- | ---------------------------------------- |
| `ci.yml`                    | Pull request   | format, lint, typecheck, coverage, build |
| `semantic-pull-request.yml` | Pull request   | PR title must be Conventional Commits    |
| `release-please.yml`        | Push to `main` | Opens/updates Release PR with changelog  |

### GitHub repo settings

- Enable **squash merge** with default message = PR title
- Actions → allow workflows to **create and approve pull requests** (for release-please)
- Optional branch protection: require `lint-and-format`, `build`, `Validate PR title`

### Dependency updates

Install the [Renovate GitHub App](https://github.com/apps/renovate) on the repo to receive grouped update PRs (configured in `renovate.json`).

## License

Apache-2.0 — see [LICENSE](LICENSE).
