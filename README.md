# openastronomy.github.io

This is the source code for the openastronomy.org website.

## Building

Requirements:

- [Node.js](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)

Install dependencies

```shell
npm install
```

Build the website and output to a `html` folder

```shell
npm run build
```

Run the dev server

```shell
npm run dev
```

Preview the production build

```shell
npm run preview
```

### Tests

Run the unit test suite (Vitest):

```shell
npm test
```

Watch mode (re-runs on file changes):

```shell
npm run test:watch
```

### Formatting and linting

Format the codebase

```shell
npm run format
```

Run ESLint

```shell
npm run lint
```

Auto-fix ESLint issues (where supported)

```shell
npm run lint:fix
```

Auto-fix Markdown formatting issues (where supported)

```shell
npm run lint:md:fix
```

Run Astro's type/content checks

```shell
npm run astro:check
```

### CI

- GitHub Actions (`.github/workflows/ci.yml`) runs formatting, linting, Markdown lint, type checks, unit tests, build, and link checks as parallel jobs.
- CircleCI (`.circleci/config.yml`) is kept for website build artifacts (`html/`) preview.

### Link checks

We can check both internal links + anchors and external links using a script.

However, this first requires the website to be built

```shell
npm run build
```

Then for internal links

```shell
npm run linkcheck:internal
```

Then for external links

```shell
npm run linkcheck:external
```

If there are sites you need to skip, you can add regex patterns (one per line) in `linkcheck.skip.txt`

There are also three environment variables:

- `LINKCHECK_ROOT=...` to point at a different build folder
- `LINKCHECK_TIMEOUT=...` in ms for external checks
- `LINKCHECK_CONCURRENCY=...` number of parallel workers for external checks (default: 20)

### Structure

- `public/` contains static assets (CSS, images, CNAME, etc)
- `src/content/` contains posts and Markdown page content (`pages/`), including GSoC pages and projects
- `src/pages/` contains route handlers/components (Astro files)
