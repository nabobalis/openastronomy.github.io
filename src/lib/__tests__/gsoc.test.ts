import { describe, it, expect } from "vitest";
import {
  normalizeArray,
  slugify,
  formatMemberLink,
  joinableRows,
  isProjectFile,
} from "../gsoc.ts";

// ---------------------------------------------------------------------------
// normalizeArray
// ---------------------------------------------------------------------------

describe("normalizeArray", () => {
  it("returns an array value as-is after trimming", () => {
    expect(normalizeArray(["python", "rust"])).toEqual(["python", "rust"]);
  });

  it("wraps a scalar string in an array", () => {
    expect(normalizeArray("python")).toEqual(["python"]);
  });

  it("returns an empty array for null", () => {
    expect(normalizeArray(null)).toEqual([]);
  });

  it("returns an empty array for undefined", () => {
    expect(normalizeArray(undefined)).toEqual([]);
  });

  it("returns an empty array for an empty string", () => {
    expect(normalizeArray("")).toEqual([]);
  });

  it('filters out the placeholder value "none"', () => {
    expect(normalizeArray(["python", "none"])).toEqual(["python"]);
  });

  it('filters out the placeholder value "n/a" (case-insensitive)', () => {
    expect(normalizeArray(["N/A", "rust"])).toEqual(["rust"]);
  });

  it('filters out the placeholder value "null"', () => {
    expect(normalizeArray(["null"])).toEqual([]);
  });

  it("trims whitespace from values", () => {
    expect(normalizeArray(["  python  ", " rust "])).toEqual([
      "python",
      "rust",
    ]);
  });

  it("filters out values that are blank after trimming", () => {
    expect(normalizeArray(["python", "   "])).toEqual(["python"]);
  });

  it("coerces numbers to strings", () => {
    expect(normalizeArray(42)).toEqual(["42"]);
  });
});

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

describe("slugify", () => {
  it("lowercases the input", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("my cool project")).toBe("my-cool-project");
  });

  it("collapses multiple spaces into one hyphen", () => {
    expect(slugify("a  b")).toBe("a-b");
  });

  it("removes leading and trailing hyphens", () => {
    expect(slugify("  leading")).toBe("leading");
    expect(slugify("trailing  ")).toBe("trailing");
  });

  it("replaces special characters with hyphens", () => {
    expect(slugify("C++")).toBe("c");
    expect(slugify("node.js")).toBe("node-js");
  });

  it("preserves digits", () => {
    expect(slugify("Project 2025")).toBe("project-2025");
  });
});

// ---------------------------------------------------------------------------
// formatMemberLink
// ---------------------------------------------------------------------------

const memberLookup = {
  sunpy: { name: "SunPy" },
  astropy: { name: "Astropy" },
};

/** Simple stand-in for fromSiteRoot that just prefixes with the pathname. */
const fakeFromSiteRoot = (pathname: string, target: string) =>
  `${pathname}${target}`;

describe("formatMemberLink", () => {
  it("returns the member name and an href for a known key", () => {
    const result = formatMemberLink(
      "sunpy",
      memberLookup,
      "/gsoc/2025/",
      fakeFromSiteRoot,
    );
    expect(result.label).toBe("SunPy");
    expect(result.href).toContain("members");
  });

  it("encodes the member name in the href anchor", () => {
    const result = formatMemberLink(
      "astropy",
      memberLookup,
      "/",
      fakeFromSiteRoot,
    );
    expect(result.href).toContain(encodeURIComponent("Astropy"));
  });

  it("returns the raw key with a null href for an unknown member", () => {
    const result = formatMemberLink(
      "unknown-org",
      memberLookup,
      "/",
      fakeFromSiteRoot,
    );
    expect(result.label).toBe("unknown-org");
    expect(result.href).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// joinableRows
// ---------------------------------------------------------------------------

describe("joinableRows", () => {
  it("keeps rows that have values", () => {
    const rows = [
      { label: "Tags", values: ["python"] },
      { label: "Empty", values: [] },
    ];
    expect(joinableRows(rows)).toEqual([{ label: "Tags", values: ["python"] }]);
  });

  it("returns an empty array when all rows are empty", () => {
    expect(joinableRows([{ label: "X", values: [] }])).toEqual([]);
  });

  it("returns all rows when all have values", () => {
    const rows = [
      { label: "A", values: ["1"] },
      { label: "B", values: ["2"] },
    ];
    expect(joinableRows(rows)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// isProjectFile
// ---------------------------------------------------------------------------

describe("isProjectFile", () => {
  it("returns true for a valid project file", () => {
    expect(
      isProjectFile(
        "../content/pages/gsoc/2025/sunpy/my-project.md",
        "2025",
      ),
    ).toBe(true);
  });

  it("returns false for index.md files", () => {
    expect(
      isProjectFile("../content/pages/gsoc/2025/sunpy/index.md", "2025"),
    ).toBe(false);
  });

  it("returns false for template files starting with _", () => {
    expect(
      isProjectFile(
        "../content/pages/gsoc/_project_template.md",
        "2025",
      ),
    ).toBe(false);
  });

  it("returns false for files in the wrong year", () => {
    expect(
      isProjectFile(
        "../content/pages/gsoc/2024/sunpy/my-project.md",
        "2025",
      ),
    ).toBe(false);
  });

  it("returns false for files at the season root (no suborg subdir)", () => {
    // gsoc / 2025 / project.md — only 3 parts after gsoc, needs 4
    expect(
      isProjectFile("../content/pages/gsoc/2025/project.md", "2025"),
    ).toBe(false);
  });

  it("returns false when the path contains no gsoc segment", () => {
    expect(isProjectFile("../content/pages/other/file.md", "2025")).toBe(
      false,
    );
  });
});
