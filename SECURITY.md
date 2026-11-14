# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report security issues privately via [GitHub Security Advisories](https://github.com/andrewtryder/catholic-mass-readings/security/advisories/new).

You should receive a response within a reasonable timeframe. If the issue is confirmed, we will release a fix and coordinate disclosure.

## Security Controls & Best Practices

- **SSRF & URL Validation**: `USCCB.getMassFromUrl()` strictly enforces the `https://bible.usccb.org/bible/readings/` origin and path allowlist and rejects embedded credentials. `USCCB.getMassFromTrustedUrl()` bypasses this origin allowlist for trusted mirrors or test servers; never pass untrusted user-supplied URLs to `getMassFromTrustedUrl()`.
- **Redirects, Size & Timeouts**: `createFetchClient()` blocks cross-origin and non-HTTP(S) redirects, enforces a `3` MB default response size cap with stream cancellation, and bounds request timeouts and retries.
- **Automated Scanning**: The repository runs CodeQL static analysis, PR dependency review, and recurring `npm audit` scans against `main` via `.github/workflows/security-audit.yml`.
