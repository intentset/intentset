/**
 * The `nextjs` rule set (spec/profile-typescript-nextjs-0.4.md): four rules for a Next.js application, read from
 * source and from the profile, and nothing run.
 *
 *   NEXT001  client code imports server-only code
 *   NEXT002  a route file imports a package that reaches outside
 *   NEXT003  client code, in a seam or outside every slice, imports a package that reaches outside
 *   NEXT004  a middleware file imports a package that reaches outside
 *
 * A file is client code when it opens with `"use client"` or a client file imports it, by a value import, however
 * far down. It is server-only when it imports the `server-only` package or matches a `serverOnly` pattern. A file
 * that opens with `"use server"` holds server actions: it runs on the server, and client code may import it, since
 * the import is a call across the network and puts none of its code in the browser. A file that is none of these is
 * not judged, and the check says how many were not (design invariant 6).
 *
 * The seam itself is VSA015's: a package the profile lists in `outsidePackages` is imported only from the seam
 * layer. NEXT003 reports what VSA015 cannot see, a seam file that is client code, and never the same import twice.
 */
import { type Finding, finding } from "./finding.ts";
import { type ImportEdge, type ImportGraph, takenBy } from "./imports.ts";
import { inSeam, isPure } from "./layers.ts";
import { compareStrings, matchAny } from "./patterns.ts";
import type { Model } from "./regions.ts";

const SERVER_ONLY_PACKAGE = "server-only";

function how(edge: ImportEdge): string {
  const kind = edge.reexport
    ? "re-exports"
    : edge.dynamic
      ? "dynamically imports"
      : edge.typeOnly
        ? "type-imports"
        : "imports";
  return `${kind} "${edge.specifier}"`;
}

export function checkNextjs(model: Model, imports: ImportGraph): { findings: Finding[]; unresolved: string[] } {
  const { config } = model;
  const findings: Finding[] = [];
  const judged = (path: string) =>
    model.reader.isSource(path) && model.inScope(path) && !model.isTest(path) && !model.underBackend(path);
  const says = (path: string, directive: string) => (imports.directives.get(path) ?? []).includes(directive);
  const isMiddleware = (path: string) => matchAny(config.middlewareFiles, path);
  const outside = (edge: ImportEdge) =>
    edge.to === null && matchAny(config.outsidePackages, edge.specifier.replace(/^node:/, ""));

  const from = new Map<string, ImportEdge[]>();
  for (const edge of imports.edges) {
    const list = from.get(edge.from) ?? [];
    list.push(edge);
    from.set(edge.from, list);
  }
  const marksServerOnly = new Set<string>();
  for (const edge of imports.edges) {
    if (edge.to === null && edge.specifier === SERVER_ONLY_PACKAGE) marksServerOnly.add(edge.from);
  }
  const serverOnly = (path: string) => marksServerOnly.has(path) || matchAny(config.serverOnly, path);
  const actions = (path: string) => says(path, "use server");

  // Client code: each file that says so, and what it reaches by value imports. The walk stops at server actions,
  // which client code calls, and at server-only files, which it may not reach at all (NEXT001).
  const client = new Map<string, string>();
  const roots = [...model.files.keys()].filter((path) => judged(path) && says(path, "use client")).sort(compareStrings);
  for (const root of roots) {
    const queue = [root];
    while (queue.length > 0) {
      const path = queue.pop() as string;
      if (client.has(path)) continue;
      client.set(path, root);
      for (const edge of from.get(path) ?? []) {
        if (edge.to === null || edge.typeOnly || !judged(edge.to)) continue;
        if (actions(edge.to) || serverOnly(edge.to) || client.has(edge.to)) continue;
        queue.push(edge.to);
      }
    }
  }
  const whose = (path: string) => {
    const root = client.get(path) as string;
    return root === path ? `${path} is client code` : `${path} is client code, imported from ${root}`;
  };

  for (const path of [...client.keys()].sort(compareStrings)) {
    const region = model.regionOf(path);
    const slice = region.kind === "slice" ? model.sliceById.get(region.owner as string) : undefined;
    const artifact = slice?.id ?? null;
    // A file that says "use client" and is server-only by its own path contradicts itself.
    if (client.get(path) === path && matchAny(config.serverOnly, path)) {
      findings.push(
        finding({
          code: "NEXT001",
          artifact,
          path,
          location: { line: 1 },
          message: `${path} says "use client" and matches a serverOnly pattern of the profile, so it is both client code and server-only.`,
          remediation:
            "Move it out of the server-only folder, or remove the directive and import it from server code (NEXT001).",
        }),
      );
    }
    for (const edge of from.get(path) ?? []) {
      if (edge.typeOnly) continue;
      const subject = { edges: [{ from: path, to: edge.to ?? edge.specifier }], taken: takenBy(edge) };
      if (edge.to === null && edge.specifier === SERVER_ONLY_PACKAGE) {
        findings.push(
          finding({
            code: "NEXT001",
            artifact,
            path,
            location: { line: edge.line },
            message: `${whose(path)} and ${how(edge)}, which marks a file as server-only.`,
            remediation: `Keep what must stay on the server in a file client code does not import, and reach it through a server action (NEXT001).`,
            ...subject,
          }),
        );
        continue;
      }
      if (edge.to !== null && judged(edge.to) && serverOnly(edge.to) && !actions(edge.to)) {
        findings.push(
          finding({
            code: "NEXT001",
            artifact,
            path,
            location: { line: edge.line },
            message: `${whose(path)} and ${how(edge)}, the server-only file ${edge.to}.`,
            remediation: `Call a server action, a file that opens with "use server", in place of importing ${edge.to}, or take only its types with \`import type\` (NEXT001).`,
            ...subject,
          }),
        );
        continue;
      }
      // NEXT003, where VSA015 has not already reported this import, and where NEXT002 and NEXT004 will not.
      if (!outside(edge) || region.kind === "composition" || isMiddleware(path)) continue;
      const pure = slice !== undefined && config.roles.pure.length > 0 && isPure(slice, path, config);
      const outsideSeam = slice !== undefined && config.roles.seam !== null && !inSeam(slice, path, config);
      if (pure || outsideSeam) continue;
      findings.push(
        finding({
          code: "NEXT003",
          artifact,
          path,
          location: { line: edge.line },
          message: `${whose(path)} and ${how(edge)}, a package that reaches outside the product, which would run in the browser.`,
          remediation: `Put the call in a server action or a route handler, a file that opens with "use server" or imports server-only, and call that from client code (NEXT003).`,
          ...subject,
        }),
      );
    }
  }

  // Routes and middleware are composition (VSA §6): they wire slices and reach nothing outside themselves.
  for (const path of [...from.keys()].sort(compareStrings)) {
    if (!judged(path)) continue;
    const middleware = isMiddleware(path);
    if (!middleware && model.regionOf(path).kind !== "composition") continue;
    for (const edge of from.get(path) ?? []) {
      if (!outside(edge)) continue;
      findings.push(
        finding({
          code: middleware ? "NEXT004" : "NEXT002",
          artifact: null,
          path,
          location: { line: edge.line },
          message: middleware
            ? `${path} is middleware and ${how(edge)}, a package that reaches outside the product.`
            : `${path} is a route file, which is composition, and ${how(edge)}, a package that reaches outside the product.`,
          remediation: middleware
            ? "Middleware coordinates access: read what the request carries, and leave data to a slice's server code (NEXT004)."
            : "Call a slice through its entrypoint, and let the slice's seam reach the package (VSA §6, NEXT002).",
          edges: [{ from: path, to: edge.specifier }],
          taken: takenBy(edge),
        }),
      );
    }
  }

  // What says nothing is not judged, and that is said (design invariant 6).
  const silent = [...model.files.keys()]
    .filter((path) => judged(path) && !client.has(path) && !serverOnly(path) && !actions(path))
    .sort(compareStrings);
  const unresolved =
    silent.length === 0
      ? []
      : [
          `the server and client boundary was not judged for ${silent.length === 1 ? "1 file" : `${silent.length} files`} that client code does not import and that ${silent.length === 1 ? "says" : "say"} neither "use client" nor "use server", ${silent.length === 1 ? "imports" : "import"} no server-only and ${silent.length === 1 ? "matches" : "match"} no serverOnly pattern: ${silent.slice(0, 3).join(", ")}${silent.length > 3 ? ` and ${silent.length - 3} more` : ""}`,
        ];
  return { findings, unresolved };
}
