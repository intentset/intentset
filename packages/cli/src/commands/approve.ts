/**
 * `intentset approve` (Core §7, ADR 0022): writes a person's approval into the drafts a selector matches. Each one
 * gets `status: approved` and an `approval` block with basis `direct` (ADR 0020); a knowledge record also gets the
 * review that publication requires of it (publication §3): `reviewedBy`, `reviewedAt` and `review`, the content hash of
 * each source with no `hash`, which means `content-v1` (ADR 0025). Those lines change and no other byte does.
 *
 * It validates the tree as it is and again in memory with the approvals applied, and writes nothing when the second
 * run holds an error the first did not. A tree with uncommitted changes to tracked files is refused unless
 * `--allow-dirty`, as `migrate` refuses one. It never commits, and it cannot know who runs it: the approval is a
 * diff, and the repository's own review is what accepts it.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Artifact,
  compareStrings,
  type Diagnostic,
  RETIRED_REVIEW_EXTENSION,
  type Selector,
  select,
} from "@intentset/core";
import { reviewSources } from "@intentset/publisher";
import { trackedChanges } from "../git.ts";
import { count, formatDiagnostic, type Io, json, TOOL } from "../output.ts";
import { findRoot } from "../repository.ts";
import { openSession, type SessionOptions } from "../session.ts";

export interface ApproveOptions {
  by?: string;
  at?: string;
  dryRun: boolean;
  allowDirty: boolean;
  json: boolean;
  /** True when the command line named a record or gave a selector option. */
  selected: boolean;
}

/** A message when the options cannot be run, before anything is read; null when they can. */
export function approveUsageProblem(options: ApproveOptions): string | null {
  if (!options.selected) {
    return "name the records to approve: IDs as arguments, or the selector options of `intentset list`";
  }
  if (options.by === undefined || options.by.trim() === "") {
    return "--by is required: the person approving, as the record is to name them. It is never guessed";
  }
  if (options.at !== undefined && !/^\d{4}-\d{2}-\d{2}/.test(options.at)) {
    return `--at ${options.at}: give a date, or a date and time, such as 2026-11-24`;
  }
  return null;
}

/** What an approval writes into one record. */
export interface ApprovalEdit {
  by: string;
  at: string;
  /** A knowledge record's review: each source's ID and the content hash to pin. */
  review?: Array<{ id: string; hash: string }>;
}

const quoted = (value: string) => JSON.stringify(value);

/**
 * The record's text with the approval written, or a reason it could not be. Only the `intentset:` mapping of the
 * frontmatter is touched: `status`, `approval`, and for a review `reviewedBy`, `reviewedAt`, `review` and a review left
 * under the extension 0.2 read.
 * Line endings are kept.
 */
export function approveText(
  source: string,
  frontmatter: { line: number; text: string },
  edit: ApprovalEdit,
): { text: string } | { problem: string } {
  const all = source.split("\n");
  const first = frontmatter.line - 1;
  const eol = all[first]?.endsWith("\r") ? "\r" : "";
  const region = all.slice(first, first + frontmatter.text.split("\n").length).map((line) => line.replace(/\r$/, ""));
  const indentOf = (line: string) => line.length - line.trimStart().length;
  const content = (line: string) => line.trim() !== "" && !line.trimStart().startsWith("#");
  /** The lines of the block under the key at `at`: everything deeper than `indent`, trailing blank lines left out. */
  const blockEnd = (at: number, indent: number, limit: number) => {
    let end = at + 1;
    for (let i = at + 1; i < limit; i++) {
      if (region[i].trim() === "") continue;
      if (indentOf(region[i]) <= indent) break;
      end = i + 1;
    }
    return end;
  };
  const find = (key: string, indent: number, from: number, to: number) => {
    const pattern = new RegExp(`^ {${indent}}(['"]?)${key.replace(/[./]/g, "\\$&")}\\1:`);
    for (let i = from; i < to; i++) if (pattern.test(region[i])) return i;
    return -1;
  };

  const top = region.findIndex((line) => /^intentset:\s*(#.*)?$/.test(line));
  if (top === -1) return { problem: "its frontmatter has no `intentset:` block mapping" };
  const end = () => blockEnd(top, 0, region.length);
  const child = region.slice(top + 1, end()).find(content);
  if (child === undefined) return { problem: "its `intentset:` mapping is empty" };
  const indent = indentOf(child);
  const pad = " ".repeat(indent);

  const status = find("status", indent, top + 1, end());
  const statusLine = status === -1 ? null : /^(\s+status:\s*)(['"]?)[a-z]+\2(\s*(?:#.*)?)$/.exec(region[status]);
  if (statusLine === null) return { problem: "its `status` is not written on one line of the `intentset:` mapping" };
  region[status] = `${statusLine[1]}approved${statusLine[3]}`;

  // The approval goes under the status, wherever an earlier one stood.
  const old = find("approval", indent, top + 1, end());
  if (old !== -1) region.splice(old, blockEnd(old, indent, end()) - old);
  const statusNow = find("status", indent, top + 1, end());
  const approval = [
    `${pad}approval:`,
    `${pad}${pad}at: ${quoted(edit.at)}`,
    `${pad}${pad}basis: direct`,
    `${pad}${pad}by: ${quoted(edit.by)}`,
  ];
  region.splice(statusNow + 1, 0, ...approval);
  let last = statusNow + approval.length;

  if (edit.review !== undefined) {
    for (const [key, value] of [
      ["reviewedBy", edit.by],
      ["reviewedAt", edit.at],
    ]) {
      const at = find(key, indent, top + 1, end());
      const line = `${pad}${key}: ${quoted(value)}`;
      if (at === -1) region.splice(++last, 0, line);
      else if (blockEnd(at, indent, end()) !== at + 1) return { problem: `its \`${key}\` is not written on one line` };
      else region[at] = line;
    }
    // A review written before 0.3 under the retired extension (ADR 0025) is replaced too, and `extensions` goes
    // with it when nothing else is left in it.
    const extensions = find("extensions", indent, top + 1, end());
    if (extensions !== -1 && /^\s+extensions:\s*(#.*)?$/.test(region[extensions])) {
      const extensionsEnd = blockEnd(extensions, indent, end());
      const inside = region.slice(extensions + 1, extensionsEnd).find(content);
      if (inside !== undefined) {
        const deep = indentOf(inside);
        const stale = find(RETIRED_REVIEW_EXTENSION, deep, extensions + 1, extensionsEnd);
        if (stale !== -1) region.splice(stale, blockEnd(stale, deep, extensionsEnd) - stale);
        const left = region.slice(extensions + 1, blockEnd(extensions, indent, end())).some(content);
        if (!left) region.splice(extensions, blockEnd(extensions, indent, end()) - extensions);
      }
    }
    // Core §9: the review pins content-v1 when it names no hash, so it names none.
    const block = [
      `${pad}review:`,
      ...(edit.review.length === 0
        ? [`${pad}${pad}sources: {}`]
        : [`${pad}${pad}sources:`, ...edit.review.map((pin) => `${pad}${pad}${pad}${pin.id}: ${quoted(pin.hash)}`)]),
    ];
    const existing = find("review", indent, top + 1, end());
    if (existing === -1) region.splice(end(), 0, ...block);
    else region.splice(existing, blockEnd(existing, indent, end()) - existing, ...block);
  }
  all.splice(first, frontmatter.text.split("\n").length, ...region.map((line) => `${line}${eol}`));
  return { text: all.join("\n") };
}

/** What makes two runs' diagnostics the same finding: everything but where in the file, which an approval moves. */
const finding = (d: Diagnostic) => JSON.stringify([d.code, d.artifact, d.path, d.field ?? null, d.message]);

export function approveCommand(
  options: ApproveOptions & { by: string },
  selector: Selector,
  named: readonly string[],
  sessionOptions: SessionOptions,
  io: Io,
): number {
  const fail = (message: string) => {
    io.stderr(`intentset approve: ${message}\n`);
    return 2;
  };
  const root = findRoot(io.cwd, sessionOptions.root);
  if (root !== null && !options.allowDirty && !options.dryRun) {
    const changes = trackedChanges(root);
    if (changes === null) {
      return fail(
        "this is not a git work tree, so the rewrite could not be undone; pass --allow-dirty to approve anyway.",
      );
    }
    if (changes.length > 0) {
      return fail(
        `${changes.length} tracked file${changes.length === 1 ? " has" : "s have"} uncommitted changes. ` +
          "Commit or stash them so the approval is a diff on its own, or pass --allow-dirty.",
      );
    }
  }
  const before = openSession("approve", sessionOptions, io);
  if (typeof before === "number") return before;
  const graph = before.result.graph;
  const missing = named.filter((id) => !graph.artifacts.has(id));
  if (missing.length > 0) return fail(`${missing.join(", ")}: no such record in this graph. Nothing was written.`);

  const at = options.at ?? new Date().toISOString().slice(0, 10);
  const matched = select(graph, selector, { includeRestricted: true, registries: before.repo.registries }).rows;
  const skipped = matched.filter((row) => row.status !== "draft").map((row) => ({ id: row.id, status: row.status }));
  const overlay = new Map<string, string>();
  const approved: Array<{ id: string; type: string; path: string; pinned: string[] | null }> = [];
  for (const row of matched) {
    if (row.status !== "draft") continue;
    const artifact = graph.artifacts.get(row.id) as Artifact;
    const input = before.repo.inputs.find((candidate) => candidate.path === artifact.path);
    if (input === undefined || input.frontmatter === null) return fail(`${row.id}: ${artifact.path} was not read.`);
    const edit: ApprovalEdit = { by: options.by, at };
    if (artifact.meta.type === "knowledge") {
      edit.review = reviewSources(graph, artifact)
        .filter((id) => graph.artifacts.has(id))
        .sort(compareStrings)
        .map((id) => ({ id, hash: (graph.artifacts.get(id) as Artifact).contentHash }));
    }
    const written = approveText(overlay.get(artifact.path) ?? input.source, input.frontmatter, edit);
    if ("problem" in written) return fail(`${row.id} (${artifact.path}): ${written.problem}. Nothing was written.`);
    overlay.set(artifact.path, written.text);
    approved.push({
      id: row.id,
      type: artifact.meta.type,
      path: artifact.path,
      pinned: edit.review?.map((pin) => pin.id) ?? null,
    });
  }

  let introduced: Diagnostic[] = [];
  if (approved.length > 0) {
    const after = openSession("approve", { ...sessionOptions, overlay }, io);
    if (typeof after === "number") return after;
    const known = new Set(before.diagnostics.map(finding));
    introduced = after.diagnostics.filter((d) => d.severity === "error" && !known.has(finding(d)));
  }
  const refused = introduced.length > 0;
  const wrote = !refused && !options.dryRun;
  if (wrote) for (const [path, text] of overlay) writeFileSync(join(before.repo.root, path), text);

  if (options.json) {
    io.stdout(
      json({
        tool: TOOL,
        level: before.level,
        by: options.by,
        at,
        written: wrote,
        dryRun: options.dryRun,
        approved: refused ? [] : approved,
        skipped,
        introduced,
      }),
    );
    return refused ? 1 : 0;
  }
  if (refused) {
    io.stderr(
      `intentset approve: approving ${count(approved.length, "record")} would add ${count(introduced.length, "error")} at ${before.level}. Nothing was written.\n`,
    );
    for (const d of introduced) io.stderr(formatDiagnostic(d));
    return 1;
  }
  const verb = options.dryRun ? "would approve" : "approved";
  const lines = [
    `intentset approve: ${verb} ${count(approved.length, "record")} by ${options.by} at ${at} (direct), checked at ${before.level}`,
    ...approved.map(
      (item) =>
        `  ${item.id}  ${item.path}${item.pinned === null ? "" : `  (reviewed: ${count(item.pinned.length, "source")} pinned, content-v1)`}`,
    ),
  ];
  if (skipped.length > 0) {
    lines.push(`Skipped, not drafts (${skipped.length}):`, ...skipped.map((item) => `  ${item.id}  ${item.status}`));
  }
  if (approved.length > 0 && !options.dryRun) {
    lines.push("Nothing was committed: the approval is the diff, and `intentset review` lists it for its reviewer.");
  }
  io.stdout(`${lines.join("\n")}\n`);
  return 0;
}
