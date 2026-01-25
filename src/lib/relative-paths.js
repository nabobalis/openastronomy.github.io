const PROTOCOL_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

export const getRelativeRoot = (pathname = "/") => {
  const cleanPath = String(pathname).split("?")[0].split("#")[0];
  const depth = cleanPath.split("/").filter(Boolean).length;
  return depth === 0 ? "./" : "../".repeat(depth);
};

export const fromSiteRoot = (pathname, targetPath) => {
  const relativeRoot = getRelativeRoot(pathname);
  const normalizedTarget = String(targetPath ?? "").replace(/^\/+/, "");
  return normalizedTarget ? `${relativeRoot}${normalizedTarget}` : relativeRoot;
};

export const localizeHref = (pathname, href) => {
  const value = String(href ?? "");
  if (!value) return value;
  if (value.startsWith("#")) return value;
  if (value.startsWith("//") || PROTOCOL_RE.test(value)) return value;
  if (value.startsWith("/")) return fromSiteRoot(pathname, value);
  return value;
};
