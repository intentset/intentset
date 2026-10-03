/**
 * What every command shares about output: the io it writes through, the
 * tool's identity, JSON in canonical key order, and the one text form of a
 * diagnostic. Nothing here touches the filesystem except reading this
 * package's own manifest for its version.
 */
import { readFileSync } from "node:fs";
import { type Diagnostic, sortKeysDeep } from "@intentset/core";

export interface Io {
  stdout(s: string): void;
  stderr(s: string): void;
  /** The directory the command was run from; relative paths in arguments resolve against it. */
  cwd: string;
  /** Aborted to stop a long-running command (serve, mcp); the bin aborts it on SIGINT and SIGTERM. */
  signal?: AbortSignal;
}

/** The checker identity a report carries (Core §11: publish the checker version). */
export const TOOL: { name: "intentset"; version: string } = { name: "intentset", version: readVersion() };

function readVersion(): string {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
  };
  return manifest.version;
}

/** ADR 0005: JSON with every object's keys sorted, two-space indent, one trailing newline. */
export function json(value: unknown): string {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}

/** Core §9 and ADR 0004: origin "syntax" is Markset's alone, so the origin decides. */
export function isMarkset(d: Diagnostic): boolean {
  return d.origin === "syntax";
}

/**
 * ADR 0004 as text: `<path>:<line>:<col> <severity> <CODE> [<artifact>] <message>`,
 * then the remediation and the field on their own indented lines. A location
 * that is not known is left out rather than written as 0. Markset's
 * diagnostics are prefixed `markset:` so they read as Markset's (Core §9).
 */
export function formatDiagnostic(d: Diagnostic): string {
  const where = d.path ?? "(repository)";
  const line = d.location === undefined ? "" : `:${d.location.line}`;
  const column = d.location?.column === undefined ? "" : `:${d.location.column}`;
  const artifact = d.artifact === null ? "" : ` [${d.artifact}]`;
  const prefix = isMarkset(d) ? "markset: " : "";
  let text = `${prefix}${where}${line}${column} ${d.severity} ${d.code}${artifact} ${d.message}\n`;
  if (d.remediation !== "") text += `  fix: ${d.remediation}\n`;
  if (d.field !== undefined) text += `  field: ${d.field}\n`;
  return text;
}

/** "1 artifact", "2 artifacts"; "1 entry", "2 entries" with the plural given. */
export function count(n: number, noun: string, plural = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : plural}`;
}

/** The snapshot a report describes (Core §10, §11): the commit, or why there is none, and the graph hash. */
export interface Snapshot {
  commit: string | null;
  commitUnavailable?: string;
  /** True when tracked files differ from the commit; the graph hash still describes exactly what was read. */
  uncommitted?: boolean;
  graphHash: string;
}

/** One line naming the snapshot, for the top of a text report. */
export function snapshotLine(snapshot: Snapshot): string {
  const commit =
    snapshot.commit === null
      ? `no commit (${snapshot.commitUnavailable ?? "none was read"})`
      : `commit ${snapshot.commit}${snapshot.uncommitted === true ? " plus uncommitted changes" : ""}`;
  return `Snapshot: ${commit}, graph ${snapshot.graphHash}`;
}
