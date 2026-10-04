/**
 * `intentset context <ID>` (Core §10): the bounded context an engineer or an
 * agent loads before changing implementation, from core's `contextFor`: for
 * a behavior, its owning slice, rules, scenarios, verifications, the slice's
 * contracts, the decisions, the knowledge explaining it and its navigation
 * parents; for a rule, capability or slice the bundles of the behaviors it
 * reaches; for anything else its direct neighbours. Each artifact comes with
 * its source path and body, and the whole names its snapshot.
 *
 * `restricted` artifacts are withheld unless asked for, and the report says
 * how many, so a short context never reads as a complete one. Never writes.
 *
 * Given a file rather than an ID, it reads the context of the slice whose
 * claims include the file, since an agent about to edit code knows the file
 * and not the ID of what it promises.
 */
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  type Artifact,
  type ContextArtifact,
  type ContextRole,
  compareStrings,
  contextFor,
  type Graph,
  type LinkKind,
} from "@intentset/core";
import { count, formatDiagnostic, type Io, json, snapshotLine, TOOL } from "../output.ts";
import type { Session } from "../session.ts";
import { claimingSlices } from "../slices.ts";
import { unresolved, validationLine, validationSummary } from "./shared.ts";

/**
 * The artifact a `context` argument names: itself when it is an ID, else the
 * one slice whose claims include it as a file path, relative to the working
 * directory. Several claiming slices are an overlap VSA reports; the caller
 * is asked to choose.
 */
export function resolveTarget(
  session: Session,
  argument: string,
  cwd: string,
): { id: string; path: string | null } | { path: string; slices: string[] } {
  const graph = session.result.graph;
  if (graph.artifacts.has(argument)) return { id: argument, path: null };
  const absolute = isAbsolute(argument) ? argument : resolve(cwd, argument);
  const path = relative(session.repo.root, absolute).split(sep).join("/");
  const slices = claimingSlices(graph, path).map((slice) => slice.meta.id);
  if (slices.length === 1) return { id: slices[0], path };
  return { path, slices };
}

const HEADINGS: Record<ContextRole, string> = {
  start: "Start",
  owner: "Owning slice",
  behavior: "Behaviors",
  rule: "Rules",
  scenario: "Scenarios",
  verification: "Verification definitions",
  contract: "Contracts",
  decision: "Decisions",
  knowledge: "Knowledge",
  ancestor: "Navigation ancestors",
  neighbour: "Neighbours",
};

export function contextCommand(
  session: Session,
  argument: string,
  includeRestricted: boolean,
  asJson: boolean,
  io: Io,
): number {
  const { graph } = session.result;
  const target = resolveTarget(session, argument, io.cwd);
  if ("slices" in target && target.slices.length > 1) {
    io.stderr(
      `intentset context: ${target.path} is claimed by ${target.slices.join(" and ")}, an overlap VSA reports; ` +
        "name one of them.\n",
    );
    return 2;
  }
  const via = "id" in target ? target.path : null;
  const id = "id" in target ? target.id : argument;
  const bundle = contextFor(graph, id, { includeRestricted });
  if (bundle === null) {
    const diagnostic = unresolved(id, session);
    if (asJson) {
      io.stdout(
        json({
          tool: TOOL,
          snapshot: session.snapshot,
          validation: validationSummary(session, session.level),
          start: null,
          diagnostics: [diagnostic],
        }),
      );
    } else {
      io.stderr(formatDiagnostic(diagnostic));
    }
    return 1;
  }
  const visible = new Set(bundle.artifacts.map((a) => a.id));
  const full = (a: ContextArtifact) => graph.artifacts.get(a.id) as Artifact;

  if (asJson) {
    io.stdout(
      json({
        tool: TOOL,
        snapshot: session.snapshot,
        validation: validationSummary(session, session.level),
        start: id,
        ...(via === null ? {} : { resolvedFrom: via }),
        included: bundle.artifacts.length,
        withheld: bundle.withheld,
        restrictedIncluded: includeRestricted,
        artifacts: bundle.artifacts.map((a) => ({
          ...a,
          sourceHash: full(a).sourceHash,
          links: links(graph, full(a), visible),
          body: full(a).body,
        })),
        diagnostics: [],
      }),
    );
    return session.result.ok ? 0 : 1;
  }

  const start = graph.artifacts.get(id) as Artifact;
  const out: string[] = [
    `# Context for ${id}`,
    "",
    `Bounded engineering context (Core §10) for ${start.meta.type} ${id}, "${start.meta.title}".`,
    ...(via === null ? [] : ["", `${via} is claimed by ${id}, so this is that slice's context.`]),
    "",
    `- ${snapshotLine(session.snapshot)}`,
    `- ${validationLine(session, session.level)}`,
    `- Included: ${count(bundle.artifacts.length, "artifact")}. ` +
      (includeRestricted
        ? "Restricted artifacts are included, as asked."
        : `Withheld: ${bundle.withheld} restricted${bundle.withheld === 0 ? "" : "; pass --include-restricted to include them"}.`),
    "- Paths are relative to the repository root. The files are authoritative; this is a derived view of them.",
    "",
  ];
  let role: ContextRole | null = null;
  for (const a of bundle.artifacts) {
    if (a.role !== role) {
      role = a.role;
      out.push(`## ${HEADINGS[role]}`, "");
    }
    out.push(`### ${a.id}: ${a.title}`, "");
    out.push(`- ID: ${a.id}`, `- Type: ${a.type}`, `- Status: ${a.status}`, `- Path: ${a.path}`);
    const linked = links(graph, full(a), visible);
    const kinds = (Object.keys(linked) as LinkKind[]).sort(compareStrings);
    if (kinds.length > 0) out.push(`- Links: ${kinds.map((k) => `${k} ${linked[k]?.join(", ")}`).join("; ")}`);
    out.push("", ...fenced(full(a).body), "");
  }
  io.stdout(`${out.join("\n").trimEnd()}\n`);
  return session.result.ok ? 0 : 1;
}

/** Authored links from `artifact` to artifacts in the context, so nothing withheld is named. */
function links(graph: Graph, artifact: Artifact, visible: Set<string>): Partial<Record<LinkKind, string[]>> {
  const out: Partial<Record<LinkKind, string[]>> = {};
  for (const edge of graph.out.get(artifact.meta.id) ?? []) {
    if (!visible.has(edge.to)) continue;
    const list = out[edge.kind];
    if (list === undefined) out[edge.kind] = [edge.to];
    else if (!list.includes(edge.to)) list.push(edge.to);
  }
  for (const list of Object.values(out)) list?.sort(compareStrings);
  return out;
}

/** The body verbatim, in a tilde fence longer than any tilde run inside it, so nothing in it can close the fence. */
function fenced(body: string): string[] {
  const text = body.replace(/^\s*\n/, "").trimEnd();
  const longest = Math.max(0, ...[...text.matchAll(/~+/g)].map((m) => m[0].length));
  const fence = "~".repeat(Math.max(4, longest + 1));
  return [`${fence}markdown`, text, fence];
}
