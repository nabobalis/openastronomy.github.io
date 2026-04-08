const pad2 = (value) => String(value).padStart(2, "0");

const ensureDate = (value) => {
  if (value instanceof Date) {
    return value;
  }
  return new Date(value);
};

/**
 * Derives the URL slug for a post from its content collection entry.
 *
 * Post filenames follow the convention `YYYY-MM-DD-my-title.md`. The date
 * prefix is stripped so the slug becomes `my-title`. If the filename does not
 * match the date-prefix pattern the full base filename is used as-is.
 *
 * @param {object} entry - Astro content collection entry (posts collection).
 * @returns {string} URL-safe slug string.
 */
export const getPostSlug = (entry) => {
  const id = entry?.id || entry?.slug || "";
  const base = id.replace(/\.md$/, "").split("/").pop();
  const match = base.match(/^(\d{4})-(\d{2})-(\d{2})-(.+)$/);
  const raw = match ? match[4] : base;
  return raw.replace(/\s+/g, "-").replace(/_/g, "-").toLowerCase();
};

/**
 * Extracts UTC year / month / day parts and the resolved Date from a post entry.
 *
 * Multiple frontmatter field names are tried in order (`date`, `pubDate`,
 * `published`, `datetime`) so the helper stays compatible with different
 * authoring conventions without requiring callers to know which field is set.
 *
 * UTC accessors are used intentionally to avoid timezone-dependent shifts when
 * the site is built in different environments.
 *
 * @param {object} entry - Astro content collection entry (posts collection).
 * @returns {{ year: string, month: string, day: string, date: Date }}
 */
export const getPostDateParts = (entry) => {
  const date = ensureDate(
    entry?.data?.date ??
      entry?.data?.pubDate ??
      entry?.data?.published ??
      entry?.data?.datetime,
  );
  return {
    year: String(date.getUTCFullYear()),
    month: pad2(date.getUTCMonth() + 1),
    day: pad2(date.getUTCDate()),
    date,
  };
};

/**
 * Returns the canonical URL path for a post, e.g. `/2024/03/15/my-title/`.
 *
 * @param {object} entry - Astro content collection entry (posts collection).
 * @returns {string} Absolute URL path with leading and trailing slashes.
 */
export const getPostUrl = (entry) => {
  const { year, month, day } = getPostDateParts(entry);
  const slug = getPostSlug(entry);
  return `/${year}/${month}/${day}/${slug}/`;
};

/**
 * Extracts a plain-text excerpt from a post for use in news listing pages.
 *
 * If the post frontmatter contains a `summary` field it is returned as-is.
 * Otherwise the first non-image paragraph of the post body is used, with
 * Markdown syntax (links, inline code, emphasis, headings) stripped out.
 * The result is truncated at the last word boundary before `maxLength`.
 *
 * @param {import('astro:content').CollectionEntry<'posts'>} post
 * @param {number} [maxLength=280] - Maximum character length before truncation.
 * @returns {string}
 */
export const getExcerpt = (post, maxLength = 280) => {
  const customSummary = post?.data?.summary;
  if (typeof customSummary === "string" && customSummary.trim()) {
    return customSummary.trim();
  }

  const paragraphs = String(post.body ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  // Skip image-only paragraphs (e.g. `![alt](url)`) so the excerpt starts
  // with actual prose text.
  const firstParagraph =
    paragraphs.find((paragraph) => !paragraph.startsWith("![")) ??
    paragraphs[0] ??
    "";

  const plainText = firstParagraph
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "") // strip images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // strip links, keep label
    .replace(/`([^`]+)`/g, "$1") // strip inline code ticks
    .replace(/[*_>#]/g, "") // strip emphasis, heading markers
    .replace(/\s+/g, " ")
    .trim();

  if (plainText.length <= maxLength) {
    return plainText;
  }

  // Truncate at a word boundary to avoid cutting mid-word.
  return `${plainText
    .slice(0, maxLength)
    .replace(/\s+\S*$/, "")
    .trim()}...`;
};
