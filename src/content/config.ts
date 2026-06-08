import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    author: z.string().optional(),
    meta: z.string().optional(),
    summary: z.string().optional(),
  }),
});

const scalarToString = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
    : value;

const listItemToString = (value: unknown) => {
  const scalar = scalarToString(value);
  if (
    scalar !== value ||
    scalar === null ||
    scalar === undefined ||
    Array.isArray(scalar) ||
    typeof scalar !== "object"
  ) {
    return scalar;
  }

  const entries = Object.entries(scalar);
  if (entries.length !== 1) return scalar;

  const [[key, entryValue]] = entries;
  const normalizedValue = scalarToString(entryValue);
  return typeof normalizedValue === "string"
    ? `${key}: ${normalizedValue}`
    : scalar;
};

const stringField = z
  .preprocess((value) => {
    if (value === null || value === undefined || value === "") return undefined;
    return scalarToString(value);
  }, z.string().optional())
  .optional();

const stringListField = z
  .preprocess((value) => {
    if (value === null || value === undefined || value === "") return undefined;
    if (Array.isArray(value)) {
      return value
        .map(listItemToString)
        .filter((item) => item !== null && item !== undefined && item !== "");
    }
    return [scalarToString(value)];
  }, z.array(z.string()).optional())
  .optional();

const pages = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/pages" }),
  schema: z.object({
    title: z.string().nullish(),
    name: z.string().nullish(),
    description: z.string().nullish(),
    season: z.union([z.string(), z.number()]).optional(),
    layout: z.string().optional(),
    show_main: z.boolean().optional(),
    ideas_team: stringField,
    desc: z.string().nullish(),
    difficulty: stringField,
    requirements: stringListField,
    mentors: stringListField,
    initiatives: stringListField,
    project_size: stringListField,
    tags: stringListField,
    collaborating_projects: stringListField,
    issues: stringListField,
  }),
});

export const collections = { posts, pages };
