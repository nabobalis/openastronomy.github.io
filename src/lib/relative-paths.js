/**
 * Utilities for generating relative URLs in the OpenAstronomy site.
 *
 * Astro is configured with `trailingSlash: "always"` and the site can be
 * previewed at a non-root path (e.g. CircleCI build previews). Hardcoding
 * absolute paths like `/members/` breaks those environments. These helpers
 * convert site-root-relative paths to relative paths based on the current
 * page's depth in the URL hierarchy.
 */

/** Matches any URI scheme such as `https:`, `mailto:`, `data:`, etc. */
const PROTOCOL_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

/**
 * Returns the relative prefix needed to reach the site root from a given page.
 *
 * Examples:
 *   `/`           → `./`
 *   `/members/`   → `../`
 *   `/gsoc/2025/` → `../../`
 *
 * @param {string} [pathname="/"] - The current page's URL pathname.
 * @returns {string} A relative path prefix ending with `/`.
 */
export const getRelativeRoot = (pathname = "/") => {
  // Strip query string and hash before counting path segments.
  const cleanPath = String(pathname).split("?")[0].split("#")[0];
  const depth = cleanPath.split("/").filter(Boolean).length;
  return depth === 0 ? "./" : "../".repeat(depth);
};

/**
 * Converts an absolute site-root path to a path relative to the current page.
 *
 * @param {string} pathname - The current page's URL pathname.
 * @param {string} targetPath - Absolute path from the site root (leading `/` optional).
 * @returns {string} A relative URL string.
 */
export const fromSiteRoot = (pathname, targetPath) => {
  const relativeRoot = getRelativeRoot(pathname);
  const normalizedTarget = String(targetPath ?? "").replace(/^\/+/, "");
  return normalizedTarget ? `${relativeRoot}${normalizedTarget}` : relativeRoot;
};

/**
 * Resolves an href value for use in the current page context.
 *
 * - External URLs (with a scheme or `//` prefix) and fragment-only links (`#…`)
 *   are returned unchanged.
 * - Absolute-path links (starting with `/`) are converted to relative paths via
 *   {@link fromSiteRoot} so they work regardless of deployment base path.
 * - Relative hrefs are returned as-is.
 *
 * @param {string} pathname - The current page's URL pathname.
 * @param {string} href - The raw href value to resolve.
 * @returns {string} The resolved href.
 */
export const localizeHref = (pathname, href) => {
  const value = String(href ?? "");
  if (!value) return value;
  if (value.startsWith("#")) return value;
  if (value.startsWith("//") || PROTOCOL_RE.test(value)) return value;
  if (value.startsWith("/")) return fromSiteRoot(pathname, value);
  return value;
};

/**
 * Lowercase kebab-case slug for use as HTML id or URL path segment.
 *
 * @param {string} value
 * @returns {string}
 */
export const slugify = (value) =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
