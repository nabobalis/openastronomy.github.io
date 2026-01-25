const pad2 = (value) => String(value).padStart(2, "0");

const ensureDate = (value) => {
  if (value instanceof Date) {
    return value;
  }
  return new Date(value);
};

export const getPostSlug = (entry) => {
  const id = entry?.id || entry?.slug || "";
  const base = id.replace(/\.md$/, "").split("/").pop();
  const match = base.match(/^(\d{4})-(\d{2})-(\d{2})-(.+)$/);
  const raw = match ? match[4] : base;
  return raw.replace(/\s+/g, "-").replace(/_/g, "-").toLowerCase();
};

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

export const getPostUrl = (entry) => {
  const { year, month, day } = getPostDateParts(entry);
  const slug = getPostSlug(entry);
  return `/${year}/${month}/${day}/${slug}/`;
};
