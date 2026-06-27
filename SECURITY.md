# Security Policy

The Mirador XY Viewer team and the [Centre de Recherche sur la Conservation
(CRC)](https://crc.mnhn.fr/) take the security of this project seriously. We
appreciate the work of the security community and welcome responsible disclosure
of vulnerabilities.

## Supported versions

`mirador-xyviewer` is a library distributed on npm. Security fixes are applied to
the current release line:

| Version | Supported |
| ------- | --------- |
| Latest `1.x` stable (current `latest` on npm) | ✅ |
| `1.1.0-alpha` pre-releases (`dev` channel) | ⚠️ Best-effort |
| Older / unreleased versions | ❌ |

We strongly recommend always running the most recent published version.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Instead, please use one of the following private channels:

1. **GitHub Security Advisories** (preferred) — use the
   ["Report a vulnerability"](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/security/advisories/new)
   button on the repository's *Security* tab. This keeps the report private and
   lets us collaborate on a fix.
2. **Email** — write to **github.crc@mnhn.fr**. Reports in French or English are
   both welcome.

Please include as much of the following as you can, to help us triage quickly:

- A description of the vulnerability and its potential impact.
- Steps to reproduce, or a proof-of-concept.
- The affected version(s) and environment (browser, Mirador version).
- Any suggested mitigation, if you have one.

## What to expect

- **Acknowledgement** of your report within **5 business days**.
- An initial assessment and, where confirmed, a remediation plan.
- Coordinated disclosure: we will work with you on a disclosure timeline and,
  with your consent, credit you in the release notes and security advisory once a
  fix is available.

We ask that you give us a reasonable opportunity to address the issue before any
public disclosure.

## Security-relevant areas

This plugin runs inside a host's Mirador viewer and fetches user-configured IIIF
resources and analysis datasets. Areas where security reports are especially
valuable include:

- **Dataset fetching** — the plugin validates URLs, MIME types, and response
  sizes, and defaults to credential-less requests (`credentials: 'omit'`).
- **IIIF Auth integration** (`mirador-xyviewer/mirador-auth`) — token reuse is
  gated by an origin trust model, an HTTPS requirement, and an **SSRF blocklist**
  that refuses private/reserved/loopback/internal hosts. See
  [`docs/IIIF-AUTH.md`](./docs/IIIF-AUTH.md).
- **Annotation rendering** — text from annotations is sanitized before display.

Reports demonstrating a bypass of any of these protections are particularly
appreciated.

## Scope

This policy covers the `mirador-xyviewer` package in this repository. Issues in
upstream dependencies (e.g. `mirador`, `plotly.js`) should be reported to their
respective maintainers, though we are happy to help coordinate.
