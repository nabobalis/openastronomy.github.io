import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://openastronomy.org",
  // ASTRO_BASE is set in CircleCI to prefix all asset/link URLs with the
  // artifact path, so the preview build renders correctly in the artifact viewer.
  base: process.env.ASTRO_BASE,
  trailingSlash: "always",
  outDir: "html",
  build: {
    format: "directory",
  },
});
