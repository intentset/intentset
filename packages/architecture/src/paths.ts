/**
 * Repository-relative POSIX path arithmetic. The repository root is "" and a
 * path never starts with "/" or "./". Anything that climbs above the root is
 * null, never clamped, because a path outside the repository is not a file
 * this checker may attribute (VSA §3).
 */

/** Join and normalize; null when the result leaves the repository. */
export function joinPath(base: string, relative: string): string | null {
  const out: string[] = base === "" ? [] : base.split("/");
  for (const segment of relative.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(segment);
  }
  return out.join("/");
}

export function dirname(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** The directory and each ancestor up to the root (""), nearest first. */
export function ancestors(directory: string): string[] {
  const out: string[] = [];
  let current = directory;
  for (;;) {
    out.push(current);
    if (current === "") return out;
    current = dirname(current);
  }
}

/** A path relative to a directory, or null when it is not inside it. */
export function within(directory: string, path: string): string | null {
  if (directory === "") return path;
  if (path === directory) return "";
  return path.startsWith(`${directory}/`) ? path.slice(directory.length + 1) : null;
}

export const CODE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

/** A file whose imports this checker reads. Declaration files included: their imports are type-only but still edges. */
export function isCode(path: string): boolean {
  return CODE_EXTENSIONS.some((extension) => path.endsWith(extension));
}
