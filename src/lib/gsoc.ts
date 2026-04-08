/**
 * Utility functions for building GSoC project data from Astro content modules.
 *
 * These helpers are extracted from the layout so they can be independently
 * tested. All functions are pure (no side effects, no Astro-runtime imports).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AstroComponentFactory = (...args: unknown[]) => unknown;

export type ProjectModule = {
  frontmatter?: Record<string, unknown>;
  Content: AstroComponentFactory;
};

export type MemberLink = {
  label: string;
  href: string | null;
};

export type DetailRow = {
  label: string;
  values: string[];
};

export type GsocProject = {
  name: string;
  /** Slugified version of `name` used as an HTML anchor ID. */
  anchor: string;
  /** Relative URL to the project's standalone page. */
  href: string;
  desc: string;
  requirements: string[];
  mentors: string[];
  collaborators: MemberLink[];
  issues: string[];
  /** Rows shown on the summary card (mentors + detail rows). */
  cardRows: DetailRow[];
  /** Rows shown in the expanded detail panel (no mentors row). */
  detailRows: DetailRow[];
  Content: AstroComponentFactory;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Coerces an unknown frontmatter value to a clean array of non-empty strings.
 *
 * Handles three cases commonly produced by YAML frontmatter:
 * - An array of values (normal case)
 * - A single scalar value (author wrote a string instead of a list)
 * - A null/undefined/empty value (field was omitted)
 *
 * Placeholder strings like `"none"`, `"n/a"`, `"na"`, and `"null"` are
 * filtered out — contributors sometimes use these in project templates.
 *
 * @param value - Raw frontmatter field value.
 * @returns Array of trimmed, non-empty, non-placeholder strings.
 */
export const normalizeArray = (value: unknown): string[] => {
  const values = Array.isArray(value)
    ? value
    : value !== null && value !== undefined && value !== ""
      ? [value]
      : [];
  return values
    .map((item) => String(item ?? "").trim())
    .filter((item) => {
      const normalized = item.toLowerCase();
      if (!normalized) return false;
      return !["none", "n/a", "na", "null"].includes(normalized);
    });
};

/**
 * Converts a string to a lowercase kebab-case slug suitable for use as an
 * HTML `id` attribute or URL path segment.
 *
 * @param value - Input string.
 * @returns Slugified string (e.g. `"My Cool Project"` → `"my-cool-project"`).
 */
export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/**
 * Resolves a `collaborating_projects` key from a project's frontmatter to a
 * display label and optional href pointing to the member's entry on `/members/`.
 *
 * If the key is found in `memberLookup` the member's full name is used as the
 * label and a relative URL to the members page anchor is returned.
 * If the key is unknown the raw key string is shown without a link.
 *
 * @param key - The member key as written in the project's frontmatter.
 * @param memberLookup - The full `members.json` object keyed by member slug.
 * @param pagePath - The current page's URL pathname (used to generate relative URLs).
 * @param fromSiteRoot - Helper that converts an absolute path to a relative one.
 * @returns `{ label, href }` where `href` may be `null` for unknown members.
 */
export const formatMemberLink = (
  key: string,
  memberLookup: Record<string, { name?: string }>,
  pagePath: string,
  fromSiteRoot: (pathname: string, targetPath: string) => string,
): MemberLink => {
  const member = memberLookup[key];
  if (member?.name) {
    return {
      label: member.name,
      href: fromSiteRoot(
        pagePath,
        `/members/#${encodeURIComponent(member.name)}`,
      ),
    };
  }
  return { label: key, href: null };
};

/**
 * Filters a list of detail rows to only those with at least one value.
 * Used to avoid rendering empty `<div>` sections in the project card/detail.
 *
 * @param rows - Array of label + values pairs.
 * @returns Subset of `rows` where `values` is non-empty.
 */
export const joinableRows = (rows: DetailRow[]): DetailRow[] =>
  rows.filter((row) => row.values.length > 0);

/**
 * Returns true if a file path points to a GSoC project idea file for the
 * given season year.
 *
 * Project files live at `gsoc/<year>/<suborg>/<project>.md`. Files that should
 * NOT be treated as projects are:
 * - `index.md` (season landing page)
 * - Files starting with `_` (e.g. `_project_template.md`)
 * - Files at the season root (not inside a suborg subdirectory)
 *
 * @param normalizedPath - Forward-slash file path string.
 * @param seasonKey - Four-digit year string (e.g. `"2025"`).
 * @returns True if the path is a project file for the given season.
 */
export const isProjectFile = (
  normalizedPath: string,
  seasonKey: string,
): boolean => {
  const parts = normalizedPath.split("/");
  const gsocIndex = parts.lastIndexOf("gsoc");
  if (gsocIndex === -1) return false;
  const year = parts[gsocIndex + 1];
  if (year !== seasonKey) return false;
  // Must have at least: gsoc / year / suborg / file.md
  if (parts.length < gsocIndex + 4) return false;
  const filename = parts[parts.length - 1] ?? "";
  if (filename.startsWith("_") || filename === "index.md") return false;
  return true;
};

/**
 * Builds a structured {@link GsocProject} object from a raw Vite module path
 * and its eagerly-loaded module.
 *
 * This is the main transformation step that converts raw frontmatter (which may
 * be missing, malformed, or use placeholder values) into a clean, typed object
 * ready for rendering.
 *
 * @param modulePath - Vite module path string for the project file.
 * @param mod - Eagerly-loaded module containing `frontmatter` and `Content`.
 * @param seasonKey - Four-digit year string (e.g. `"2025"`).
 * @param memberLookup - Full `members.json` object keyed by member slug.
 * @param pagePath - Current page pathname (used for relative URL generation).
 * @param fromSiteRoot - Relative-URL helper.
 * @returns A fully populated `GsocProject`.
 */
export const buildProject = (
  modulePath: string,
  mod: ProjectModule,
  seasonKey: string,
  memberLookup: Record<string, { name?: string }>,
  pagePath: string,
  fromSiteRoot: (pathname: string, targetPath: string) => string,
): GsocProject => {
  const data = mod.frontmatter ?? {};
  const normalizedPath = modulePath.replace(/\\/g, "/");
  const parts = normalizedPath.split("/");
  const gsocIndex = parts.lastIndexOf("gsoc");
  const year = parts[gsocIndex + 1] ?? seasonKey;
  const suborg = parts[gsocIndex + 2] ?? "";
  const fileSlug = (parts[parts.length - 1] ?? "").replace(/\.md$/, "");

  const name =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : fileSlug; // fall back to filename if `name` is missing

  const projectPath = `/gsoc/${year}/${suborg}/${fileSlug}/`;
  const desc = typeof data.desc === "string" ? data.desc : "";
  const requirements = normalizeArray(data.requirements);
  const mentors = normalizeArray(data.mentors);
  const initiatives = normalizeArray(data.initiatives);
  const projectSize = normalizeArray(data.project_size);
  const tags = normalizeArray(data.tags);
  const collaborators = normalizeArray(data.collaborating_projects).map((key) =>
    formatMemberLink(key, memberLookup, pagePath, fromSiteRoot),
  );
  const issues = normalizeArray(data.issues);

  const detailRows = joinableRows([
    { label: "Initiatives", values: initiatives },
    { label: "Project size", values: projectSize },
    { label: "Tags", values: tags },
  ]);

  const cardRows = joinableRows([
    { label: "Mentors", values: mentors },
    ...detailRows,
  ]);

  return {
    name,
    anchor: slugify(name),
    href: fromSiteRoot(pagePath, projectPath),
    desc,
    requirements,
    mentors,
    collaborators,
    issues,
    cardRows,
    detailRows,
    Content: mod.Content,
  };
};
