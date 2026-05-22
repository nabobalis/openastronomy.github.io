# openastronomy.github.io

This is the source code for the [openastronomy.org](https://openastronomy.org)
website. The site is built with Astro and outputs static HTML to `html/`.

For code style, CI details, upstream sync notes, and dependency update guidance,
see [CONTRIBUTING.md](CONTRIBUTING.md).

## Requirements

- [Node.js](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
  22 or newer
- npm

## Local Development

Install dependencies from the lockfile:

```shell
npm ci
```

Run the dev server:

```shell
npm run dev
```

Build the website:

```shell
npm run build
```

Preview the production build:

```shell
npm run preview
```

## Checks

Run the unit test suite:

```shell
npm test
```

Run tests in watch mode:

```shell
npm run test:watch
```

Format the codebase:

```shell
npm run format
```

Check formatting without writing changes:

```shell
npm run format:check
```

Run ESLint:

```shell
npm run lint
```

Auto-fix ESLint issues where supported:

```shell
npm run lint:fix
```

Run Markdown lint:

```shell
npm run lint:md
```

Auto-fix Markdown lint issues where supported:

```shell
npm run lint:md:fix
```

Run Astro type and content checks:

```shell
npm run astro:check
```

Run the short combined source check:

```shell
npm run check
```

## Link Checks

Build the site before running link checks:

```shell
npm run build
```

Check internal links and anchors:

```shell
npm run linkcheck:internal
```

Check external links:

```shell
npm run linkcheck:external
```

Skip patterns are read from `linkcheck.skip.txt` by default. Add one regular
expression per line.

Supported environment variables:

- `LINKCHECK_ROOT=...` points at a different build folder.
- `LINKCHECK_SKIP_FILE=...` points at a different skip-pattern file.
- `LINKCHECK_TIMEOUT=...` sets the external request timeout in milliseconds.
- `LINKCHECK_CONCURRENCY=...` sets the number of parallel external checks
  (default: 20).

## CI

GitHub Actions (`.github/workflows/ci.yml`) is the merge quality gate. It runs
formatting, source lint, Markdown lint, Astro checks, unit tests, a production
build, and internal/external link checks.

CircleCI (`.circleci/config.yml`) builds the site and publishes the `html/`
artifact for pull-request preview.

## Structure

- `public/` contains static passthrough assets such as `CNAME`, Open Graph
  images, and raw files.
- `src/assets/` contains assets processed by Astro, including member logos and
  backgrounds.
- `src/components/` contains shared Astro components.
- `src/content/` contains posts and Markdown page content, including GSoC pages
  and projects.
- `src/data/` contains JSON data used by pages and components.
- `src/layouts/` contains page and post layout components.
- `src/lib/` contains reusable JavaScript and TypeScript helpers plus unit
  tests.
- `src/pages/` contains Astro routes.
- `src/styles/` contains global CSS.
- `scripts/` contains maintenance scripts such as the link checker.
