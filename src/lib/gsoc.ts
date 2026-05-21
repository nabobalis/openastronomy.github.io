/**
 * Pure helpers for turning GSoC project frontmatter into render-ready data.
 *
 * No Astro-runtime imports here so the helpers stay unit-testable.
 */

import { slugify } from "./relative-paths.js";

export type AstroComponentFactory = (...args: unknown[]) => unknown;

export type MemberLink = {
  label: string;
  href: string | null;
};

/** Metadata used by both the dialog inside ProjectsLayout and the standalone page. */
export type ProjectMeta = {
  name: string;
  anchor: string;
  href: string;
  desc: string;
  requirements: string[];
  mentors: string[];
  initiatives: string[];
  projectSize: string[];
  tags: string[];
  collaborators: MemberLink[];
  issues: string[];
};

/** ProjectMeta plus the rendered markdown Content component. */
export type GsocProject = ProjectMeta & { Content: AstroComponentFactory };

/**
 * Coerces a raw frontmatter value to a clean array of non-empty strings.
 * Strips placeholders like "none", "n/a", "null".
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
 * Resolves a `collaborating_projects` key to a display label + optional
 * relative href into `/members/#<slug>`. Returns `{ label: key, href: null }`
 * when the key is unknown.
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
      href: fromSiteRoot(pagePath, `/members/#${slugify(member.name)}`),
    };
  }
  return { label: key, href: null };
};

/**
 * Returns `{ year, suborg, fileSlug }` when an entry id looks like
 * `gsoc/<YYYY>/<suborg>/<file>`, otherwise `null`. Used by both the season
 * layout filter and the standalone `[...slug]` project case.
 */
export const parseProjectId = (
  id: string,
): { year: string; suborg: string; fileSlug: string } | null => {
  const match = id.match(/^gsoc\/(\d{4})\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { year: match[1], suborg: match[2], fileSlug: match[3] };
};

/**
 * Build the rendered metadata for one project from its parsed frontmatter.
 */
export const buildProjectMeta = (
  data: Record<string, unknown>,
  pathInfo: { year: string; suborg: string; fileSlug: string },
  memberLookup: Record<string, { name?: string }>,
  pagePath: string,
  fromSiteRoot: (pathname: string, targetPath: string) => string,
): ProjectMeta => {
  const name =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : pathInfo.fileSlug;
  return {
    name,
    anchor: slugify(name),
    href: fromSiteRoot(
      pagePath,
      `/gsoc/${pathInfo.year}/${pathInfo.suborg}/${pathInfo.fileSlug}/`,
    ),
    desc: typeof data.desc === "string" ? data.desc : "",
    requirements: normalizeArray(data.requirements),
    mentors: normalizeArray(data.mentors),
    initiatives: normalizeArray(data.initiatives),
    projectSize: normalizeArray(data.project_size),
    tags: normalizeArray(data.tags),
    collaborators: normalizeArray(data.collaborating_projects).map((key) =>
      formatMemberLink(key, memberLookup, pagePath, fromSiteRoot),
    ),
    issues: normalizeArray(data.issues),
  };
};
