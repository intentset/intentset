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
 *
 * It lists every record whose status or approval differs from the base's copy
 * (Core §10, ADR 0022), and every knowledge record whose review (`reviewedBy`,
 * `reviewedAt` or `review`) does, or that arrives with one (ADR 0027), so a
 * reviewer sees each approval and each review a change makes without reading
 * frontmatter. A review pin that differs only as `intentset migrate` re-pins
 * it is not a change of review: the base pin matched the pinned record's base
 * copy, the head pin is the same kind of hash of that copy as migrated, and the
 * pinned record's head hash is that value, so it changed only by migrating. A report, never a failure. A base copy that
 * declares an earlier version is read as `intentset migrate` would move it, in
 * memory, so a change that only migrates records lists none of them.
 *
 * It lists every slice past draft whose `surfaces` (VSA §3, ADR 0028) gained or
 * lost a key, or changed a key's list, against the base's copy read the same
 * way: a surface ID reaches every eligible reader's help file once its slice is
 * approved, so this is where a reviewer sees the key text first. A report,
 * never a failure.
 */
import {
  type BaselineComparison,
  type BaselineEntry,
  compareBaselines,
  describeEntry,
  parseBaseline,
} from "@intentset/architecture";
import {
  type Artifact,
  approvalSummary,
  canonicalJson,
  compareStrings,
  type ExportApproval,
  exportApproval,
  type Graph,
  impact,
  readArtifact,
} from "@intentset/core";
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
import { type CarrierName, CARRIERS } from "../repository.ts";
import type { Session } from "../session.ts";
import { activeSlices, claimingSlices, describingRecords, isSliceCode } from "@intentset/core";
import { pathText, REACHABILITY_NOTE } from "./impact.ts";
import { migrateRecord, recordHash, repinPlan } from "./migrate.ts";

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

export interface StatusChange {
  id: string;
  type: string;
  path: string;
  /** The status in the base's copy; null when the base holds no such record, or one that cannot be read. */
  from: string | null;
  to: string;
  /** The approval the record states now (Core §7), null when it states none. */
  approval: ExportApproval | null;
  /** True when the approval differs from the base's copy, whether or not the status does. */
  approvalChanged: boolean;
  /**
   * Knowledge only (ADR 0027): true when `reviewedBy`, `reviewedAt` or `review` differs from the base's copy as
   * migrated, re-pins a migration would write aside, or the record arrives with a review.
   */
  reviewChanged: boolean;
  /** The reviewer and date the record names now, null when it names none. */
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export const STATUS_NOTE =
  "Records whose status or approval differs from the base's copy, new records that arrive past draft or with an " +
  "approval, and knowledge whose review was written or changed. A status is a claim a person makes (Core §7): check " +
  "that each one here was made by whoever may make it. A review is a claim a person makes, too (Core §10).";

/**
 * The base's copy of a record as this reader reads it: moved to the current version through `migrateRecord` when it
 * declares an earlier one (Core §10), so the comparison sees what the change did and not what the migration did.
 * Nothing is written; a copy at the current version, or at one no step leads from, is read as it is.
 */
export function readBaseCopy(path: string, text: string, carrier: CarrierName): Artifact | null {
  const input = CARRIERS[carrier](path, text);
  const moved = input.frontmatter === null ? null : migrateRecord(text, input.frontmatter);
  return readArtifact(moved === null ? input : CARRIERS[carrier](path, moved)).artifact;
}

/** Each changed record whose status, approval or review is not what the base's copy says, sorted by ID. */
export function statusChanges(
  graph: Graph,
  changed: readonly string[],
  atBase: (path: string) => string | null,
  carrier: CarrierName,
): StatusChange[] {
  const touched = new Set(changed);
  const out: StatusChange[] = [];
  for (const id of [...graph.artifacts.keys()].sort(compareStrings)) {
    const artifact = graph.artifacts.get(id) as Artifact;
    const { path, meta } = artifact;
    if (!touched.has(path)) continue;
    const text = atBase(path);
    const before = text === null ? null : readBaseCopy(path, text, carrier);
    const from = before?.meta.status ?? null;
    const approval = exportApproval(meta.approval);
    const approvalChanged = canonicalJson(approval) !== canonicalJson(exportApproval(before?.meta.approval));
    const reviewChanged =
      meta.type === "knowledge" &&
      (before === null
        ? hasReview(artifact)
        : reviewOf(artifact) !== replayedReview(graph, artifact, before, text as string, atBase, carrier));
    const statusQuiet =
      from === null ? meta.status === "draft" && approval === null : from === meta.status && !approvalChanged;
    if (statusQuiet && !reviewChanged) continue;
    out.push({
      id,
      type: meta.type,
      path,
      from,
      to: meta.status,
      approval,
      approvalChanged,
      reviewChanged,
      reviewedBy: meta.reviewedBy ?? null,
      reviewedAt: meta.reviewedAt ?? null,
    });
  }
  return out;
}

function hasReview(artifact: Artifact): boolean {
  const { meta } = artifact;
  return meta.review !== undefined || meta.reviewedBy !== undefined || meta.reviewedAt !== undefined;
}

/** What a knowledge record says of its review, as one comparable string. */
function reviewOf(artifact: Artifact, review = artifact.meta.review): string {
  return canonicalJson({
    reviewedBy: artifact.meta.reviewedBy ?? null,
    reviewedAt: artifact.meta.reviewedAt ?? null,
    review: review ?? null,
  });
}

/**
 * The base copy's review as `intentset migrate` would leave it beside this head (Core §10, ADR 0027): each pin, a
 * source pin or `self`, that differs from the head's is taken as the head's only when it exactly replays the move's
 * re-pin. The base pin equals the pinned record's base copy's hash of the kind the move reads the review by (`repinPlan`), the head pin equals the same
 * kind of hash of that copy as migrated, and the pinned record's head hash equals that value, so the pinned record
 * changed only by migrating. A head pin copied from a record edited after the move is not that value, and is listed.
 */
function replayedReview(
  graph: Graph,
  head: Artifact,
  before: Artifact,
  baseText: string,
  atBase: (path: string) => string | null,
  carrier: CarrierName,
): string {
  const review = before.meta.review;
  const now = head.meta.review;
  if (review === undefined || now === undefined) return reviewOf(before);
  // The move's own plan for this record, read from the base text as written: a record it would not rewrite, a pin kind
  // its declared version did not read (a 0.2 `hash: file-v1` among them) and a `self` of a record it does not move are
  // never replays.
  const own = CARRIERS[carrier](head.path, baseText).frontmatter;
  if (own === null) return reviewOf(before);
  const plan = repinPlan(baseText, own.line);
  if (!plan.rewrites) return reviewOf(before);
  const kind = plan.kind;
  const replays = (
    pin: string,
    headPin: string | undefined,
    path: string,
    text: string | null,
    pinKind: "content-v1" | "file-v1" | "own",
    headHash: string,
  ) => {
    if (headPin === undefined || text === null) return false;
    const input = CARRIERS[carrier](path, text);
    if (input.frontmatter === null) return false;
    if (recordHash(text, input.frontmatter.line, pinKind) !== pin) return false;
    const moved = migrateRecord(text, input.frontmatter);
    if (moved === null) return false;
    const after = recordHash(moved, input.frontmatter.line, pinKind);
    return after !== null && headPin === after && headHash === after;
  };
  const sources: Record<string, string> = { ...review.sources };
  if (kind === "content-v1" || kind === "file-v1") {
    for (const [id, pin] of Object.entries(review.sources)) {
      const headPin = now.sources[id];
      const source = graph.artifacts.get(id);
      if (headPin === pin || source === undefined) continue;
      const headHash = kind === "file-v1" ? source.sourceHash : source.contentHash;
      if (replays(pin, headPin, source.path, atBase(source.path), kind, headHash)) sources[id] = headPin;
    }
  }
  const replayed = { ...review, sources };
  if (
    plan.self &&
    review.self !== undefined &&
    now.self !== review.self &&
    replays(review.self, now.self, head.path, baseText, "own", head.ownContentHash)
  ) {
    replayed.self = now.self;
  }
  return reviewOf(before, replayed);
}

export interface SurfaceChange {
  id: string;
  path: string;
  status: string;
  /** Surface IDs the head declares and the base's copy does not, sorted. */
  added: string[];
  /** Surface IDs the base's copy declares and the head does not, sorted. */
  removed: string[];
  /** Surface IDs both declare whose list of leading knowledge differs, sorted. */
  changed: string[];
}

export const SURFACES_NOTE =
  "Slices past draft whose surfaces (VSA §3) gained or lost a surface ID, or changed which knowledge leads one. A " +
  "surface ID is written into the help file of every reader the slice is available to once the slice is approved: " +
  "check that no ID below names something one of those readers may not see.";

/** Each changed slice past draft whose surfaces differ from the base's copy as migrated, sorted by ID. */
export function surfaceChanges(
  graph: Graph,
  changed: readonly string[],
  atBase: (path: string) => string | null,
  carrier: CarrierName,
): SurfaceChange[] {
  const touched = new Set(changed);
  const out: SurfaceChange[] = [];
  for (const id of [...graph.artifacts.keys()].sort(compareStrings)) {
    const { path, meta } = graph.artifacts.get(id) as Artifact;
    if (meta.type !== "slice" || meta.status === "draft" || !touched.has(path)) continue;
    const text = atBase(path);
    const before = text === null ? null : readBaseCopy(path, text, carrier);
    const now = meta.slice?.surfaces ?? {};
    const then = before?.meta.slice?.surfaces ?? {};
    const keys = (map: object) => Object.keys(map).sort(compareStrings);
    const added = keys(now).filter((key) => !Object.hasOwn(then, key));
    const removed = keys(then).filter((key) => !Object.hasOwn(now, key));
    const listChanged = keys(now).filter(
      (key) => Object.hasOwn(then, key) && canonicalJson(now[key].knowledge) !== canonicalJson(then[key].knowledge),
    );
    if (added.length + removed.length + listChanged.length === 0) continue;
    out.push({ id, path, status: meta.status, added, removed, changed: listChanged });
  }
  return out;
}

export function reviewCommand(
  session: Session,
  options: {
    base?: string;
    levelReason: string;
    failOnDrift?: boolean;
    failOnBaselineGrowth?: boolean;
    carrier: CarrierName;
  },
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
  // A record that moved is read at the base by the path it had there.
  const movedFrom = new Map(
    base === null ? [] : [...renamesSince(repo.root, base.commit)].map(([old, now]) => [now, old]),
  );
  const statuses =
    base === null
      ? []
      : statusChanges(
          graph,
          changed,
          (path) => fileAt(repo.root, base.commit, movedFrom.get(path) ?? path),
          options.carrier,
        );
  const surfaces =
    base === null
      ? []
      : surfaceChanges(
          graph,
          changed,
          (path) => fileAt(repo.root, base.commit, movedFrom.get(path) ?? path),
          options.carrier,
        );
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
        statusChanges: statuses,
        surfaceChanges: surfaces,
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
  out.push("", `## Approvals, reviews and status changes (${statuses.length})`, "", STATUS_NOTE, "");
  if (base === null) out.push("There is no base, so nothing was compared.");
  else if (statuses.length === 0) out.push("None.");
  for (const item of statuses) {
    const status =
      item.from === null ? `new, ${item.to}` : item.from === item.to ? item.to : `${item.from} -> ${item.to}`;
    const approval =
      item.approval === null
        ? "no approval stated"
        : `approval${item.approvalChanged ? "" : " (unchanged)"}: ${approvalSummary(item.approval)}`;
    const review = item.reviewChanged
      ? `; review written or changed: ${item.reviewedBy ?? "no reviewer"}, ${item.reviewedAt ?? "no date"}`
      : "";
    out.push(`- ${item.id} (${item.type}): ${status}; ${approval}${review}`);
  }
  out.push("", `## Surfaces changed (${surfaces.length})`, "", SURFACES_NOTE, "");
  if (base === null) out.push("There is no base, so nothing was compared.");
  else if (surfaces.length === 0) out.push("None.");
  for (const item of surfaces) {
    const parts = [
      ...item.added.map((key) => `added \`${key}\``),
      ...item.removed.map((key) => `removed \`${key}\``),
      ...item.changed.map((key) => `leads changed for \`${key}\``),
    ];
    out.push(`- ${item.id} (${item.status}): ${parts.join("; ")}`);
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
