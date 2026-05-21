/**
 * Link checker for the OpenAstronomy static-site build output.
 *
 *   node scripts/linkcheck.mjs internal   # check internal links + anchors
 *   node scripts/linkcheck.mjs external   # check external HTTP(S) URLs
 *
 * Env:
 *   LINKCHECK_ROOT           build dir (default: "html")
 *   LINKCHECK_SKIP_FILE      skip patterns file (default: "linkcheck.skip.txt")
 *   LINKCHECK_TIMEOUT        external request timeout ms (default: 10000)
 *   LINKCHECK_CONCURRENCY    external workers (default: 20)
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const mode = process.argv[2] ?? "internal";
const rootPath = path.resolve(process.env.LINKCHECK_ROOT ?? "html");
const rootLabel = (process.env.LINKCHECK_ROOT ?? "html").replace(/\\/g, "/");
const skipFile = process.env.LINKCHECK_SKIP_FILE ?? "linkcheck.skip.txt";

if (!existsSync(rootPath)) {
  console.error(`Build output "${rootLabel}" missing. Run "npm run build".`);
  process.exit(1);
}

const skipPatterns = (
  existsSync(skipFile)
    ? readFileSync(skipFile, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
    : []
).flatMap((line) => {
  try {
    return [new RegExp(line)];
  } catch {
    console.warn(`Invalid skip pattern ignored: ${line}`);
    return [];
  }
});

const HREF_RE = /\s(?:href|src)=['"]([^'"]+)['"]/gi;
const SRCSET_RE = /\ssrcset=['"]([^'"]+)['"]/gi;
const ID_RE = /\s(?:id|name)=['"]([^'"]+)['"]/gi;

/** Walk a dir, return all .html paths. */
const collectHtmlFiles = (dir, out = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectHtmlFiles(full, out);
    else if (entry.name.toLowerCase().endsWith(".html")) out.push(full);
  }
  return out;
};

const matchAll = (re, html, sink) => {
  let m;
  while ((m = re.exec(html)) !== null) if (m[1]) sink(m[1].trim());
};

const cache = new Map();
const parseFile = (file) => {
  if (cache.has(file)) return cache.get(file);
  const html = readFileSync(file, "utf8");
  const links = [];
  const anchors = new Set();
  matchAll(HREF_RE, html, (v) => links.push(v));
  matchAll(SRCSET_RE, html, (raw) => {
    for (const part of raw.split(",")) {
      const url = part.trim().split(/\s+/)[0];
      if (url) links.push(url);
    }
  });
  matchAll(ID_RE, html, (v) => anchors.add(v));
  const data = { links, anchors };
  cache.set(file, data);
  return data;
};

const isSkippable = (link) => {
  if (!link || link === "#") return true;
  const lower = link.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:")) return true;
  if (mode === "internal") {
    if (/^(mailto:|tel:|irc:|ftp:|https?:\/\/)/i.test(link)) return true;
  } else if (!/^https?:\/\//i.test(link)) {
    return true;
  }
  return skipPatterns.some((p) => p.test(link));
};

/** Map a link from `current` (abs HTML path) to `{ file, anchor, urlPath }`. */
const resolveInternal = (link, current) => {
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

const showSource = (file) => {
  const rel = path.relative(rootPath, file).split(path.sep).join("/");
  if (rel === "index.html") return `${rootLabel}/`;
  if (rel.endsWith("/index.html"))
    return `${rootLabel}/${rel.slice(0, -"index.html".length)}`;
  return `${rootLabel}/${rel}`;
};

const showTarget = ({ file, anchor, urlPath }) => {
  const base = urlPath
    ? `${rootLabel}${urlPath}`
    : `${rootLabel}/${path.relative(rootPath, file).split(path.sep).join("/")}`;
  return anchor ? `${base}#${anchor}` : base;
};

const reportFailures = (failures, scanned, startTime) => {
  const grouped = new Map();
  for (const f of failures) {
    if (!grouped.has(f.source)) grouped.set(f.source, []);
    grouped.get(f.source).push(f);
  }
  for (const [source, items] of grouped) {
    console.error(source);
    for (const f of items)
      console.error(
        `  [${f.kind === "anchor" ? "ANCHOR" : "404"}] ${f.target}`,
      );
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

const runInternalCheck = (startTime) => {
  const failures = [];
  let scanned = 0;
  for (const file of collectHtmlFiles(rootPath)) {
    const source = showSource(file);
    for (const link of parseFile(file).links) {
      if (isSkippable(link)) continue;
      const target = resolveInternal(link, file);
      if (!target) continue;
      scanned++;
      if (!existsSync(target.file)) {
        failures.push({ source, target: showTarget(target), kind: "missing" });
      } else if (target.anchor && target.file.toLowerCase().endsWith(".html")) {
        const { anchors } = parseFile(target.file);
        if (!anchors.has(target.anchor)) {
          failures.push({ source, target: showTarget(target), kind: "anchor" });
        }
      }
    }
  }
  if (failures.length) {
    reportFailures(failures, scanned, startTime);
    process.exit(1);
  }
  reportSuccess(scanned, startTime);
};

const fetchOk = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    if (res.status === 400 || res.status === 405) {
      res = await fetch(url, {
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

const runExternalCheck = async (startTime) => {
  const linksBySource = new Map();
  const uniqueLinks = new Set();
  for (const file of collectHtmlFiles(rootPath)) {
    const source = showSource(file);
    for (const link of parseFile(file).links) {
      if (isSkippable(link)) continue;
      const trimmed = link.trim();
      uniqueLinks.add(trimmed);
      if (!linksBySource.has(source)) linksBySource.set(source, new Set());
      linksBySource.get(source).add(trimmed);
    }
  }

  const timeoutMs = Number(process.env.LINKCHECK_TIMEOUT ?? 10000);
  const concurrency = Number(process.env.LINKCHECK_CONCURRENCY ?? 20);
  const queue = [...uniqueLinks];
  const failures = new Set();
  let i = 0;
  let scanned = 0;
  const worker = async () => {
    while (i < queue.length) {
      const link = queue[i++];
      scanned++;
      if (!(await fetchOk(link, timeoutMs))) failures.add(link);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  if (failures.size) {
    for (const [source, links] of linksBySource) {
      const broken = [...links].filter((l) => failures.has(l));
      if (!broken.length) continue;
      console.error(source);
      for (const l of broken) console.error(`  [ERR] ${l}`);
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(3);
    console.error(
      `ERROR: Detected ${failures.size} broken links. Scanned ${scanned} links in ${elapsed} seconds.`,
    );
    process.exit(1);
  }
  reportSuccess(scanned, startTime);
};

const startTime = Date.now();
console.log(`Scanning ${mode} links in ${rootLabel}`);
if (mode === "external") await runExternalCheck(startTime);
else runInternalCheck(startTime);
