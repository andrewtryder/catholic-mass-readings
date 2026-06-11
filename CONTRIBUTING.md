# Contributing

Thanks for your interest in **catholic-mass-readings**!

## Development setup

Requires Node 24 for local development (see `.nvmrc`). The published package supports Node `>=20`.

```bash
git clone https://github.com/andrewtryder/catholic-mass-readings.git
cd catholic-mass-readings
npm install
npm run verify
```

`npm run verify` runs the same checks as CI (`format:check`, `lint`, `typecheck`, `test:coverage`, `build`). HTML fixtures under `tests/data/` are excluded from Prettier so scraped pages stay verbatim.

## Commits and pull requests

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`

- Subject: imperative, lowercase, header <= 72 characters
- PR titles must follow Conventional Commits (enforced in CI)
- Squash-merge PRs into `main` with the PR title as the commit message

Local hooks (Husky):

- **pre-commit** — ESLint + Prettier on staged files (not the full test suite)
- **pre-push** — `npm run verify` (mirrors GitHub CI before the remote sees your branch)
- **commit-msg** — commitlint validates Conventional Commits

## Releases and npm publishing

Releases are automated with [release-please](https://github.com/googleapis/release-please):

1. Conventional commits on `main` update a Release PR (version bump + `CHANGELOG.md`)
2. Merging the Release PR creates a GitHub Release and tag
3. The `release-please.yml` workflow publishes to npm via OIDC trusted publishing
4. The same workflow deploys TypeDoc to GitHub Pages

See [PUBLISHING.md](PUBLISHING.md) for one-time npm and GitHub setup.

## Reporting issues

Use [GitHub Issues](https://github.com/andrewtryder/catholic-mass-readings/issues) for bugs and feature requests. For security issues, see [SECURITY.md](SECURITY.md).
