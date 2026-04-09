# Contributing to openastronomy.github.io

This document captures the conventions used in this codebase. When adding or reviewing code, use these rules as the benchmark.

---

## Code style

### Naming

| Context                                       | Convention                                                  | Example                                 |
| --------------------------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| JavaScript/TypeScript variables and functions | camelCase                                                   | `getPostSlug`, `seasonKey`              |
| TypeScript types and interfaces               | PascalCase                                                  | `ProjectData`, `MemberLink`             |
| Astro component files                         | PascalCase                                                  | `MemberCard.astro`, `ProjectCard.astro` |
| CSS class names                               | kebab-case                                                  | `project-card`, `member-logo`           |
| Constants that are never reassigned           | UPPER_SNAKE_CASE only when a regex or truly global constant | `PROTOCOL_RE`                           |

### Function length

- Aim for **≤ 40 lines** per function.
- If a function grows beyond that, look for a named helper to extract.
- Long functions in `scripts/` are acceptable when they represent a single sequential workflow (e.g., the link-check crawl loop).

---

## Documentation

### `src/lib/` (`.ts` and `.js` files)

Every **exported** symbol must have a JSDoc block:

```js
/**
 * Strips the YYYY-MM-DD date prefix from a content collection entry ID.
 *
 * @param {import("astro:content").CollectionEntry<"posts">} entry
 * @returns {string} The slug without the date prefix, e.g. "my-post-title"
 */
export function getPostSlug(entry) { … }
```

Internal helpers (not exported) should have at least a brief inline comment if their purpose is not immediately obvious from the name.

### `src/components/` and `src/layouts/` (`.astro` files)

Add a block comment at the top of the frontmatter section explaining:

1. What the component renders
2. Any non-obvious prop relationships or assumptions

```astro
---
/*
 * ProjectCard - renders a single GSoC project summary button.
 * Clicking opens the matching ProjectDetail panel via the shared detailId.
 * Must be paired with a <ProjectDetail id={detailId} … /> in the same page.
 */
---
```

Short, self-evident page components (e.g. a page with only a title and a list) are exempt if the frontmatter is trivially readable.

### `scripts/` (`.mjs` files)

Every top-level function must have a JSDoc block. The module itself should have a `@fileoverview` comment at the top.

### Tests (`src/lib/__tests__/`)

No JSDoc is required in test files — test descriptions serve as documentation.

Add a brief inline comment when test setup is non-obvious (e.g. a mock helper or a tricky fixture).

---

## TypeScript vs JavaScript

- New files in `src/lib/` should be **TypeScript** (`.ts`).
- Existing `.js` files in `src/lib/` stay as-is unless being rewritten from scratch.
- Astro component frontmatter uses TypeScript types inline where needed; avoid importing from Astro runtime packages inside `src/lib/` files (keeps them unit-testable without Astro's runtime).

---

## Tests

- Use **Vitest** (`npm test`).
- Test files live in `src/lib/__tests__/` and mirror the lib filename (e.g. `gsoc.ts` → `gsoc.test.ts`).
- One `describe` block per exported function.
- Each `describe` should cover:
  - The happy path
  - At least one edge case or boundary value
  - Null / undefined inputs where the function accepts optional parameters
- Astro components are not unit-tested; test the logic extracted into `src/lib/` instead.

---

## Astro components

- Keep frontmatter focused on **data fetching and transformation**. Move reusable logic into `src/lib/`.
- All internal links must use `fromSiteRoot(Astro.url.pathname, "/target/")` from `src/lib/relative-paths.js`. Hardcoded absolute paths (`/foo/`) break on preview deployments.
- Format with Prettier and lint with ESLint before committing. Run locally before pushing:

  ```sh
  npm run format
  npm run lint:fix
  npm run lint:md:fix
  ```

---

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request. Jobs run in parallel where possible:

| Job              | What it checks                                               |
| ---------------- | ------------------------------------------------------------ |
| `format`         | Prettier format                                              |
| `lint`           | ESLint (warnings treated as errors) + Markdownlint           |
| `typecheck`      | Astro type/content checks (`astro:check`)                    |
| `test`           | Unit tests (`npm test`)                                      |
| `build`          | Production build; output uploaded as a shared artifact       |
| `linkcheck` (×2) | Internal and external links, using the shared build artifact |

All jobs must pass before merging. The `linkcheck` jobs wait for `build` and all quality jobs.

---

## Syncing content from upstream

This fork rewrote the site from Jekyll (the upstream) to Astro. The two branches have permanently diverged — **never run `git merge upstream/main`**, it would restore all the old Jekyll files.

When upstream adds or updates GSoC project files, port them manually:

```bash
# Fetch the latest upstream changes
git fetch upstream

# See which _projects/ files changed in upstream since the last sync
git log upstream/main ^main --oneline --name-status | grep "_projects"
```

For each new or updated `_projects/<year>/<suborg>/<file>.md` in upstream:

1. Find the corresponding Astro file at `src/content/pages/gsoc/<year>/<suborg>/<file>.md`
2. Apply the content changes (keep the Astro YAML indentation style)
3. If the file is brand new, create it — the frontmatter schema is defined in `src/content/config.ts` and the template is at `src/content/pages/gsoc/_project_template.md`

Other upstream changes (e.g. to `gsoc/display/resources/js/app.js`, `_layouts/`, `_sass/`) belong to the old Jekyll site and can be safely ignored.

---

## Updating dependencies

This is a static site — npm packages only affect developers and CI, not end users. **Update once per GSoC cycle** (roughly every February before the season begins) rather than continuously.

GitHub Actions versions are kept up to date automatically via Dependabot (monthly). npm packages are updated manually:

```bash
# See what has newer versions available
npx npm-check-updates

# Bump all versions in package.json (still respects semver)
npx npm-check-updates -u

# Install the new versions and update the lock file
npm install

# Verify nothing broke
npm run build && npm test
```

Commit both `package.json` and `package-lock.json` together. If `npm run build` or `npm test` fails after the update, check the changelog for the offending package and either fix the issue or pin that package back to the previous version.

**Security alerts**: if GitHub raises a Dependabot security alert for a specific npm package, fix that immediately regardless of the regular update schedule.
