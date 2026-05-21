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
