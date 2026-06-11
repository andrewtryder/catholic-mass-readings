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
# Provenance requires GitHub Actions OIDC; disable for local bootstrap only
npm publish --provenance=false
```

Alternatively, use a temporary `NPM_TOKEN` secret for the first `publish.yml` run, then remove it after configuring trusted publishing.

## 2. Configure npm Trusted Publisher

On [npmjs.com](https://www.npmjs.com/) → **catholic-mass-readings** → **Settings** → **Trusted Publisher**:

| Field             | Value                                 |
| ----------------- | ------------------------------------- |
| Provider          | GitHub Actions                        |
| Repository        | `andrewtryder/catholic-mass-readings` |
| Workflow filename | `release-please.yml`                  |
| Environment       | `release`                             |

The workflow filename and environment must match the `publish` job in [.github/workflows/release-please.yml](.github/workflows/release-please.yml) exactly.

If you previously configured `publish.yml`, update the Trusted Publisher workflow filename on npmjs.com.

## 3. GitHub repository settings

### `release` environment

**Settings** → **Environments** → **New environment** → name: `release`

Optional: add required reviewers before publish.

### GitHub Pages

**Settings** → **Pages** → Build and deployment → Source: **GitHub Actions**

API docs deploy from the `docs` job in `release-please.yml` when a release is created.

### Branch protection (recommended)

The `main` ruleset requires pull requests and these status checks:

- `lint-and-format`
- `test (20)`, `test (22)`, `test (24)`
- `build`

Optional: add `Validate PR title` from `semantic-pull-request.yml`.

To recreate or update via CLI (replace `RULESET_ID` after `gh api repos/OWNER/REPO/rulesets`):

```bash
gh api -X PUT repos/andrewtryder/catholic-mass-readings/rulesets/RULESET_ID --input - <<'EOF'
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "lint-and-format" },
          { "context": "build" },
          { "context": "test (20)" },
          { "context": "test (22)" },
          { "context": "test (24)" }
        ]
      }
    }
  ]
}
EOF
```

### Actions permissions

Ensure workflows can create and approve pull requests (required for release-please).

### Renovate

Install the [Renovate GitHub App](https://github.com/apps/renovate) on the repository (configured in `renovate.json`).

## 4. Release flow

1. Merge conventional commits to `main`
2. release-please opens/updates a Release PR
3. Review and merge the Release PR
4. GitHub Release is created → `release-please.yml` publishes to npm with provenance
5. The same workflow deploys TypeDoc to GitHub Pages

## Troubleshooting OIDC publish

- **ENEEDAUTH**: Ensure npm CLI >= 11.5.1 (workflow upgrades npm globally). The publish step strips empty `_authToken` lines from `.npmrc` if setup-node wrote them.
- **404 on publish**: Trusted Publisher workflow filename, environment name, or repository URL in `package.json` may not match npm configuration.
- **Provenance**: Enabled via `publishConfig.provenance` in `package.json` and `--provenance` in the workflow.
