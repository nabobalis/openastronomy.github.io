import { XMLParser } from "fast-xml-parser";
import { parse as parseYaml } from "yaml";
import universeYaml from "../data/universe/seasons.yml?raw";
import { members } from "./members.ts";

type RawContributor = {
  name?: unknown;
  feed?: unknown;
  project?: unknown;
};

type RawWindow = {
  start?: unknown;
  end?: unknown;
  optional?: unknown;
};

type RawSeason = {
  year?: unknown;
  windows?: RawWindow[] | null;
  contributors?: RawContributor[] | null;
};

type RawUniverseConfig = {
  seasons?: RawSeason[];
};

export type UniverseDateRange = {
  start: Date;
  end: Date;
  optional?: boolean;
};

export type UniverseWindowStatus = UniverseDateRange & {
  status: "complete" | "missing" | "optional" | "pending";
};

export type UniverseFeedPost = {
  title: string;
  url: string;
  publishedAt: Date;
  summary?: string;
};

export type UniverseStudent = {
  name: string;
  project: string;
  feedUrl: string;
  blogUrl: string | null;
  feedStatus: "ok" | "empty" | "unavailable";
  feedError?: string;
  latestPostAt: Date | null;
  posts: UniverseFeedPost[];
  windows: UniverseWindowStatus[];
};

export type UniverseSeason = {
  seasonKey: string;
  year: number;
  generatedAt: Date;
  students: UniverseStudent[];
  dateRanges: UniverseDateRange[];
  availableYears: number[];
  totals: {
    complete: number;
    missing: number;
    optional: number;
    pending: number;
    feedsOk: number;
    feedsUnavailable: number;
  };
};

type BuildUniverseSeasonOptions = {
  year?: number;
  now?: Date;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

type ParsedFeed = {
  status: "ok" | "empty" | "unavailable";
  posts: UniverseFeedPost[];
  error?: string;
};

export type UniverseContributorConfig = {
  name: string;
  feedUrl: string;
  project: string;
};

export type UniverseSeasonConfig = {
  dateRanges: UniverseDateRange[];
  contributors: UniverseContributorConfig[];
};

const DEFAULT_TIMEOUT_MS = 6000;
const FEED_ACCEPT_HEADER = "application/rss+xml, application/xml, text/xml";
const EXTERNAL_PROJECT_KEYS = new Set(["HelioPy", "TimeLab", "irsa-fornax"]);
const MEMBER_PROJECT_KEYS = new Set(Object.keys(members));

const xmlParser = new XMLParser({
  attributeNamePrefix: "@",
  ignoreAttributes: false,
  processEntities: true,
  textNodeName: "#text",
  trimValues: true,
});

export const formatFeedHttpError = (response: Response) => {
  const cloudflareChallenge =
    response.headers.get("cf-mitigated")?.toLowerCase() === "challenge";
  return `HTTP ${response.status}${cloudflareChallenge ? " (Cloudflare challenge)" : ""}`;
};

const readUniverseData = (): unknown => parseYaml(universeYaml);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asArray = <T>(value: T | T[] | null | undefined): T[] => {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

const textValue = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  const record = asRecord(value);
  if (!record) return "";

  for (const key of ["#text", "__cdata", "@term", "@label", "@href"]) {
    const text = textValue(record[key]);
    if (text) return text;
  }
  return "";
};

const stripHtml = (value: string) =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseDateValue = (value: unknown): Date | null => {
  const raw = textValue(value);
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const seasonLabel = (season: Record<string, unknown>, index: number) => {
  const year = textValue(season.year);
  return year ? `season ${year}` : `season ${index + 1}`;
};

const validateProject = (project: string) =>
  MEMBER_PROJECT_KEYS.has(project) || EXTERNAL_PROJECT_KEYS.has(project);

export function validateUniverseConfig(
  config: unknown,
): asserts config is RawUniverseConfig {
  const errors: string[] = [];
  const seasonsValue = asRecord(config)?.seasons;
  const seasons = Array.isArray(seasonsValue) ? seasonsValue : [];
  if (seasons.length === 0) errors.push("seasons must be a non-empty list");

  const seenYears = new Set<number>();
  const latestYear = Math.max(
    ...seasons
      .map((s) => Number(textValue(asRecord(s)?.year)))
      .filter(Number.isInteger),
  );

  seasons.forEach((seasonValue, seasonIndex) => {
    const season = asRecord(seasonValue);
    const label = seasonLabel(season ?? {}, seasonIndex);
    if (!season) {
      errors.push(`${label}: must be an object`);
      return;
    }

    const year = Number(textValue(season.year));
    if (!Number.isInteger(year))
      errors.push(`${label}: year must be an integer`);
    else if (seenYears.has(year)) errors.push(`${label}: year must be unique`);
    else seenYears.add(year);

    // Only the latest season is live, so older archive windows are not checked.
    if (year === latestYear) {
      const windows = Array.isArray(season.windows) ? season.windows : [];
      if (windows.length === 0) {
        errors.push(`${label}: windows must be a non-empty list`);
      }
      windows.forEach((windowValue, i) => {
        const wl = `${label} window ${i + 1}`;
        const window = asRecord(windowValue);
        if (!window) return errors.push(`${wl}: must be an object`);
        if ((i === 0) !== (window.optional === true)) {
          errors.push(
            i === 0
              ? `${wl}: first window must set optional: true`
              : `${wl}: only the first window can be optional`,
          );
        }
        const start = parseDateValue(window.start);
        const end = parseDateValue(window.end);
        if (!start || !end)
          errors.push(`${wl}: start and end must be valid dates`);
        else if (end.getTime() <= start.getTime())
          errors.push(`${wl}: end must be after start`);
      });
    }

    const contributors = Array.isArray(season.contributors)
      ? season.contributors
      : [];
    if (contributors.length === 0) {
      errors.push(`${label}: contributors must be a non-empty list`);
    }
    contributors.forEach((contributorValue, i) => {
      const cl = `${label} contributor ${i + 1}`;
      const contributor = asRecord(contributorValue);
      if (!contributor) return errors.push(`${cl}: must be an object`);
      const name = textValue(contributor.name);
      const project = textValue(contributor.project);
      const feed = textValue(contributor.feed);
      if (!name) errors.push(`${cl}: name is required`);
      if (!project) errors.push(`${cl}: project is required`);
      else if (!validateProject(project))
        errors.push(
          `${cl}: project "${project}" must match src/data/members.json or an allowed external project`,
        );
      if (!feed) errors.push(`${cl}: feed is required`);
      else if (!isHttpUrl(feed))
        errors.push(`${cl}: feed must be an HTTP(S) URL`);
    });
  });

  if (errors.length > 0) {
    throw new Error(
      `Invalid universe-oa season data:\n- ${errors.join("\n- ")}`,
    );
  }
}

const GSOC_PATTERN =
  /\b(?:gsoc\d*|google\s+summer\s+of\s+code|openastronomy)\b/i;

const isRelevantMediumItem = (item: Record<string, unknown>) =>
  [
    ...asArray(item.category).map(textValue),
    textValue(item.title),
    itemSummary(item),
    stripHtml(textValue(item["content:encoded"] ?? item.content)),
  ].some((text) => GSOC_PATTERN.test(text ?? ""));

const pickLink = (value: unknown): string => {
  if (typeof value === "string") return value.trim();

  for (const entry of asArray(value)) {
    const record = asRecord(entry);
    if (!record) {
      const text = textValue(entry);
      if (text) return text;
      continue;
    }

    const href = textValue(record["@href"] ?? record["href"]);
    const rel = textValue(record["@rel"] ?? record["rel"]);
    if (href && (!rel || rel === "alternate")) return href;
  }

  return textValue(value);
};

const itemDate = (item: Record<string, unknown>) => {
  for (const key of [
    "published",
    "updated",
    "pubDate",
    "dc:date",
    "date",
    "created",
  ]) {
    const date = parseDateValue(item[key]);
    if (date) return date;
  }
  return null;
};

const itemSummary = (item: Record<string, unknown>) => {
  for (const key of ["summary", "description", "content", "content:encoded"]) {
    const summary = stripHtml(textValue(item[key]));
    if (summary) return summary.slice(0, 240);
  }
  return undefined;
};

const feedItemsFromXml = (xml: string): Record<string, unknown>[] => {
  const parsed = asRecord(xmlParser.parse(xml));
  if (!parsed) return [];

  const rss = asRecord(parsed.rss);
  const channel = asRecord(rss?.channel);
  if (channel?.item) {
    return asArray(channel.item).flatMap((item) => {
      const record = asRecord(item);
      return record ? [record] : [];
    });
  }

  const atomFeed = asRecord(parsed.feed);
  if (atomFeed?.entry) {
    return asArray(atomFeed.entry).flatMap((item) => {
      const record = asRecord(item);
      return record ? [record] : [];
    });
  }

  const rdf = asRecord(parsed["rdf:RDF"] ?? parsed.RDF);
  if (rdf?.item) {
    return asArray(rdf.item).flatMap((item) => {
      const record = asRecord(item);
      return record ? [record] : [];
    });
  }

  return [];
};

export const parseFeedXml = (xml: string, feedUrl = ""): UniverseFeedPost[] => {
  const isMediumFeed = feedUrl.toLowerCase().includes("medium");

  return feedItemsFromXml(xml)
    .flatMap((item) => {
      if (isMediumFeed && !isRelevantMediumItem(item)) {
        return [];
      }

      const publishedAt = itemDate(item);
      const url = pickLink(item.link ?? item.id);
      if (!publishedAt || !url) return [];

      const title =
        textValue(item.title) ||
        itemSummary(item)?.slice(0, 60) ||
        "Untitled post";

      return [
        {
          title,
          url,
          publishedAt,
          summary: itemSummary(item),
        },
      ];
    })
    .sort(
      (left, right) => right.publishedAt.getTime() - left.publishedAt.getTime(),
    );
};

const fetchFeed = async (
  feedUrl: string,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<ParsedFeed> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(feedUrl, {
      headers: { Accept: FEED_ACCEPT_HEADER },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        status: "unavailable",
        posts: [],
        error: formatFeedHttpError(response),
      };
    }

    const posts = parseFeedXml(await response.text(), feedUrl);
    return {
      status: posts.length > 0 ? "ok" : "empty",
      posts,
    };
  } catch (error) {
    return {
      status: "unavailable",
      posts: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const getBlogUrl = (
  feedUrl: string,
  posts: UniverseFeedPost[],
): string | null => {
  const sourceUrl = posts[0]?.url || feedUrl;
  try {
    const url = new URL(sourceUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const first = parts[0] ?? "";

    if (url.hostname.includes("medium")) {
      const handle = parts.find((part) => part.startsWith("@"));
      if (handle) return `${url.origin}/${handle}`;
    }
    if (url.hostname === "dev.to") {
      const feedIndex = parts.findIndex(
        (part) => part.toLowerCase() === "feed",
      );
      const username = feedIndex >= 0 ? parts[feedIndex + 1] : first;
      if (username) return `${url.origin}/${username}`;
    }

    const blogIndex = parts.findIndex((part) => part.toLowerCase() === "blog");
    if (blogIndex >= 0) {
      return `${url.origin}/${parts.slice(0, blogIndex + 1).join("/")}/`;
    }

    return url.origin;
  } catch {
    return null;
  }
};

export const computeWindowStatuses = (
  ranges: UniverseDateRange[],
  posts: UniverseFeedPost[],
  now = new Date(),
): UniverseWindowStatus[] =>
  ranges.map((range) => {
    const hasPost = posts.some(
      (post) =>
        post.publishedAt.getTime() > range.start.getTime() &&
        post.publishedAt.getTime() <= range.end.getTime(),
    );

    let status: UniverseWindowStatus["status"] = "missing";
    if (hasPost) status = "complete";
    else if (range.optional) status = "optional";
    else if (now.getTime() <= range.end.getTime()) status = "pending";

    return { ...range, status };
  });

export const loadUniverseConfig = () => {
  const rawConfig = readUniverseData();
  validateUniverseConfig(rawConfig);

  const rawSeasons = rawConfig.seasons ?? [];
  const seasons = Object.fromEntries(
    rawSeasons.flatMap((season) => {
      const year = Number(season.year);
      if (!Number.isInteger(year)) return [];

      const dateRanges: UniverseDateRange[] = (
        Array.isArray(season.windows) ? season.windows : []
      ).flatMap((range) => {
        const start = parseDateValue(range.start);
        const end = parseDateValue(range.end);
        const optional = range.optional === true;
        return start && end ? [{ start, end, optional }] : [];
      });

      const contributors: UniverseContributorConfig[] = (
        Array.isArray(season.contributors) ? season.contributors : []
      ).map((contributor) => ({
        name: textValue(contributor.name),
        feedUrl: textValue(contributor.feed),
        project: textValue(contributor.project),
      }));

      return [
        [year, { dateRanges, contributors } satisfies UniverseSeasonConfig],
      ];
    }),
  );

  const availableYears = Object.keys(seasons)
    .map(Number)
    .filter((year) => Number.isInteger(year))
    .sort((left, right) => right - left);

  return { seasons, availableYears };
};

export const resolveUniverseYear = (
  availableYears: number[],
  now = new Date(),
  requestedYear?: number,
) => {
  if (requestedYear && availableYears.includes(requestedYear)) {
    return requestedYear;
  }

  const currentYear = now.getUTCFullYear();
  return (
    availableYears.find((year) => year <= currentYear) ?? availableYears[0]
  );
};

export const buildUniverseSeason = async ({
  year,
  now = new Date(),
  fetcher = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: BuildUniverseSeasonOptions = {}): Promise<UniverseSeason> => {
  const { seasons, availableYears } = loadUniverseConfig();
  const resolvedYear = resolveUniverseYear(availableYears, now, year);
  const seasonKey = `gsoc${resolvedYear}`;
  const season = seasons[resolvedYear];
  const ranges = season?.dateRanges ?? [];

  const students = await Promise.all(
    (season?.contributors ?? []).map(async (contributor) => {
      const { name, feedUrl, project } = contributor;
      const feed = feedUrl
        ? await fetchFeed(feedUrl, fetcher, timeoutMs)
        : {
            status: "unavailable" as const,
            posts: [],
            error: "Missing RSS feed URL",
          };

      return {
        name,
        project,
        feedUrl,
        blogUrl: feedUrl ? getBlogUrl(feedUrl, feed.posts) : null,
        feedStatus: feed.status,
        feedError: feed.error,
        latestPostAt: feed.posts[0]?.publishedAt ?? null,
        posts: feed.posts,
        windows: computeWindowStatuses(ranges, feed.posts, now),
      };
    }),
  );

  students.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  );

  const allWindows = students.flatMap((student) => student.windows);
  return {
    seasonKey,
    year: resolvedYear,
    generatedAt: now,
    students,
    dateRanges: ranges,
    availableYears,
    totals: {
      complete: allWindows.filter((window) => window.status === "complete")
        .length,
      missing: allWindows.filter((window) => window.status === "missing")
        .length,
      optional: allWindows.filter((window) => window.status === "optional")
        .length,
      pending: allWindows.filter((window) => window.status === "pending")
        .length,
      feedsOk: students.filter((student) => student.feedStatus === "ok").length,
      feedsUnavailable: students.filter(
        (student) => student.feedStatus === "unavailable",
      ).length,
    },
  };
};
