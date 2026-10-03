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
 */
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
import { unresolved, validationLine, validationSummary } from "./shared.ts";

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
  id: string,
  includeRestricted: boolean,
  asJson: boolean,
  io: Io,
): number {
  const { graph } = session.result;
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
