/**
 * Link and image URLs a published page or fragment may carry (publication §2).
 *
 * render-html drops raw HTML from the source but checks no URL scheme, so a
 * knowledge body's `[text](javascript:…)` would reach the page, and a
 * fragment is made to be inserted into a product's own DOM. Before either is
 * rendered, every link, image and definition is checked here, on a copy of
 * the tree: http, https, mailto and a URL with no scheme (a relative path or
 * a `#fragment`) pass, and anything else is removed, deny by default. A link
 * keeps its text and an image its alt text; a reference whose definition is
 * removed keeps its text in the same way, and the definition goes.
 *
 * The scheme is read as a browser reads it: ASCII tab, line feed and carriage
 * return are removed wherever they are, and C0 controls and spaces before the
 * first other character are skipped, so " JaVaScript:" and "java\tscript:"
 * are both javascript. Deterministic, and no parser beyond the tree Markset
 * already gives.
 */

const ALLOWED_SCHEMES = new Set(["http", "https", "mailto"]);

/** Whether a URL may be carried: its scheme is http, https or mailto, or it has none. */
export function safeUrl(url: string): boolean {
  const removed = url.replace(/[\t\n\r]/g, "");
  let start = 0;
  while (start < removed.length && removed.charCodeAt(start) <= 0x20) start++;
  const read = removed.slice(start);
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(read)?.[1];
  return scheme === undefined || ALLOWED_SCHEMES.has(scheme.toLowerCase());
}

interface TreeNode {
  type: string;
  url?: string;
  alt?: string | null;
  identifier?: string;
  value?: string;
  [key: string]: unknown;
}

function isNode(value: unknown): value is TreeNode {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}

/** A copy of the tree with every link, image and definition whose URL is not safe removed, their text kept. */
export function withSafeUrls<T>(tree: T): T {
  const root = structuredClone(tree) as unknown;
  if (!isNode(root)) return tree;
  // The first definition of an identifier is the one references use (CommonMark), so only its URL decides.
  const definitions = new Map<string, boolean>();
  const collect = (node: TreeNode): void => {
    if (node.type === "definition" && node.identifier !== undefined && !definitions.has(node.identifier)) {
      definitions.set(node.identifier, safeUrl(node.url ?? ""));
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) for (const child of value) if (isNode(child)) collect(child);
    }
  };
  collect(root);
  const unsafeReference = (node: TreeNode) =>
    node.identifier !== undefined && definitions.get(node.identifier) === false;

  const rewrite = (node: TreeNode): void => {
    for (const [key, value] of Object.entries(node)) {
      if (!Array.isArray(value) || !value.some(isNode)) continue;
      const kept: unknown[] = [];
      for (const child of value) {
        if (!isNode(child)) {
          kept.push(child);
          continue;
        }
        rewrite(child);
        const unsafe =
          ((child.type === "link" || child.type === "image" || child.type === "definition") &&
            !safeUrl(child.url ?? "")) ||
          ((child.type === "linkReference" || child.type === "imageReference") && unsafeReference(child));
        if (!unsafe) kept.push(child);
        else if (child.type === "link" || child.type === "linkReference")
          kept.push(...(Array.isArray(child.children) ? child.children : []));
        else if ((child.type === "image" || child.type === "imageReference") && child.alt) {
          kept.push({ type: "text", value: child.alt });
        }
      }
      node[key] = kept;
    }
  };
  rewrite(root);
  return root as T;
}
