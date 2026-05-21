import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
  schema: z
    .object({
      title: z.string(),
      date: z.date(),
      author: z.string().optional(),
      meta: z.string().optional(),
      summary: z.string().optional(),
    })
    .passthrough(),
});

export const collections = {
  posts,
};
