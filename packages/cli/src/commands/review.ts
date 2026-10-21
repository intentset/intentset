/**
 * `intentset review` (Core §10): the local review report. Validation at the
 * highest level the inputs allow (L2 always; L4 when run records are given
 * or found, since L3's evidence is the only input L4 needs beyond it), the
 * architecture summary, coverage, and the impact of the change: every file
 * changed since the base, committed or not, mapped to the artifacts it
 * touches, a changed record to its own artifact and a changed source file
 * through the claiming slice to that slice's behaviors, each start's direct
 * dependents shown apart from its candidates. Markdown by default. Read-only.
 *
 * It also lists every slice whose code changed while none of the records that
 * describe it did (Core §10: an agent updates affected semantics in the same
 * review). A refactor changes code and no behavior, so the list is a prompt,
 * not an error: a commit says so with an Intentset-Unchanged trailer, and
 * `--fail-on-drift` fails only on slices no commit has spoken for.
 *
 * With `--baseline`, it compares the baseline with the base's copy (VSA §9:
 * a baseline may shrink and may not grow): the entries the base did not hold,
 * those it held that are gone, those that moved with a renamed file, and
 * cycles replaced by smaller ones, and entries written before 0.9 rewritten
 * in the current form. `--fail-on-baseline-growth` fails on any
 * entry the base did not hold; a deliberate addition is the caller's call.
 */
import {
  type BaselineComparison,
  type BaselineEntry,
  compareBaselines,
  describeEntry,
  parseBaseline,
} from "@intentset/architecture";
import { type Graph, impact, compareStrings } from "@intentset/core";
import {
  acknowledgedSlices,
  type Base,
  type Changes,
  changedFiles,
  chooseBase,
  fileAt,
  renamesSince,
  UNCHANGED_TRAILER,
} from "../git.ts";
import { count, formatDiagnostic, type Io, json, snapshotLine, TOOL } from "../output.ts";
import { levelJson, levelSections } from "../reports.ts";
import type { Session } from "../session.ts";
import { activeSlices, claimingSlices, describingRecords, isSliceCode } from "../slices.ts";
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
    const owners = claimingSlices(graph, path);
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

export interface Drift {
  slice: string;
  title: string;
  /** The slice's changed code: files its source, backend or contract claims match. */
  code: string[];
  /** The records that describe the slice, none of which changed. */
  records: string[];
  /** True when a commit after the base names the slice in an Intentset-Unchanged trailer. */
  acknowledged: boolean;
}

export const DRIFT_NOTE =
  "Slices whose code changed while none of the records that describe them did: the slice, its behaviors, their " +
  "rules, scenarios and verifications, its contracts and their decisions. If behavior changed, update those records " +
  `in this change. If it did not, say so in a commit with the trailer \`${UNCHANGED_TRAILER}: <slice ID>\`.`;

/** Each slice whose code is among the changed files while none of its describing records is, sorted by slice ID. */
export function drift(graph: Graph, changed: readonly string[], acknowledged: ReadonlySet<string>): Drift[] {
  const records = new Set([...graph.artifacts.values()].map((artifact) => artifact.path));
  const touched = new Set(changed);
  const out: Drift[] = [];
  for (const slice of activeSlices(graph)) {
    const code = changed.filter((path) => !records.has(path) && isSliceCode(slice, path));
    if (code.length === 0) continue;
    const describing = describingRecords(graph, slice);
    if (describing.some((id) => touched.has(graph.artifacts.get(id)?.path ?? ""))) continue;
    out.push({
      slice: slice.meta.id,
      title: slice.meta.title,
      code,
      records: describing,
      acknowledged: acknowledged.has(slice.meta.id),
    });
  }
  return out;
}

export interface BaselineReview extends Partial<BaselineComparison> {
  /** The baseline file as given on the command line. */
  file: string;
  /** Entries in it now. */
  entries: number;
  /** Entries in the base's copy; null when the base has none or it could not be compared. */
  atBase: number | null;
  /** Why the comparison was not made, or what it assumed. */
  note?: string;
}

/** The baseline compared with the base's copy, or why it could not be. */
export function reviewBaseline(
  root: string,
  base: Base | null,
  baseline: { given: string; path: string | null; entries: BaselineEntry[] },
): BaselineReview {
  const out: BaselineReview = { file: baseline.given, entries: baseline.entries.length, atBase: null };
  if (base === null) return { ...out, note: "there is no base, so nothing was compared" };
  if (baseline.path === null) return { ...out, note: "the file lies outside the repository, so it has no base copy" };
  const text = fileAt(root, base.commit, baseline.path);
  let atBase: BaselineEntry[] | null = null;
  let note: string | undefined;
  if (text === null) note = "the base has no such file, so every entry is new";
  else {
    try {
      atBase = parseBaseline(text);
    } catch (error) {
      note = `the base's copy could not be read (${(error as Error).message}), so every entry is new`;
    }
  }
  return {
    ...out,
    atBase: atBase === null ? null : atBase.length,
    ...(note === undefined ? {} : { note }),
    ...compareBaselines(atBase, baseline.entries, renamesSince(root, base.commit)),
  };
}

export function reviewCommand(
  session: Session,
  options: { base?: string; levelReason: string; failOnDrift?: boolean; failOnBaselineGrowth?: boolean },
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
  const drifted = drift(graph, changed, new Set(acknowledgedSlices(repo.root, base)));
  const baseline = session.baseline === undefined ? null : reviewBaseline(repo.root, base, session.baseline);
  const failing =
    (options.failOnDrift === true && drifted.some((item) => !item.acknowledged)) ||
    (options.failOnBaselineGrowth === true && (baseline?.added?.length ?? 0) > 0);
  const exit = session.errors > 0 || failing ? 1 : 0;
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
        drift: drifted,
        ...(baseline === null ? {} : { baseline }),
        unattributed,
      }),
    );
    return exit;
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
  const open = drifted.filter((item) => !item.acknowledged).length;
  out.push("", `## Code changed, records unchanged (${drifted.length}, ${open} not acknowledged)`, "", DRIFT_NOTE);
  if (drifted.length === 0) out.push("", "None.");
  for (const item of drifted) {
    out.push("", `### ${item.slice}: ${item.title}`, "");
    out.push(
      item.acknowledged
        ? `- Acknowledged: a commit since the base says this changes no behavior (${UNCHANGED_TRAILER}).`
        : "- Not acknowledged: update the records below, or say in a commit that no behavior changed.",
    );
    out.push(...item.code.map((path) => `- Code changed: ${path}`));
    out.push(`- Records describing it, none changed: ${item.records.join(", ")}`);
  }
  if (baseline !== null) out.push("", ...baselineSection(baseline));
  out.push("", `## Changed files no artifact accounts for (${unattributed.length})`, "");
  if (unattributed.length === 0) out.push("None.");
  else out.push(...unattributed.map((path) => `- ${path}`));
  io.stdout(`${out.join("\n")}\n`);
  return exit;
}

/** The review's baseline section: what the change added to the baseline and what it retired. */
function baselineSection(review: BaselineReview): string[] {
  const out = [
    `## Baseline (${review.file}: ${count(review.entries, "entry", "entries")}${review.atBase === null ? "" : `, ${review.atBase} at the base`})`,
    "",
    "A baseline may shrink and may not grow (VSA §9). An entry the base did not hold is a violation this change let in.",
  ];
  if (review.note !== undefined) out.push("", `${review.note.charAt(0).toUpperCase()}${review.note.slice(1)}.`);
  if (review.added === undefined) return out;
  const list = (title: string, lines: string[]) => {
    out.push("", `### ${title} (${lines.length})`, "");
    if (lines.length === 0) out.push("None.");
    else out.push(...lines.map((line) => `- ${line}`));
  };
  list("Added since the base", review.added.map(describeEntry));
  list("Retired since the base", (review.removed ?? []).map(describeEntry));
  list(
    "Moved with a renamed file",
    (review.moved ?? []).map(({ from, to }) => `${from.code} ${from.path} -> ${to.path}`),
  );
  list(
    "Rewritten in the current form",
    (review.rewritten ?? []).map(({ from, to }) => {
      const names = to.map((entry) => entry.name).filter((name) => name !== undefined);
      return `${describeEntry(from)} -> ${count(to.length, "entry", "entries")}${names.length > 0 ? `: ${names.join(", ")}` : ""}`;
    }),
  );
  list(
    "Cycles replaced by smaller ones",
    (review.replaced ?? []).map(({ from, to }) => `${describeEntry(from)} -> ${to.message ?? to.fingerprint}`),
  );
  return out;
}
