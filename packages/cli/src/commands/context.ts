/**
 * `intentset context <ID>` (Core §10): the bounded context an engineer or an
 * agent loads before changing implementation. For a behavior, rule,
 * capability or slice: the owning slice (through the derived side of
 * `implements`), every behavior that slice implements, their rules and
 * scenarios, the slice's exposed and consumed contracts, the decisions that
 * inform any of them, and the verification definitions over the behaviors,
 * rules and scenarios. Each artifact comes with its source path, and the
 * whole names its snapshot.
 *
 * `restricted` artifacts are withheld unless asked for, and the report says
 * how many, so a short context never reads as a complete one. Never writes.
 */
import { type Artifact, type ArtifactType, type Graph, type LinkKind, incomingEdges, outgoing } from "@intentset/core";
import { count, formatDiagnostic, type Io, json, snapshotLine, TOOL } from "../output.ts";
import { compareStrings } from "../repository.ts";
import type { Session } from "../session.ts";
import { unresolved, validationLine, validationSummary } from "./shared.ts";

/** The types context is defined for (Core §10 starts from a behavior; these reach one). */
export const CONTEXT_TYPES: readonly ArtifactType[] = ["behavior", "rule", "capability", "slice"];

/** The order sections appear in, and their headings. Each type is one section. */
const SECTIONS: readonly { type: ArtifactType; heading: string }[] = [
  { type: "capability", heading: "Capability" },
  { type: "slice", heading: "Owning slice" },
  { type: "behavior", heading: "Behaviors" },
  { type: "rule", heading: "Rules" },
  { type: "scenario", heading: "Scenarios" },
  { type: "contract", heading: "Contracts" },
  { type: "decision", heading: "Decisions" },
  { type: "verification", heading: "Verification definitions" },
];

/** "an intent", "a behavior", "a knowledge artifact". */
function aType(type: ArtifactType): string {
  const noun = type === "knowledge" ? "knowledge artifact" : type;
  return `${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun}`;
}

/** Core §10: the IDs in the bounded context of `start`, which must be one of CONTEXT_TYPES. */
export function contextIds(graph: Graph, start: Artifact): Set<string> {
  const has = (id: string) => graph.artifacts.has(id);
  const from = (ids: Iterable<string>, kind: LinkKind) =>
    [...ids].flatMap((id) => outgoing(graph, id, kind).map((edge) => edge.to)).filter(has);
  const into = (ids: Iterable<string>, kind: LinkKind) =>
    [...ids].flatMap((id) => incomingEdges(graph, id, kind).map((edge) => edge.from)).filter(has);
  const id = start.meta.id;

  const behaviors = new Set<string>();
  const slices = new Set<string>();
  const rules = new Set<string>();
  const capabilities = new Set<string>();
  switch (start.meta.type) {
    case "behavior":
      behaviors.add(id);
      break;
    case "rule":
      rules.add(id);
      for (const b of into([id], "governedBy")) behaviors.add(b);
      break;
    case "slice":
      slices.add(id);
      break;
    case "capability": {
      // The behaviors under this capability and its sub-capabilities, with a visited set. Only the
      // start is loaded as a capability: sub-capabilities are passed through, not put in view.
      capabilities.add(id);
      const seen = new Set([id]);
      const queue = [id];
      while (queue.length > 0) {
        for (const child of into([queue.shift() as string], "parent")) {
          const type = graph.artifacts.get(child)?.meta.type;
          if (type === "behavior") behaviors.add(child);
          else if (type === "capability" && !seen.has(child)) {
            seen.add(child);
            queue.push(child);
          }
        }
      }
      break;
    }
    default:
      break;
  }
  for (const s of into(behaviors, "implements")) slices.add(s);
  for (const b of from(slices, "implements")) behaviors.add(b);
  for (const r of from(behaviors, "governedBy")) rules.add(r);
  const scenarios = new Set(into(behaviors, "illustrates"));
  const contracts = new Set([...from(slices, "exposes"), ...from(slices, "consumes")]);
  const decisions = new Set(from([...slices, ...contracts, ...behaviors], "informedBy"));
  const verifications = new Set(into([...behaviors, ...rules, ...scenarios], "verifies"));
  return new Set([
    ...capabilities,
    ...slices,
    ...behaviors,
    ...rules,
    ...scenarios,
    ...contracts,
    ...decisions,
    ...verifications,
  ]);
}

export function contextCommand(
  session: Session,
  id: string,
  level: string,
  includeRestricted: boolean,
  asJson: boolean,
  io: Io,
): number {
  const { graph } = session.result;
  const start = graph.artifacts.get(id);
  if (start === undefined) {
    const diagnostic = unresolved(id, session);
    if (asJson) {
      io.stdout(
        json({
          tool: TOOL,
          snapshot: session.snapshot,
          validation: validationSummary(session, level),
          start: null,
          diagnostics: [diagnostic],
        }),
      );
    } else {
      io.stderr(formatDiagnostic(diagnostic));
    }
    return 1;
  }
  if (!CONTEXT_TYPES.includes(start.meta.type)) {
    io.stderr(
      `intentset context: ${id} is ${aType(start.meta.type)}; context starts from a ${CONTEXT_TYPES.slice(0, -1).join(", ")} or ${CONTEXT_TYPES.at(-1)}.\n` +
        `Try \`intentset impact ${id}\` to see what links to it.\n`,
    );
    return 2;
  }

  const all = [...contextIds(graph, start)].map((each) => graph.artifacts.get(each) as Artifact);
  const included = all.filter((a) => includeRestricted || a.meta.visibility !== "restricted");
  const withheld = all.length - included.length;
  const order = (a: Artifact) => SECTIONS.findIndex((s) => s.type === a.meta.type);
  included.sort((a, b) => order(a) - order(b) || compareStrings(a.meta.id, b.meta.id));
  const visible = new Set(included.map((a) => a.meta.id));

  if (asJson) {
    io.stdout(
      json({
        tool: TOOL,
        snapshot: session.snapshot,
        validation: validationSummary(session, level),
        start: id,
        included: included.length,
        withheld,
        restrictedIncluded: includeRestricted,
        artifacts: included.map((a) => ({
          id: a.meta.id,
          type: a.meta.type,
          title: a.meta.title,
          status: a.meta.status,
          visibility: a.meta.visibility,
          path: a.path,
          sourceHash: a.sourceHash,
          links: links(graph, a, visible),
          body: a.body,
        })),
        diagnostics: [],
      }),
    );
  } else {
    io.stdout(renderMarkdown(session, start, included, withheld, includeRestricted, level, visible));
  }
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

function renderMarkdown(
  session: Session,
  start: Artifact,
  included: Artifact[],
  withheld: number,
  includeRestricted: boolean,
  level: string,
  visible: Set<string>,
): string {
  const { graph } = session.result;
  const out: string[] = [
    `# Context for ${start.meta.id}`,
    "",
    `Bounded engineering context (Core §10) for ${start.meta.type} ${start.meta.id}, "${start.meta.title}".`,
    "",
    `- ${snapshotLine(session.snapshot)}`,
    `- ${validationLine(session, level)}`,
    `- Included: ${count(included.length, "artifact")}. ` +
      (includeRestricted
        ? "Restricted artifacts are included, as asked."
        : `Withheld: ${withheld} restricted${withheld === 0 ? "" : "; pass --include-restricted to include them"}.`),
    "- Paths are relative to the repository root. The files are authoritative; this is a derived view of them.",
    "",
  ];
  for (const section of SECTIONS) {
    const members = included.filter((a) => a.meta.type === section.type);
    if (members.length === 0) continue;
    out.push(`## ${section.heading}`, "");
    for (const a of members) {
      out.push(`### ${a.meta.id}: ${a.meta.title}`, "");
      out.push(`- ID: ${a.meta.id}`, `- Type: ${a.meta.type}`, `- Status: ${a.meta.status}`, `- Path: ${a.path}`);
      const linked = links(graph, a, visible);
      const kinds = (Object.keys(linked) as LinkKind[]).sort(compareStrings);
      if (kinds.length > 0) out.push(`- Links: ${kinds.map((k) => `${k} ${linked[k]?.join(", ")}`).join("; ")}`);
      out.push("", ...fenced(a.body), "");
    }
  }
  return `${out.join("\n").trimEnd()}\n`;
}

/** The body verbatim, in a tilde fence longer than any tilde run inside it, so nothing in it can close the fence. */
function fenced(body: string): string[] {
  const text = body.replace(/^\s*\n/, "").trimEnd();
  const longest = Math.max(0, ...[...text.matchAll(/~+/g)].map((m) => m[0].length));
  const fence = "~".repeat(Math.max(4, longest + 1));
  return [`${fence}markdown`, text, fence];
}
