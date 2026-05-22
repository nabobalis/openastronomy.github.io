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

// String, number, array, or null — matches what normalizeArray() accepts.
// Bare YAML keys (e.g. `desc:`) are parsed as null by the YAML loader.
const flexField = z
  .union([z.string(), z.number(), z.array(z.unknown()), z.null()])
  .optional();

const pages = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/pages" }),
  schema: z.object({
    // Shared page fields
    title: z.string().nullish(),
    name: z.string().nullish(),
    description: z.string().nullish(),
    season: z.union([z.string(), z.number()]).optional(),
    layout: z.string().optional(),
    // GSoC project-specific fields
    desc: z.string().nullish(),
    requirements: flexField,
    mentors: flexField,
    initiatives: flexField,
    project_size: flexField,
    tags: flexField,
    collaborating_projects: flexField,
    issues: flexField,
  }),
});

export const collections = { posts, pages };
