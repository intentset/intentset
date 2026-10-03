/**
 * `intentset review` (Core §10): the local review report. Validation at the
 * highest level the inputs allow (L2 always; L4 when run records are given
 * or found, since L3's evidence is the only input L4 needs beyond it), the
 * architecture summary, coverage, and the impact of the change: every file
 * changed since the base, committed or not, mapped to the artifacts it
 * touches, a changed record to its own artifact and a changed source file
 * through the claiming slice to that slice's behaviors, each start's direct
 * dependents shown apart from its candidates. Markdown by default. Read-only.
 */
import { type Graph, impact, compareStrings } from "@intentset/core";
import { type Changes, changedFiles, chooseBase } from "../git.ts";
import { matchGlob } from "../glob.ts";
import { count, formatDiagnostic, type Io, json, snapshotLine, TOOL } from "../output.ts";
import { levelJson, levelSections } from "../reports.ts";
import type { Session } from "../session.ts";
import { pathText, REACHABILITY_NOTE } from "./impact.ts";

export interface Attribution {
  /** The artifact impact starts from. */
  start: string;
  /** The changed files that led to it, and how. */
  because: string[];
}

/** Map changed files to impact starts. A path that is a record names its artifact; a claimed source file names the claiming slices' behaviors. */
export function attribute(graph: Graph, changed: readonly string[]): { starts: Attribution[]; unattributed: string[] } {
  const byPath = new Map<string, string>();
  for (const [id, artifact] of graph.artifacts) byPath.set(artifact.path, id);
  const slices = [...graph.artifacts.values()]
    .filter((a) => a.meta.type === "slice" && a.meta.status !== "retired" && a.meta.slice !== undefined)
    .sort((a, b) => compareStrings(a.meta.id, b.meta.id));
  const starts = new Map<string, Set<string>>();
  const add = (id: string, reason: string) => {
    const set = starts.get(id) ?? new Set<string>();
    set.add(reason);
    starts.set(id, set);
  };
  const unattributed: string[] = [];
  for (const path of changed) {
    const id = byPath.get(path);
    if (id !== undefined) {
      add(id, `${path} is its record`);
      continue;
    }
    const owners = slices.filter((slice) => slice.meta.slice?.claims.some((claim) => matchGlob(claim.path, path)));
    let attributed = false;
    for (const slice of owners) {
      for (const behavior of slice.meta.links.implements ?? []) {
        if (!graph.artifacts.has(behavior)) continue;
        add(behavior, `${path} is claimed by ${slice.meta.id}, which implements it`);
        attributed = true;
      }
    }
    if (!attributed) unattributed.push(path);
  }
  return {
    starts: [...starts.keys()]
      .sort(compareStrings)
      .map((start) => ({ start, because: [...(starts.get(start) as Set<string>)].sort(compareStrings) })),
    unattributed,
  };
}

export function reviewCommand(
  session: Session,
  options: { base?: string; levelReason: string },
  asJson: boolean,
  io: Io,
): number {
  const { repo, result, snapshot } = session;
  const graph = result.graph;
  const chosen = chooseBase(repo.root, options.base);
  if (chosen === null) {
    io.stderr(`intentset review: --base ${options.base} names no commit.\n`);
    return 2;
  }
  const base = "unavailable" in chosen ? null : chosen;
  const changes: Changes = { base, ...changedFiles(repo.root, base) };
  if ("unavailable" in chosen) changes.baseUnavailable = chosen.unavailable;
  const changed = [...new Set([...changes.committed, ...changes.uncommitted])].sort(compareStrings);
  const { starts, unattributed } = attribute(graph, changed);
  const impacts = starts.map(({ start, because }) => {
    const artifact = graph.artifacts.get(start);
    const report = impact(graph, start);
    return {
      start,
      type: artifact?.meta.type,
      title: artifact?.meta.title,
      because,
      direct: report.direct,
      candidates: report.candidates,
    };
  });

  if (asJson) {
    io.stdout(
      json({
        tool: TOOL,
        snapshot,
        level: session.level,
        levelReason: options.levelReason,
        changes,
        validation: {
          summary: { artifacts: graph.artifacts.size, errors: session.errors, warnings: session.warnings },
          diagnostics: session.diagnostics,
        },
        ...levelJson(session),
        note: REACHABILITY_NOTE,
        impact: impacts,
        unattributed,
      }),
    );
    return session.errors > 0 ? 1 : 0;
  }

  const baseLine =
    base === null
      ? `- Base: none (${changes.baseUnavailable}); only uncommitted changes are considered`
      : `- Base: ${base.ref}, ${base.commit}`;
  const out = [
    "# Review",
    "",
    `- ${snapshotLine(snapshot)}`,
    baseLine,
    `- Changed: ${count(changed.length, "file")} (${changes.committed.length} committed since the base, ${changes.uncommitted.length} uncommitted)`,
    `- Level: ${session.level}, ${options.levelReason}`,
    "",
    "## Validation",
    "",
    `${count(graph.artifacts.size, "artifact")}, ${count(session.errors, "error")}, ${count(session.warnings, "warning")} (level ${session.level}, scope: ${repo.config.scope.join(", ")})`,
  ];
  if (session.diagnostics.length > 0) {
    out.push("", "```text", ...session.diagnostics.map((d) => formatDiagnostic(d).trimEnd()), "```");
  }
  const sections = levelSections(session);
  if (sections.length > 0) out.push("", "## Checks above L1", "", "```text", ...sections.slice(1), "```");
  out.push("", "## Impact of the change", "", REACHABILITY_NOTE);
  if (impacts.length === 0)
    out.push("", "No changed file is a record or is claimed by a slice, so nothing was traversed.");
  for (const item of impacts) {
    out.push("", `### ${item.start}: ${item.title}`, "", ...item.because.map((reason) => `- Changed: ${reason}`), "");
    out.push(`Direct (${item.direct.length}), one link away:`);
    if (item.direct.length === 0) out.push("- none");
    for (const hit of item.direct) out.push(`- ${hit.id} (${hit.type}): \`${pathText(item.start, hit)}\``);
    out.push("", `Candidates (${item.candidates.length}), reachable beyond, for review:`);
    if (item.candidates.length === 0) out.push("- none");
    for (const hit of item.candidates) out.push(`- ${hit.id} (${hit.type}): \`${pathText(item.start, hit)}\``);
  }
  out.push("", `## Changed files no artifact accounts for (${unattributed.length})`, "");
  if (unattributed.length === 0) out.push("None.");
  else out.push(...unattributed.map((path) => `- ${path}`));
  io.stdout(`${out.join("\n")}\n`);
  return session.errors > 0 ? 1 : 0;
}
