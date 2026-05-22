import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_ROOT = "html";
const DEFAULT_SKIP_FILE = "linkcheck.skip.txt";
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_CONCURRENCY = 20;

const HREF_RE = /\s(?:href|src)=['"]([^'"]+)['"]/gi;
const SRCSET_RE = /\ssrcset=['"]([^'"]+)['"]/gi;
const ID_RE = /\s(?:id|name)=['"]([^'"]+)['"]/gi;

export const parseMode = (value = "internal") => {
  if (value === "internal" || value === "external") return value;
  throw new Error(
    `Unknown linkcheck mode "${value}". Use "internal" or "external".`,
  );
};

export const parsePositiveInteger = (value, fallback, name) => {
  const raw = value ?? String(fallback);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer; got "${raw}".`);
  }
  return parsed;
};

export const loadSkipPatterns = (skipFile = DEFAULT_SKIP_FILE) =>
  (existsSync(skipFile)
    ? readFileSync(skipFile, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
    : []
  ).flatMap((line) => {
    try {
      return [new RegExp(line)];
    } catch {
      console.warn(`Invalid skip pattern ignored: ${line}`);
      return [];
    }
  });

export const collectHtmlFiles = (dir, out = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectHtmlFiles(full, out);
    else if (entry.name.toLowerCase().endsWith(".html")) out.push(full);
  }
  return out;
};

const matchAll = (re, html, sink) => {
  let match;
  re.lastIndex = 0;
  while ((match = re.exec(html)) !== null) if (match[1]) sink(match[1].trim());
};

export const extractLinksAndAnchors = (html) => {
  const links = [];
  const anchors = new Set();

  matchAll(HREF_RE, html, (value) => links.push(value));
  matchAll(SRCSET_RE, html, (raw) => {
    for (const part of raw.split(",")) {
      const url = part.trim().split(/\s+/)[0];
      if (url) links.push(url);
    }
  });
  matchAll(ID_RE, html, (value) => anchors.add(value));

  return { links, anchors };
};

export const parseFile = (file, cache = new Map()) => {
  if (cache.has(file)) return cache.get(file);
  const data = extractLinksAndAnchors(readFileSync(file, "utf8"));
  cache.set(file, data);
  return data;
};

export const isSkippable = (link, mode, skipPatterns = []) => {
  if (!link || link === "#") return true;
  const lower = link.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:")) return true;
  if (mode === "internal") {
    if (/^(mailto:|tel:|irc:|ftp:|https?:\/\/)/i.test(link)) return true;
  } else if (!/^https?:\/\//i.test(link)) {
    return true;
  }
  return skipPatterns.some((pattern) => pattern.test(link));
};

export const resolveInternal = (link, current, rootPath) => {
  const [pathPartRaw, hashPart = ""] = link.split("#");
  const pathPart = pathPartRaw.split("?")[0];
  let anchor = "";
  try {
    anchor = decodeURIComponent(hashPart);
  } catch {
    anchor = hashPart;
  }

  if (!pathPart) return { file: current, anchor };
  if (pathPart.startsWith("//")) return null;

  let rel;
  if (pathPart.startsWith("/")) {
    rel = pathPart.slice(1);
  } else {
    const currentRel = path
      .relative(rootPath, current)
      .split(path.sep)
      .join("/");
    rel = path.posix.normalize(
      path.posix.join(path.posix.dirname(currentRel), pathPart),
    );
  }

  if (!rel) {
    return { file: path.join(rootPath, "index.html"), anchor, urlPath: "/" };
  }

  const direct = path.join(rootPath, rel);
  if (pathPart.endsWith("/")) {
    return {
      file: path.join(direct, "index.html"),
      anchor,
      urlPath: `/${rel}`,
    };
  }
  if (path.extname(rel) || (existsSync(direct) && statSync(direct).isFile())) {
    return { file: direct, anchor, urlPath: `/${rel}` };
  }
  return {
    file: path.join(direct, "index.html"),
    anchor,
    urlPath: `/${rel}/`,
  };
};

export const showSource = (file, rootPath, rootLabel) => {
  const rel = path.relative(rootPath, file).split(path.sep).join("/");
  if (rel === "index.html") return `${rootLabel}/`;
  if (rel.endsWith("/index.html"))
    return `${rootLabel}/${rel.slice(0, -"index.html".length)}`;
  return `${rootLabel}/${rel}`;
};

export const showTarget = ({ file, anchor, urlPath }, rootPath, rootLabel) => {
  const base = urlPath
    ? `${rootLabel}${urlPath}`
    : `${rootLabel}/${path.relative(rootPath, file).split(path.sep).join("/")}`;
  return anchor ? `${base}#${anchor}` : base;
};

const reportFailures = (failures, scanned, startTime) => {
  const grouped = new Map();
  for (const failure of failures) {
    if (!grouped.has(failure.source)) grouped.set(failure.source, []);
    grouped.get(failure.source).push(failure);
  }
  for (const [source, items] of grouped) {
    console.error(source);
    for (const failure of items) {
      const tag =
        failure.kind === "anchor"
          ? "ANCHOR"
          : failure.kind === "external"
            ? "ERR"
            : "404";
      console.error(`  [${tag}] ${failure.target}`);
    }
  }
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(3);
  console.error(
    `ERROR: Detected ${failures.length} broken links. Scanned ${scanned} links in ${elapsed} seconds.`,
  );
};

const reportSuccess = (scanned, startTime) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(3);
  console.log(`OK: Scanned ${scanned} links in ${elapsed} seconds.`);
};

export const runInternalCheck = ({
  rootPath,
  rootLabel,
  skipPatterns = [],
}) => {
  const cache = new Map();
  const failures = [];
  let scanned = 0;

  for (const file of collectHtmlFiles(rootPath)) {
    const source = showSource(file, rootPath, rootLabel);
    for (const link of parseFile(file, cache).links) {
      if (isSkippable(link, "internal", skipPatterns)) continue;
      const target = resolveInternal(link, file, rootPath);
      if (!target) continue;
      scanned++;
      if (!existsSync(target.file)) {
        failures.push({
          source,
          target: showTarget(target, rootPath, rootLabel),
          kind: "missing",
        });
      } else if (target.anchor && target.file.toLowerCase().endsWith(".html")) {
        const { anchors } = parseFile(target.file, cache);
        if (!anchors.has(target.anchor)) {
          failures.push({
            source,
            target: showTarget(target, rootPath, rootLabel),
            kind: "anchor",
          });
        }
      }
    }
  }

  return { failures, scanned };
};

export const fetchOk = async (url, timeoutMs, fetchImpl = fetch) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetchImpl(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    if (res.status === 400 || res.status === 405) {
      res = await fetchImpl(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
    }
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

export const runExternalCheck = async ({
  rootPath,
  rootLabel,
  skipPatterns = [],
  timeoutMs = DEFAULT_TIMEOUT_MS,
  concurrency = DEFAULT_CONCURRENCY,
  fetchImpl = fetch,
}) => {
  const cache = new Map();
  const linksBySource = new Map();
  const uniqueLinks = new Set();

  for (const file of collectHtmlFiles(rootPath)) {
    const source = showSource(file, rootPath, rootLabel);
    for (const link of parseFile(file, cache).links) {
      if (isSkippable(link, "external", skipPatterns)) continue;
      const trimmed = link.trim();
      uniqueLinks.add(trimmed);
      if (!linksBySource.has(source)) linksBySource.set(source, new Set());
      linksBySource.get(source).add(trimmed);
    }
  }

  const queue = [...uniqueLinks];
  const brokenLinks = new Set();
  let index = 0;
  let scanned = 0;
  const worker = async () => {
    while (index < queue.length) {
      const link = queue[index++];
      scanned++;
      if (!(await fetchOk(link, timeoutMs, fetchImpl))) brokenLinks.add(link);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  const failures = [];
  for (const [source, links] of linksBySource) {
    for (const link of links) {
      if (brokenLinks.has(link)) {
        failures.push({ source, target: link, kind: "external" });
      }
    }
  }

  return { failures, scanned };
};

export const main = async (argv = process.argv, env = process.env) => {
  const startTime = Date.now();
  try {
    const mode = parseMode(argv[2] ?? "internal");
    const rootInput = env.LINKCHECK_ROOT ?? DEFAULT_ROOT;
    const rootPath = path.resolve(rootInput);
    const rootLabel = rootInput.replace(/\\/g, "/");

    if (!existsSync(rootPath)) {
      throw new Error(
        `Build output "${rootLabel}" missing. Run "npm run build".`,
      );
    }

    const skipPatterns = loadSkipPatterns(
      env.LINKCHECK_SKIP_FILE ?? DEFAULT_SKIP_FILE,
    );
    console.log(`Scanning ${mode} links in ${rootLabel}`);

    const result =
      mode === "external"
        ? await runExternalCheck({
            rootPath,
            rootLabel,
            skipPatterns,
            timeoutMs: parsePositiveInteger(
              env.LINKCHECK_TIMEOUT,
              DEFAULT_TIMEOUT_MS,
              "LINKCHECK_TIMEOUT",
            ),
            concurrency: parsePositiveInteger(
              env.LINKCHECK_CONCURRENCY,
              DEFAULT_CONCURRENCY,
              "LINKCHECK_CONCURRENCY",
            ),
          })
        : runInternalCheck({ rootPath, rootLabel, skipPatterns });

    if (result.failures.length) {
      reportFailures(result.failures, result.scanned, startTime);
      return 1;
    }
    reportSuccess(result.scanned, startTime);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await main();
}
