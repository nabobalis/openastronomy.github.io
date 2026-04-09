import { describe, it, expect } from "vitest";
import {
  getPostSlug,
  getPostDateParts,
  getPostUrl,
  getExcerpt,
} from "../posts.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal fake post entry for testing. */
const makeEntry = (id, data = {}) => ({ id, data });

/** Creates a fake entry that also has a `body` (for getExcerpt). */
const makePostEntry = (id, data = {}, body = "") => ({ id, data, body });

// ---------------------------------------------------------------------------
// getPostSlug
// ---------------------------------------------------------------------------

describe("getPostSlug", () => {
  it("strips the YYYY-MM-DD prefix from a dated filename", () => {
    expect(getPostSlug(makeEntry("2024-03-15-my-post.md"))).toBe("my-post");
  });

  it("handles multi-word slugs separated by hyphens", () => {
    expect(getPostSlug(makeEntry("2024-03-15-hello-world-post.md"))).toBe(
      "hello-world-post",
    );
  });

  it("returns the base filename unchanged when there is no date prefix", () => {
    expect(getPostSlug(makeEntry("about-us.md"))).toBe("about-us");
  });

  it("normalises underscores to hyphens", () => {
    expect(getPostSlug(makeEntry("2024-01-01-some_post.md"))).toBe("some-post");
  });

  it("lowercases the result", () => {
    expect(getPostSlug(makeEntry("2024-01-01-MyPost.md"))).toBe("mypost");
  });

  it("uses the last path segment when id contains directories", () => {
    expect(getPostSlug(makeEntry("posts/2024-03-15-deep-post.md"))).toBe(
      "deep-post",
    );
  });

  it("falls back to entry.slug when id is absent", () => {
    expect(getPostSlug({ slug: "2024-03-15-slug-post.md", data: {} })).toBe(
      "slug-post",
    );
  });
});

// ---------------------------------------------------------------------------
// getPostDateParts
// ---------------------------------------------------------------------------

describe("getPostDateParts", () => {
  it("returns correct UTC year/month/day from a Date object", () => {
    const entry = makeEntry("foo.md", {
      date: new Date("2024-03-05T00:00:00Z"),
    });
    const { year, month, day } = getPostDateParts(entry);
    expect(year).toBe("2024");
    expect(month).toBe("03");
    expect(day).toBe("05");
  });

  it("pads single-digit months and days with leading zeros", () => {
    const entry = makeEntry("foo.md", {
      date: new Date("2024-01-07T00:00:00Z"),
    });
    const { month, day } = getPostDateParts(entry);
    expect(month).toBe("01");
    expect(day).toBe("07");
  });

  it("also accepts a date string in the data field", () => {
    const entry = makeEntry("foo.md", { date: "2023-11-20" });
    const { year, month, day } = getPostDateParts(entry);
    expect(year).toBe("2023");
    expect(month).toBe("11");
    expect(day).toBe("20");
  });

  it("falls back to pubDate when date is absent", () => {
    const entry = makeEntry("foo.md", {
      pubDate: new Date("2022-06-15T00:00:00Z"),
    });
    const { year } = getPostDateParts(entry);
    expect(year).toBe("2022");
  });

  it("returns the resolved Date object", () => {
    const d = new Date("2024-03-15T00:00:00Z");
    const entry = makeEntry("foo.md", { date: d });
    expect(getPostDateParts(entry).date).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// getPostUrl
// ---------------------------------------------------------------------------

describe("getPostUrl", () => {
  it("builds a /year/month/day/slug/ URL", () => {
    const entry = makeEntry("2024-03-15-my-post.md", {
      date: new Date("2024-03-15T00:00:00Z"),
    });
    expect(getPostUrl(entry)).toBe("/2024/03/15/my-post/");
  });

  it("includes leading and trailing slashes", () => {
    const url = getPostUrl(
      makeEntry("2020-01-01-test.md", {
        date: new Date("2020-01-01T00:00:00Z"),
      }),
    );
    expect(url).toMatch(/^\//);
    expect(url).toMatch(/\/$/);
  });
});

// ---------------------------------------------------------------------------
// getExcerpt
// ---------------------------------------------------------------------------

describe("getExcerpt", () => {
  it("returns the frontmatter summary when present", () => {
    const post = makePostEntry("p.md", { summary: "Custom summary." }, "Body");
    expect(getExcerpt(post)).toBe("Custom summary.");
  });

  it("strips Markdown links, keeping the link label", () => {
    const post = makePostEntry(
      "p.md",
      {},
      "Read [the docs](https://example.com) for more.",
    );
    expect(getExcerpt(post)).toBe("Read the docs for more.");
  });

  it("strips inline code backticks", () => {
    const post = makePostEntry("p.md", {}, "Use `npm install` to set up.");
    expect(getExcerpt(post)).toBe("Use npm install to set up.");
  });

  it("strips Markdown images", () => {
    const post = makePostEntry(
      "p.md",
      {},
      "![Alt text](image.png)\n\nThe real paragraph.",
    );
    // Image-only first paragraph is skipped; second paragraph used
    expect(getExcerpt(post)).toBe("The real paragraph.");
  });

  it("truncates at a word boundary when text exceeds maxLength", () => {
    // Each "word" is 4 chars + 1 space = 5 chars.
    // With maxLength=12, slice(0,12) = "word word wo" — "wo" is partial.
    // The implementation must strip the partial word, leaving "word word".
    const text = "word word word word word";
    const result = getExcerpt(makePostEntry("p.md", {}, text), 12);
    expect(result).toBe("word word...");
  });

  it("returns the full text when it is shorter than maxLength", () => {
    const post = makePostEntry("p.md", {}, "Short text.");
    expect(getExcerpt(post, 280)).toBe("Short text.");
  });

  it("strips heading markers", () => {
    const post = makePostEntry("p.md", {}, "## Section heading");
    expect(getExcerpt(post)).toBe("Section heading");
  });
});
