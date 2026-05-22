import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractLinksAndAnchors,
  fetchOk,
  parseMode,
  parsePositiveInteger,
  resolveInternal,
  runExternalCheck,
  runInternalCheck,
} from "../linkcheck.mjs";

let tempDirs = [];

const makeRoot = () => {
  const root = mkdtempSync(path.join(tmpdir(), "oa-linkcheck-"));
  tempDirs.push(root);
  return root;
};

const writeHtml = (root, relativePath, html) => {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, html);
  return file;
};

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

describe("parseMode", () => {
  it("accepts known modes", () => {
    expect(parseMode("internal")).toBe("internal");
    expect(parseMode("external")).toBe("external");
  });

  it("rejects unknown modes", () => {
    expect(() => parseMode("all")).toThrow("Unknown linkcheck mode");
  });
});

describe("parsePositiveInteger", () => {
  it("uses the fallback when unset", () => {
    expect(parsePositiveInteger(undefined, 20, "TEST")).toBe(20);
  });

  it("rejects non-positive values", () => {
    expect(() => parsePositiveInteger("0", 20, "TEST")).toThrow(
      "positive integer",
    );
  });
});

describe("extractLinksAndAnchors", () => {
  it("finds href, src, srcset, id, and name values", () => {
    const html = `
      <a href="./page/">Page</a>
      <img src="./image.png" srcset="./small.png 1x, ./large.png 2x">
      <h2 id="target">Target</h2>
      <a name="legacy"></a>
    `;
    const result = extractLinksAndAnchors(html);
    expect(result.links).toEqual([
      "./page/",
      "./image.png",
      "./small.png",
      "./large.png",
    ]);
    expect([...result.anchors]).toEqual(["target", "legacy"]);
  });
});

describe("resolveInternal", () => {
  it("resolves relative directory links to index.html", () => {
    const root = makeRoot();
    const current = writeHtml(root, "a/index.html", "");
    const target = resolveInternal("../b/#target", current, root);

    expect(target.file).toBe(path.join(root, "b", "index.html"));
    expect(target.anchor).toBe("target");
    expect(target.urlPath).toBe("/b/");
  });
});

describe("runInternalCheck", () => {
  it("passes existing internal links and anchors", () => {
    const root = makeRoot();
    writeHtml(root, "index.html", '<a href="./page/#target">Page</a>');
    writeHtml(root, "page/index.html", '<h2 id="target">Target</h2>');

    expect(runInternalCheck({ rootPath: root, rootLabel: "html" })).toEqual({
      failures: [],
      scanned: 1,
    });
  });

  it("reports missing anchors", () => {
    const root = makeRoot();
    writeHtml(root, "index.html", '<a href="./page/#missing">Page</a>');
    writeHtml(root, "page/index.html", '<h2 id="target">Target</h2>');

    const result = runInternalCheck({ rootPath: root, rootLabel: "html" });
    expect(result.failures).toEqual([
      {
        source: "html/",
        target: "html/page/#missing",
        kind: "anchor",
      },
    ]);
  });
});

describe("fetchOk", () => {
  it("falls back to GET when HEAD is not allowed", async () => {
    const calls = [];
    const fetchImpl = async (_url, options) => {
      calls.push(options.method);
      return { status: options.method === "HEAD" ? 405 : 200 };
    };

    await expect(fetchOk("https://example.com", 1000, fetchImpl)).resolves.toBe(
      true,
    );
    expect(calls).toEqual(["HEAD", "GET"]);
  });
});

describe("runExternalCheck", () => {
  it("checks each unique external link once", async () => {
    const root = makeRoot();
    writeHtml(
      root,
      "index.html",
      '<a href="https://ok.example">OK</a><a href="https://bad.example">Bad</a>',
    );
    writeHtml(root, "page/index.html", '<a href="https://bad.example">Bad</a>');
    const seen = [];
    const fetchImpl = async (url) => {
      seen.push(url);
      return { status: url.includes("bad") ? 500 : 200 };
    };

    const result = await runExternalCheck({
      rootPath: root,
      rootLabel: "html",
      concurrency: 1,
      timeoutMs: 1000,
      fetchImpl,
    });

    expect(seen).toEqual(["https://ok.example", "https://bad.example"]);
    expect(result.scanned).toBe(2);
    expect(result.failures).toEqual([
      {
        source: "html/",
        target: "https://bad.example",
        kind: "external",
      },
      {
        source: "html/page/",
        target: "https://bad.example",
        kind: "external",
      },
    ]);
  });
});
