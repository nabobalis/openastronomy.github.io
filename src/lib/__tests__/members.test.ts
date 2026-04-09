import { describe, it, expect } from "vitest";
import { buildRepositoryLinks, buildSocialLinks } from "../members.ts";

// ---------------------------------------------------------------------------
// buildRepositoryLinks
// ---------------------------------------------------------------------------

describe("buildRepositoryLinks", () => {
  it("returns an empty array when repositories is undefined", () => {
    expect(buildRepositoryLinks(undefined, "myorg")).toEqual([]);
  });

  it("returns an empty array for an empty object", () => {
    expect(buildRepositoryLinks({}, "myorg")).toEqual([]);
  });

  it("builds a github link from a known provider", () => {
    const [link] = buildRepositoryLinks(
      { github: "astropy/astropy" },
      "astropy",
    );
    expect(link.href).toBe("https://github.com/astropy/astropy");
    expect(link.label).toBe("astropy/astropy");
  });

  it("builds a bitbucket link from a known provider", () => {
    const [link] = buildRepositoryLinks(
      { bitbucket: "myteam/myrepo" },
      "myorg",
    );
    expect(link.href).toBe("https://bitbucket.com/myteam/myrepo");
    expect(link.label).toBe("myteam/myrepo");
  });

  it("builds a sourceforge link from a known provider", () => {
    const [link] = buildRepositoryLinks({ sourceforge: "my-project" }, "myorg");
    expect(link.href).toBe("https://sourceforge.net/projects/my-project");
    expect(link.label).toBe("my-project");
  });

  it("uses the raw value as href and memberKey as label for unknown providers", () => {
    const [link] = buildRepositoryLinks(
      { gitlab: "https://gitlab.com/org/repo" },
      "org",
    );
    expect(link.href).toBe("https://gitlab.com/org/repo");
    expect(link.label).toBe("org");
  });

  it("handles multiple providers", () => {
    const links = buildRepositoryLinks(
      { github: "org/repo", bitbucket: "org/repo2" },
      "org",
    );
    expect(links).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// buildSocialLinks
// ---------------------------------------------------------------------------

describe("buildSocialLinks", () => {
  it("returns an empty array when microblogging is undefined", () => {
    expect(buildSocialLinks(undefined)).toEqual([]);
  });

  it("returns an empty array for an empty object", () => {
    expect(buildSocialLinks({})).toEqual([]);
  });

  it("builds an X (Twitter) link", () => {
    const [link] = buildSocialLinks({ x: "astropy" });
    expect(link.href).toBe("https://x.com/astropy");
    expect(link.label).toBe("@astropy");
  });

  it("builds a Mastodon link from a valid @user@instance handle", () => {
    const [link] = buildSocialLinks({
      mastodon: "@astropy@mastodon.social",
    });
    expect(link.href).toBe("https://mastodon.social/@astropy");
    expect(link.label).toBe("@astropy@mastodon.social");
  });

  it("skips Mastodon entries with malformed handles", () => {
    // A handle without the @instance part cannot be resolved
    expect(buildSocialLinks({ mastodon: "astropy" })).toEqual([]);
  });

  it("silently ignores unsupported platforms", () => {
    expect(buildSocialLinks({ bluesky: "astropy.bsky.social" })).toEqual([]);
  });

  it("handles multiple platforms", () => {
    const links = buildSocialLinks({
      x: "astropy",
      mastodon: "@astropy@mastodon.social",
    });
    expect(links).toHaveLength(2);
  });
});
