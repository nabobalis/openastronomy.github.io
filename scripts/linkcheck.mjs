import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Link checker for the OpenAstronomy static site build.
 *
 * Usage (after running `npm run build`):
 *   node scripts/linkcheck.mjs internal   # check internal links + anchors
 *   node scripts/linkcheck.mjs external   # check external HTTP(S) URLs
 *
 * Environment variables:
 *   LINKCHECK_ROOT        Path to the build output directory (default: "html")
 *   LINKCHECK_SKIP_FILE   Path to the skip-patterns file (default: "linkcheck.skip.txt")
 *   LINKCHECK_TIMEOUT     Timeout in ms for external requests (default: 10000)
 */

const mode = process.argv[2] ?? "internal";
const skipFile = process.env.LINKCHECK_SKIP_FILE ?? "linkcheck.skip.txt";
const root = process.env.LINKCHECK_ROOT ?? "html";

if (!existsSync(root)) {
  console.error(
    `Build output "${root}" not found. Run "npm run build" first or set LINKCHECK_ROOT.`,
  );
  process.exit(1);
}

const skipLines = existsSync(skipFile)
  ? readFileSync(skipFile, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
  : [];

const skipPatterns = skipLines
  .map((line) => {
    try {
      return new RegExp(line);
    } catch {
      console.warn(`Invalid skip pattern ignored: ${line}`);
      return null;
    }
  })
  .filter(Boolean);

const rootPath = path.resolve(root);
const rootLabel = root.replace(/\\/g, "/");
const startTime = Date.now();

/**
 * Recursively collects all `.html` files under `dir`.
 *
 * @param {string} dir - Directory to search.
 * @param {string[]} [collected=[]] - Accumulator for file paths (used in recursion).
 * @returns {string[]} Absolute paths to all HTML files found.
 */
const collectHtmlFiles = (dir, collected = []) => {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectHtmlFiles(fullPath, collected);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
      collected.push(fullPath);
    }
  }
  return collected;
};

/**
 * Extracts all link targets from an HTML string.
 *
 * Collects values from `href` and `src` attributes, plus individual URLs from
 * `srcset` descriptors (which may contain multiple comma-separated entries with
 * optional width/density suffixes).
 *
 * @param {string} html - Raw HTML content.
 * @returns {string[]} Array of raw link strings (may include duplicates).
 */
const extractLinks = (html) => {
  const links = [];
  // Match href="..." and src="..." attributes
  const attrRegex = /\s(?:href|src)=['"]([^'"]+)['"]/gi;
  let match;
  while ((match = attrRegex.exec(html)) !== null) {
    if (match[1]) {
      links.push(match[1].trim());
    }
  }
  // srcset values are comma-separated: `url1 1x, url2 2x` — extract the URL part only
  const srcsetRegex = /\ssrcset=['"]([^'"]+)['"]/gi;
  while ((match = srcsetRegex.exec(html)) !== null) {
    const raw = match[1] ?? "";
    raw.split(",").forEach((part) => {
      const url = part.trim().split(/\s+/)[0];
      if (url) {
        links.push(url);
      }
    });
  }
  return links;
};

/**
 * Extracts all anchor IDs from an HTML string.
 *
 * Collects both `id="..."` and `name="..."` attribute values, since both can
 * serve as jump targets for fragment links (`#anchor`).
 *
 * @param {string} html - Raw HTML content.
 * @returns {Set<string>} Set of anchor identifier strings.
 */
const extractAnchors = (html) => {
  const anchors = new Set();
  const idRegex = /\sid=['"]([^'"]+)['"]/gi;
  const nameRegex = /\sname=['"]([^'"]+)['"]/gi;
  let match;
  while ((match = idRegex.exec(html)) !== null) {
    if (match[1]) {
      anchors.add(match[1].trim());
    }
  }
  while ((match = nameRegex.exec(html)) !== null) {
    if (match[1]) {
      anchors.add(match[1].trim());
    }
  }
  return anchors;
};

/** Cache of parsed link/anchor data keyed by absolute file path. */
const fileCache = new Map();

/**
 * Returns parsed link and anchor data for an HTML file, using a cache to avoid
 * re-reading files that are referenced by many source pages.
 *
 * @param {string} filePath - Absolute path to an HTML file.
 * @returns {{ links: string[], anchors: Set<string> }}
 */
const getFileData = (filePath) => {
  if (fileCache.has(filePath)) {
    return fileCache.get(filePath);
  }
  const html = readFileSync(filePath, "utf8");
  const data = {
    links: extractLinks(html),
    anchors: extractAnchors(html),
  };
  fileCache.set(filePath, data);
  return data;
};

/**
 * Returns true if a link should be ignored by the current check mode.
 *
 * In `internal` mode: skips external HTTP(S) URLs and non-web schemes.
 * In `external` mode: skips everything that isn't HTTP(S).
 * Always skips empty values, bare `#`, `javascript:`, and `data:` URIs.
 *
 * @param {string} link - Raw link value from an HTML attribute.
 * @returns {boolean}
 */
const isSkippableLink = (link) => {
  if (!link || link === "#") return true;
  const trimmed = link.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:")) return true;
  if (mode === "internal") {
    if (/^(mailto:|tel:|irc:|ftp:)/i.test(trimmed)) return true;
    if (/^https?:\/\//i.test(trimmed)) return true;
  } else {
    if (!/^https?:\/\//i.test(trimmed)) return true;
  }
  return skipPatterns.some((pattern) => pattern.test(trimmed));
};

/**
 * Resolves an internal link to an absolute file path and optional anchor.
 *
 * Handles absolute paths (`/members/`), relative paths (`../foo/`), and
 * fragment-only links (`#section`). Applies the same directory-index resolution
 * that a web server would: `/foo/` → `/foo/index.html`.
 *
 * Returns `null` for protocol-relative URLs (`//example.com/`) which cannot be
 * resolved as local files.
 *
 * @param {string} link - Raw link value from an HTML attribute.
 * @param {string} currentFile - Absolute path to the HTML file containing the link.
 * @returns {{ filePath: string, anchor: string, urlPath?: string } | null}
 */
const resolveInternalTarget = (link, currentFile) => {
  const trimmed = link.trim();
  const [pathPartRaw, hashPartRaw] = trimmed.split("#");
  const pathPart = (pathPartRaw ?? "").split("?")[0];
  const hashPart = hashPartRaw ?? "";

  let anchor = "";
  if (hashPart) {
    try {
      anchor = decodeURIComponent(hashPart);
    } catch {
      anchor = hashPart;
    }
  }

  if (!pathPart) {
    return { filePath: currentFile, anchor };
  }
  if (pathPart.startsWith("//")) {
    return null;
  }

  let relPath = "";
  if (pathPart.startsWith("/")) {
    relPath = pathPart.slice(1);
  } else {
    const currentRel = path
      .relative(rootPath, currentFile)
      .split(path.sep)
      .join("/");
    const currentDir = path.posix.dirname(currentRel);
    relPath = path.posix.normalize(path.posix.join(currentDir, pathPart));
  }

  if (!relPath) {
    return {
      filePath: path.join(rootPath, "index.html"),
      anchor,
      urlPath: "/",
    };
  }

  const directPath = path.join(rootPath, relPath);
  if (pathPart.endsWith("/")) {
    return {
      filePath: path.join(directPath, "index.html"),
      anchor,
      urlPath: `/${relPath}`,
    };
  }

  if (path.extname(relPath)) {
    return { filePath: directPath, anchor, urlPath: `/${relPath}` };
  }

  if (existsSync(directPath) && statSync(directPath).isFile()) {
    return { filePath: directPath, anchor, urlPath: `/${relPath}` };
  }

  return {
    filePath: path.join(directPath, "index.html"),
    anchor,
    urlPath: `/${relPath}/`,
  };
};

/**
 * Formats an absolute file path as a human-readable source label for output.
 * Directory-index files are shown as their directory path (e.g. `html/foo/`).
 *
 * @param {string} filePath - Absolute path to an HTML file.
 * @returns {string}
 */
const displaySourcePath = (filePath) => {
  const rel = path.relative(rootPath, filePath).split(path.sep).join("/");
  if (rel === "index.html") return `${rootLabel}/`;
  if (rel.endsWith("/index.html"))
    return `${rootLabel}/${rel.replace(/index\.html$/, "")}`;
  return `${rootLabel}/${rel}`;
};

/**
 * Formats a resolved target as a human-readable label for error output.
 *
 * @param {string|undefined} urlPath - URL path string if known.
 * @param {string} filePath - Absolute file path of the resolved target.
 * @param {string} anchor - Fragment identifier (without `#`), or empty string.
 * @returns {string}
 */
const displayTargetPath = (urlPath, filePath, anchor) => {
  let displayPath = "";
  if (urlPath) {
    const normalized = urlPath.replace(/^\/+/, "");
    displayPath = normalized ? `${rootLabel}/${normalized}` : `${rootLabel}/`;
  } else {
    const rel = path.relative(rootPath, filePath).split(path.sep).join("/");
    displayPath = `${rootLabel}/${rel}`;
  }
  return anchor ? `${displayPath}#${anchor}` : displayPath;
};

/**
 * Prints broken-link failures grouped by source page, then exits with code 1.
 *
 * @param {{ source: string, target: string, type: string }[]} failures
 * @param {number} scannedCount - Total number of links that were checked.
 */
const reportFailures = (failures, scannedCount) => {
  const grouped = new Map();
  for (const failure of failures) {
    if (!grouped.has(failure.source)) grouped.set(failure.source, []);
    grouped.get(failure.source).push(failure);
  }
  for (const [source, items] of grouped) {
    console.error(source);
    for (const item of items) {
      const code = item.type === "anchor" ? "ANCHOR" : "404";
      console.error(`  [${code}] ${item.target}`);
    }
  }
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(3);
  console.error(
    `ERROR: Detected ${failures.length} broken links. Scanned ${scannedCount} links in ${elapsed} seconds.`,
  );
};

/**
 * Prints a success summary and exits with code 0.
 *
 * @param {number} scannedCount - Total number of links that were checked.
 */
const reportSuccess = (scannedCount) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(3);
  console.log(`OK: Scanned ${scannedCount} links in ${elapsed} seconds.`);
};

/** Checks all internal links and anchors in the build output. Exits 1 on failure. */
const runInternalCheck = () => {
  const htmlFiles = collectHtmlFiles(rootPath);
  const failures = [];
  let scannedCount = 0;

  for (const filePath of htmlFiles) {
    const { links } = getFileData(filePath);
    const source = displaySourcePath(filePath);
    for (const link of links) {
      if (isSkippableLink(link)) continue;
      const target = resolveInternalTarget(link, filePath);
      if (!target) continue;
      const { filePath: targetFile, anchor, urlPath } = target;
      scannedCount += 1;
      if (!existsSync(targetFile)) {
        failures.push({
          source,
          target: displayTargetPath(urlPath, targetFile, anchor),
          type: "missing",
        });
        continue;
      }
      if (anchor && targetFile.toLowerCase().endsWith(".html")) {
        const { anchors } = getFileData(targetFile);
        if (!anchors.has(anchor)) {
          failures.push({
            source,
            target: displayTargetPath(urlPath, targetFile, anchor),
            type: "anchor",
          });
        }
      }
    }
  }

  if (failures.length > 0) {
    reportFailures(failures, scannedCount);
    process.exit(1);
  }
  reportSuccess(scannedCount);
};

/**
 * Checks whether a single external URL responds with a successful status code.
 *
 * Attempts a HEAD request first (faster, no body transfer). Falls back to GET
 * for servers that return 405 (Method Not Allowed) or 400 for HEAD requests,
 * which is common on some CDNs and custom servers.
 *
 * @param {string} url - Fully-qualified HTTP(S) URL to check.
 * @param {number} timeoutMs - Abort timeout in milliseconds.
 * @returns {Promise<boolean>} True if the URL returned a 2xx/3xx response.
 */
const checkExternalUrl = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    if (response.status === 405 || response.status === 400) {
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
    }
    clearTimeout(timeout);
    return response.status >= 200 && response.status < 400;
  } catch {
    clearTimeout(timeout);
    return false;
  }
};

/**
 * Checks all external HTTP(S) links found in the build output.
 * Each unique URL is fetched only once even if it appears on many pages.
 * Exits 1 if any URL is unreachable.
 */
const runExternalCheck = async () => {
  const htmlFiles = collectHtmlFiles(rootPath);
  const linksBySource = new Map();
  const uniqueLinks = new Set();

  for (const filePath of htmlFiles) {
    const { links } = getFileData(filePath);
    const source = displaySourcePath(filePath);
    for (const link of links) {
      if (isSkippableLink(link)) continue;
      const trimmed = link.trim();
      uniqueLinks.add(trimmed);
      if (!linksBySource.has(source)) linksBySource.set(source, new Set());
      linksBySource.get(source).add(trimmed);
    }
  }

  const failures = new Set();
  let scannedCount = 0;
  const timeoutMs = Number(process.env.LINKCHECK_TIMEOUT ?? 10000);

  for (const link of uniqueLinks) {
    scannedCount += 1;
    const ok = await checkExternalUrl(link, timeoutMs);
    if (!ok) failures.add(link);
  }

  if (failures.size > 0) {
    for (const [source, links] of linksBySource) {
      const broken = Array.from(links).filter((link) => failures.has(link));
      if (broken.length === 0) continue;
      console.error(source);
      for (const link of broken) {
        console.error(`  [ERR] ${link}`);
      }
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(3);
    console.error(
      `ERROR: Detected ${failures.size} broken links. Scanned ${scannedCount} links in ${elapsed} seconds.`,
    );
    process.exit(1);
  }

  reportSuccess(scannedCount);
};

console.log(`Scanning ${mode} links in ${rootLabel}`);
if (mode === "external") {
  await runExternalCheck();
} else {
  runInternalCheck();
}
