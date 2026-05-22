/**
 * Shared logo asset map for OpenAstronomy member organisations.
 *
 * Calling import.meta.glob once here (rather than per MemberCard render)
 * avoids duplicating the map construction for every member on the page.
 */
import type { ImageMetadata } from "astro";

const logoModules = import.meta.glob<{ default: ImageMetadata }>(
  "../assets/members/*.{png,jpg,jpeg,webp,avif}",
  { eager: true },
);

/**
 * Maps a bare filename (e.g. "sunpy.png") to its processed Astro ImageMetadata.
 * Throws at build time if a member's logo file is missing from the assets dir.
 */
export const memberLogoMap = Object.fromEntries(
  Object.entries(logoModules).map(([path, mod]) => [
    path.split("/").pop(),
    mod.default,
  ]),
) as Record<string, ImageMetadata>;
