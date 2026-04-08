# Copilot Instructions

## Build, Lint, and Check Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server
npm run build        # Build to html/ output directory
npm run preview      # Preview the production build

npm run format       # Format with Prettier (run before committing)
npm run format:check # Check formatting without writing
npm run lint         # ESLint (src/**/*.{astro,js,ts} and scripts/)
npm run lint:fix     # ESLint with auto-fix
npm run lint:md      # Markdownlint for all .md files
npm run lint:md:fix  # Markdownlint with auto-fix
npm run astro:check  # TypeScript/Astro type checking

# Run all checks (lint + astro:check):
npm run check

# Link checks (requires a build first):
npm run build && npm run linkcheck:internal
npm run build && npm run linkcheck:external
```

**Important:** CI runs `format`, `lint:fix`, and `lint:md:fix` automatically, then **fails if those produce uncommitted changes**. Always run `npm run format && npm run lint:fix && npm run lint:md:fix` and commit the result before pushing.

There is no test suite — `npm run astro:check` is the primary type/content validation step.

## Architecture

This is an [Astro](https://astro.build) static site for [openastronomy.org](https://openastronomy.org). The build output goes to `html/` (not `dist/`).

### Routing

- **`src/pages/[...slug].astro`** — catch-all route that maps `src/content/pages/**/*.md` files to URL paths. It selects a layout based on the slug pattern:
  - `/gsoc/YYYY` → `ProjectsLayout` (aggregates GSoC project files for that season)
  - `/gsoc` → `PageLayout`
  - everything else → `BaseLayout`
- **`src/pages/[year]/[month]/[day]/[slug].astro`** — routes for blog posts from `src/content/posts/`
- **`src/pages/index.astro`, `members.astro`, `news.astro`** — standalone pages

### Content Collections

Defined in `src/content/config.ts`:

- **`posts`** — blog posts in `src/content/posts/`, filenames must follow `YYYY-MM-DD-slug.md`. Required frontmatter: `title`, `date`.
- **`pages`** — general pages in `src/content/pages/`, including all GSoC content. The schema uses `.passthrough()` so arbitrary frontmatter is allowed.

### GSoC Project Pages

GSoC project ideas live at `src/content/pages/gsoc/YYYY/<suborg>/<project>.md`. The `ProjectsLayout` layout globs all files under `gsoc/` and aggregates them by season. Use `src/content/pages/gsoc/_project_template.md` as the reference for required frontmatter fields:

```yaml
name: Project title
desc: One-line description
requirements:
  - Skill or knowledge requirement
difficulty: low | medium | high
issues:
  - https://github.com/org/repo/issues/NNN
mentors:
  - github-handle
initiatives:
  - GSOC
project_size:
  - 90 h (Small) | 175 h (Medium) | 350 h (Large)
tags:
  - python
collaborating_projects:
  - member-key # must match a key in src/data/members.json
```

### Data Files

JSON files in `src/data/` are imported directly by layouts and pages:

- **`members.json`** — keyed by member slug; used in `/members/` and to resolve `collaborating_projects` in GSoC pages
- **`gsoc-admins.json`** — GSoC admin GitHub handles by year
- **`site.json`** — global site metadata (title, nav links, etc.)
- **`icons.json`** — icon definitions

### URL Helpers

`src/lib/relative-paths.js` provides helpers for generating relative URLs. The site is built with `trailingSlash: "always"`, so all internal links should end with `/`. Use `fromSiteRoot(pathname, "/some/path/")` when constructing absolute-root-relative paths in layouts/components instead of hardcoding `/`.

## Key Conventions

- **Absolute paths in components**: Use `fromSiteRoot(Astro.url.pathname, "/target/")` from `src/lib/relative-paths.js`. Hardcoded absolute paths like `/foo/` will break on preview/staging deployments.
- **Blog post filenames**: Must be `YYYY-MM-DD-title-slug.md`. The `getPostSlug` and `getPostUrl` helpers in `src/lib/posts.js` parse the date from the filename.
- **New member**: Add an entry to `src/data/members.json` keyed by a lowercase slug. The logo image goes in `public/` (referenced by filename in the JSON).
- **Prettier + ESLint + markdownlint** all run in CI; run them locally before committing to avoid CI failures on trivial formatting issues.
- **No TypeScript in `.astro` frontmatter beyond what Astro supports** — use `.ts` files in `src/lib/` for shared logic.
