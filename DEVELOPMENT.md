# Developer Guide (`catholic-mass-readings`)

Thank you for your interest in developing and contributing to **catholic-mass-readings**! This guide covers local development setup, architectural concepts, verification workflows, and our automated CI/CD pipelines.

For rules regarding commit formatting, branch naming, and pull request submissions, please see **[CONTRIBUTING.md](CONTRIBUTING.md)**. For release and npm publishing setup, see **[PUBLISHING.md](PUBLISHING.md)**.

---

## 1. Local Development Setup

### Prerequisites

- **Node.js**: Version **24** is required for local development and running the full build/test suite (see `.nvmrc`). Note that the published npm package supports runtime execution on Node `>=20`.

### Getting Started

Clone the repository and install dependencies:

```bash
git clone https://github.com/andrewtryder/catholic-mass-readings.git
cd catholic-mass-readings
npm install
```

---

## 2. Verification & Testing Commands

We maintain strict quality, formatting, and 100% test coverage standards across the codebase.

```bash
# Run the complete verification suite (format check, lint, typecheck, tests + coverage, and build)
npm run verify

# Run unit tests across all test files
npm test

# Run unit tests with live code coverage reporting
npm run test:coverage

# Automatically format all files with Prettier
npm run format

# Check formatting without writing changes
npm run format:check

# Run ESLint across the project
npm run lint

# Check TypeScript types without emitting output
npm run typecheck

# Build TypeDoc HTML documentation locally (outputs to docs/)
npm run docs
```

> **Note**: HTML fixtures under `tests/data/` are excluded from Prettier so scraped pages remain verbatim snapshots of USCCB responses.

---

## 3. Architecture Overview

### Core Parsing (`src/usccb.ts` & `src/models.ts`)

- **`USCCB`**: The primary class responsible for parsing raw HTML scraped from `bible.usccb.org` into structured domain models (`Mass`, `Section`, `Reading`, `Verse`).
- **Date & Mass Type Resolution**: Handles mapping calendar dates and liturgical `MassType` variations (`DEFAULT`, `VIGIL`, `NIGHT`, `DAWN`, `DAY`, `YEARA/B/C`) to official USCCB URL paths.
- **Serialization & DTOs**: Functions like `massToDict()`, `sectionToDict()`, and `readingToDict()` transform runtime domain objects into clean, JSON-compatible DTOs (`SerializedMass`, `SerializedSection`, `SerializedReading`, `SerializedVerse`).

### HTTP Client & Backend Support (`src/http.ts` & `src/http-node.ts`)

- **`createFetchClient()`**: Factory for our platform `fetch` wrapper. Enforces strict constructor-time option validation (`timeoutMs`, `maxResponseSizeBytes`, `maxRedirects`) and handles redirect safety.
- **`createNodeHttpClient()`**: Creates the recommended Node.js HTTP client. It uses the optional `impit` backend when available and falls back to the platform Fetch API.

### Obolus Challenge Solver (`src/obolus.ts` & `src/http-obolus.ts`)

- The USCCB website utilizes automated bot mitigation ("Obolus") challenges (`403 Forbidden` responses with computational proof requirements).
- **`wrapFetchWithObolus()`**: Transparently wraps fetch requests to detect Obolus challenges, compute required nonces/tokens, and automatically retry requests with the solved `X_Obolus_Proof` cookie while preserving strict response size bounds.

---

## 4. CI/CD & Automated Workflows

All automated GitHub Actions workflows reside in `.github/workflows/`. Below is the active summary of when and why each workflow runs:

| Workflow                    | Trigger                                               | Purpose                                                                                                                                                                                                   |
| :-------------------------- | :---------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`                    | `push` to `main`, `pull_request`, `workflow_dispatch` | Runs complete code quality verification: formatting (`Prettier`), linting (`ESLint`), strict typechecking (`tsc`), unit tests with 100% coverage check (`Vitest`), and package build (`tsc`).             |
| `semantic-pull-request.yml` | `pull_request`                                        | Enforces `Conventional Commits` format (`<type>(<scope>): <subject>`) for pull request titles.                                                                                                            |
| `release-please.yml`        | `push` to `main`                                      | Automates release management. Creates/updates Release PRs with changelog bumps; upon merge, automatically publishes to npm via OIDC trusted publishing and deploys TypeDoc documentation to GitHub Pages. |
| `docs.yml`                  | `workflow_dispatch` (manual)                          | Fallback manual workflow to build and deploy TypeDoc API documentation directly to GitHub Pages.                                                                                                          |
| `codeql.yml`                | `pull_request`, `schedule`                            | Automated static analysis scanning for security vulnerabilities and code quality issues.                                                                                                                  |
| `dependency-review.yml`     | `pull_request`                                        | Scans pull requests for newly introduced dependencies with known vulnerabilities or problematic licenses.                                                                                                 |

---

## 5. Local Git Hooks (`Husky`)

When working locally after `npm install`, Husky activates the following hooks to prevent broken commits:

- **`pre-commit`**: Runs ESLint and Prettier on staged files.
- **`pre-push`**: Runs `npm run verify` to guarantee that formatting, types, and 100% test coverage pass before pushing to GitHub.
- **`commit-msg`**: Runs `commitlint` to verify commit messages follow `Conventional Commits`.
