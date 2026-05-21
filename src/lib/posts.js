/** Pads a number to 2 digits with a leading zero (e.g. 7 → "07"). */
const pad2 = (value) => String(value).padStart(2, "0");

/**
 * Derives the URL slug for a post from its content collection entry.
 * Filenames follow `YYYY-MM-DD-my-title.md`; the date prefix is stripped.
 *
 * @param {object} entry - Astro content collection entry (posts collection).
 * @returns {string}
 */
export const getPostSlug = (entry) => {
  const base = (entry?.id ?? "").split("/").pop();
  const match = base.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  return (match ? match[1] : base).replace(/[\s_]+/g, "-").toLowerCase();
};

/**
 * Extracts UTC year / month / day parts and the resolved Date from a post entry.
 *
 * @param {object} entry - Astro content collection entry (posts collection).
 * @returns {{ year: string, month: string, day: string, date: Date }}
 */
export const getPostDateParts = (entry) => {
  const date = new Date(entry.data.date);
  return {
    year: String(date.getUTCFullYear()),
    month: pad2(date.getUTCMonth() + 1),
    day: pad2(date.getUTCDate()),
    date,
  };
};

/**
 * Canonical URL path for a post, e.g. `/2024/03/15/my-title/`.
 *
 * @param {object} entry - Astro content collection entry (posts collection).
 * @returns {string}
 */
export const getPostUrl = (entry) => {
  const { year, month, day } = getPostDateParts(entry);
  return `/${year}/${month}/${day}/${getPostSlug(entry)}/`;
};
