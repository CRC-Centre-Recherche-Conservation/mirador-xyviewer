# Contributing to Mirador XY Viewer

First of all, **thank you** for taking the time to contribute. 🎉

`mirador-xyviewer` is an open-source plugin developed by the
[Centre de Recherche sur la Conservation (CRC)](https://crc.mnhn.fr/) to bring
physicochemical-analysis data (XRF, Raman, FTIR, UV-Vis, …) to IIIF viewers for
the museum, heritage, and research communities. As a public-research project, we
want this to be a welcoming space for everyone — researchers, conservators,
students, developers, and first-time contributors alike.

Contributions of all kinds are valued: code, of course, but also documentation,
bug reports, feature ideas, translations, test cases, and real-world feedback
from your own collections and datasets. You do **not** need to be a professional
software developer to help.

## Code of Conduct

This project and everyone participating in it is governed by our
[Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to
uphold it. Please report unacceptable behavior to **github.crc@mnhn.fr**.

## A note on language

This is a French public-research project with an international audience. **You are
welcome to write issues, pull requests, and questions in French or in English.**
To keep the codebase consistent for all contributors, source code, code comments,
commit messages, and the documentation under `docs/` are kept **in English**.

## Ways to contribute

### Reporting bugs

Before opening an issue, please search [existing issues][issues] to avoid
duplicates. A good bug report includes:

- A clear, descriptive title.
- What you expected to happen vs. what actually happened.
- Minimal steps to reproduce (a sample IIIF manifest, annotation, or dataset is
  very helpful — sanitized of anything confidential).
- Your environment: plugin version, Mirador version, browser, and OS.
- Console errors or screenshots, where relevant.

> ⚠️ If you believe you have found a **security vulnerability**, please do **not**
> open a public issue. Follow our [Security Policy](./SECURITY.md) instead.

### Suggesting enhancements

Open an issue describing the use case (the "why") before the proposed solution
(the "how"). Because this plugin serves heritage-science workflows, concrete
examples from real analyses help us design the right feature.

### Improving documentation

Documentation lives in [`README.md`](./README.md) and [`docs/`](./docs/). Fixing
a typo, clarifying a guide, or adding an example is a genuinely useful first
contribution.

## Development setup

**Prerequisites:** [Node.js](https://nodejs.org/) **>= 22** and npm.

```bash
# 1. Fork the repository on GitHub, then clone your fork
git clone https://github.com/<your-username>/mirador-xyviewer.git
cd mirador-xyviewer

# 2. Install dependencies
npm install

# 3. Run the plugin inside a real Mirador viewer (hot-reloading demo)
npm run dev:demo
```

Useful scripts during development:

| Command | What it does |
| ------- | ------------ |
| `npm run dev:demo` | Launch the demo app — the easiest way to see your changes live |
| `npm test` | Run the full test suite (Vitest) |
| `npx vitest run <path>` | Run a single test file, e.g. `npx vitest run src/utils/security.test.ts` |
| `npm run test:coverage` | Run tests with a coverage report |
| `npm run typecheck` | Type-check the project (`tsc --noEmit`) |
| `npm run lint` | Lint with ESLint |
| `npm run build` | Build the publishable library |

New to the codebase? The [Developer Guide](./docs/DEVELOPER-GUIDE.md) explains the
plugin architecture, the annotation pipeline, and how to add new annotation body
types.

## Coding standards

- **TypeScript, strict mode.** Keep the build (`npm run typecheck`) and linter
  (`npm run lint`) clean — both are enforced in CI.
- **Tests are co-located** with the code they cover (`Foo.ts` ↔ `Foo.test.ts`),
  using Vitest and React Testing Library. Whole-chain tests use the
  `*.integration.test.tsx` suffix.
- **Add or update tests** for any behavior you change or add. CI enforces minimum
  coverage thresholds (statements/lines ≥ 70%, branches/functions ≥ 65%), so new
  code should come with matching tests.
- Match the style and conventions of the surrounding code.

## Commit messages

This project uses **[Conventional Commits](https://www.conventionalcommits.org/)**.
This is **required**, not cosmetic: releases and the changelog are generated
automatically by [semantic-release](https://semantic-release.gitbook.io/) from
your commit messages.

```
<type>[optional scope]: <short description>

[optional body]

[optional footer(s)]
```

Common types and their effect on versioning:

| Type | Example | Release effect |
| ---- | ------- | -------------- |
| `feat:` | `feat(spectrum): add log-scale axis toggle` | Minor version bump |
| `fix:` | `fix(fetcher): handle empty CSV response` | Patch version bump |
| `docs:`, `chore:`, `ci:`, `refactor:`, `test:`, `style:` | `docs: clarify auth setup` | No release |
| `feat!:` or a `BREAKING CHANGE:` footer | `feat!: drop Mirador 3 support` | Major version bump |

Please do **not** bump the version in `package.json` or edit `CHANGELOG.md`
manually — semantic-release handles both.

## Branching & pull-request workflow

- Base your work on the **`dev`** branch and open pull requests **against `dev`**.
- `dev` publishes `alpha` pre-releases; maintainers periodically merge `dev` into
  **`main`** to cut stable releases. Both are released automatically.
- Keep pull requests focused on a single concern — smaller PRs are reviewed
  faster.

Before requesting a review, please make sure that:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test:coverage` passes (with tests covering your change)
- [ ] Commit messages follow Conventional Commits
- [ ] Documentation is updated if behavior or the public API changed

CI runs the same checks on Node 22 and 24; a green pipeline is required before
merge.

## Licensing of contributions

This project is licensed under the [Apache License 2.0](./LICENSE). By submitting
a contribution, you agree that it is provided under the same license
(inbound = outbound), and you confirm you have the right to contribute it. We
welcome — but do not require — a [Developer Certificate of Origin](https://developercertificate.org/)
`Signed-off-by` line on your commits (`git commit -s`).

## Recognition

Every contribution, large or small, helps the heritage-science community. Thank
you for being part of it. 💙

[issues]: https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/issues
