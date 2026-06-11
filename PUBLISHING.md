# Publishing to npm

This document covers one-time setup for automated npm releases via OIDC trusted publishing.

## Prerequisites

- npm account with access to publish `catholic-mass-readings`
- Admin access to the GitHub repository
- Two-factor authentication enabled on npm (recommended)

## 1. Bootstrap the package name (one-time)

Trusted Publisher configuration requires an **existing** package on npmjs.com. Before the first automated release:

```bash
npm login
npm run build
npm publish --access public --provenance
```

Alternatively, use a temporary `NPM_TOKEN` secret for the first `publish.yml` run, then remove it after configuring trusted publishing.

## 2. Configure npm Trusted Publisher

On [npmjs.com](https://www.npmjs.com/) → **catholic-mass-readings** → **Settings** → **Trusted Publisher**:

| Field             | Value                                 |
| ----------------- | ------------------------------------- |
| Provider          | GitHub Actions                        |
| Repository        | `andrewtryder/catholic-mass-readings` |
| Workflow filename | `publish.yml`                         |
| Environment       | `release`                             |

The workflow filename and environment must match [.github/workflows/publish.yml](.github/workflows/publish.yml) exactly.

## 3. GitHub repository settings

### `release` environment

**Settings** → **Environments** → **New environment** → name: `release`

Optional: add required reviewers before publish.

### GitHub Pages

**Settings** → **Pages** → Build and deployment → Source: **GitHub Actions**

API docs deploy from `docs.yml` on each published release.

### Branch protection (recommended)

Require status checks before merging to `main`:

- `lint-and-format`
- `test (20)`, `test (22)`, `test (24)`
- `build`
- `Validate PR title`

### Actions permissions

Ensure workflows can create and approve pull requests (required for release-please).

### Renovate

Install the [Renovate GitHub App](https://github.com/apps/renovate) on the repository (configured in `renovate.json`).

## 4. Release flow

1. Merge conventional commits to `main`
2. release-please opens/updates a Release PR
3. Review and merge the Release PR
4. GitHub Release is created → `publish.yml` publishes to npm with provenance
5. `docs.yml` deploys TypeDoc to GitHub Pages

## Troubleshooting OIDC publish

- **ENEEDAUTH**: Ensure npm CLI >= 11.5.1 (workflow upgrades npm globally). The publish step strips empty `_authToken` lines from `.npmrc` if setup-node wrote them.
- **404 on publish**: Trusted Publisher workflow filename, environment name, or repository URL in `package.json` may not match npm configuration.
- **Provenance**: Enabled via `publishConfig.provenance` in `package.json` and `--provenance` in the workflow.
