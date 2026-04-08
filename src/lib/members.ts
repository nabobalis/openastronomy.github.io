/**
 * Utility functions for building member card data from `members.json` entries.
 *
 * Extracted from `MemberCard.astro` so the data-transformation logic can be
 * tested independently of the Astro component runtime.
 */

import icons from "../data/icons.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RepositoryLink = {
  href: string;
  label: string;
  icon: string;
  viewBox: string;
  height: string | undefined;
};

export type SocialLink = {
  href: string;
  label: string;
  icon: string;
};

// ---------------------------------------------------------------------------
// Known repository providers
// ---------------------------------------------------------------------------

/**
 * Map of known repository host keys (as used in `members.json`) to their URL
 * builder and SVG icon configuration.
 *
 * The `height` field controls the SVG element's height attribute; `undefined`
 * lets it default to its natural size.
 */
const repoProviders: Record<
  string,
  {
    href: (repo: string) => string;
    icon: string;
    viewBox: string;
    height: string | undefined;
  }
> = {
  github: {
    href: (repo) => `https://github.com/${repo}`,
    icon: icons.gh_logo,
    viewBox: "0 0 16 16",
    height: undefined,
  },
  bitbucket: {
    href: (repo) => `https://bitbucket.com/${repo}`,
    icon: icons.bb_logo,
    viewBox: "0 0 30 30",
    height: "50%",
  },
  sourceforge: {
    href: (repo) => `https://sourceforge.net/projects/${repo}`,
    icon: icons.sf_logo,
    viewBox: "0 0 15 10",
    height: "50%",
  },
};

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Builds the list of repository links for a member card.
 *
 * For known providers (github, bitbucket, sourceforge) the href is constructed
 * from the repo identifier. For unknown providers the raw value is used as the
 * href and the github icon is used as a fallback.
 *
 * @param repositories - The `repositories` field from a `members.json` entry
 *   (e.g. `{ github: "astropy/astropy" }`).
 * @param memberKey - The member's slug key, used as a fallback label for unknown providers.
 * @returns Array of repository link descriptors.
 */
export const buildRepositoryLinks = (
  repositories: Record<string, string> | undefined,
  memberKey: string,
): RepositoryLink[] => {
  if (!repositories) return [];
  return Object.entries(repositories).map(([provider, repo]) => {
    const known = repoProviders[provider];
    if (known) {
      return {
        href: known.href(repo),
        label: repo,
        icon: known.icon,
        viewBox: known.viewBox,
        height: known.height,
      };
    }
    // Unknown provider: use the raw value as a URL with the github icon as fallback
    return {
      href: repo,
      label: memberKey,
      icon: icons.gh_logo,
      viewBox: "0 0 16 16",
      height: undefined,
    };
  });
};

/**
 * Builds the list of social/microblogging links for a member card.
 *
 * Supported platforms: `x` (formerly Twitter), `mastodon`.
 * Unsupported platforms are silently ignored (returns nothing for that entry).
 *
 * For Mastodon the handle is expected in the format `@username@instance.social`.
 * Malformed handles (missing the two `@` separators) are skipped.
 *
 * @param microblogging - The `microblogging` field from a `members.json` entry
 *   (e.g. `{ x: "astropy" }` or `{ mastodon: "@astropy@mastodon.social" }`).
 * @returns Array of social link descriptors (only supported platforms included).
 */
export const buildSocialLinks = (
  microblogging: Record<string, string> | undefined,
): SocialLink[] => {
  if (!microblogging) return [];
  return Object.entries(microblogging)
    .map(([platform, handle]) => {
      if (platform === "x") {
        return {
          href: `https://x.com/${handle}`,
          label: `@${handle}`,
          icon: icons.x_logo,
        };
      }
      if (platform === "mastodon") {
        // Handle format: @username@instance.social — split on @ to get host
        const [, username, host] = handle.split("@");
        if (!username || !host) return null; // malformed handle
        return {
          href: `https://${host}/@${username}`,
          label: handle,
          icon: icons.mastodon_logo,
        };
      }
      return null;
    })
    .filter((link): link is SocialLink => link !== null);
};
