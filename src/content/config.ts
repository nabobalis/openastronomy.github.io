import { defineCollection, z } from "astro:content";

const posts = defineCollection({
  type: "content",
  schema: z
    .object({
      title: z.string(),
      date: z.date(),
      author: z.string().optional(),
      meta: z.string().optional(),
    })
    .passthrough(),
});

const pages = defineCollection({
  type: "content",
  schema: z.object({}).passthrough(),
});

export const collections = {
  posts,
  pages,
};
