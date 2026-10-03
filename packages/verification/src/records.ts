/**
 * Run records (Core §8): evidence is a separate record from the verification
 * definition, because runs change more often than product semantics. This
 * module is the record's shape and its reader; spec/evidence.schema.json is
 * the same shape for other tools, and a test holds the two in agreement.
 *
 * The reader accepts the literal `@current` for `commit` and `graphHash`.
 * That is the fixture placeholder (see placeholders.ts): it is bound to the
 * snapshot before classification, and a record still carrying it classifies
 * as unresolved, never as current.
 */
import { canonicalJson, type Diagnostic, ID_PATTERN, sortDiagnostics } from "@intentset/core";
import { compareStrings, evidenceDiagnostic, pointerToken } from "./diagnostic.ts";

export const RUN_RESULTS = ["pass", "fail", "skip", "error"] as const;
export type RunResult = (typeof RUN_RESULTS)[number];

/** The literal a fixture writes for "the snapshot's commit" or "the snapshot's graph hash". */
export const CURRENT = "@current";

export interface RunScope {
  /** The product's artifact ID. */
  product: string;
  /** The exact release label; v0.1 matches release labels exactly (Core §7). */
  release: string;
}

export interface RunTool {
  name: string;
  version: string;
}

/** One run of one verification, Core §8. Members in this order on output. */
export interface RunRecord {
  evidenceId: string;
  verificationId: string;
  commit: string;
  /** Lowercase hex SHA-256 over the canonical graph (ADR 0005), or the `@current` fixture placeholder. */
  graphHash: string;
  environment: string;
  scope: RunScope;
  /** The tool and version that ran an automated check; null for a review performed by a person alone. */
  tool: RunTool | null;
  /** The reviewer's identity; set exactly when the record is a manual review, which then needs a rationale. */
  reviewer: string | null;
  /** UTC ISO 8601 with a `Z` suffix. */
  startedAt: string;
  finishedAt: string;
  result: RunResult;
  uri: string;
  rationale?: string;
  /** Namespaced extensions (`org.example/key`), preserved and never interpreted. */
  extensions?: Record<string, unknown>;
}

const REQUIRED = [
  "evidenceId",
  "verificationId",
  "commit",
  "graphHash",
  "environment",
  "scope",
  "tool",
  "reviewer",
  "startedAt",
  "finishedAt",
  "result",
  "uri",
] as const;
const KNOWN = new Set<string>([...REQUIRED, "rationale", "extensions"]);

const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/;
const GRAPH_HASH = /^[0-9a-f]{64}$/;
const NO_SPACE = /^\S+$/;
const URI = /^[A-Za-z][A-Za-z0-9+.-]*:\S+$/;
const EXTENSION_KEY = /^[^/]+\/.+$/;

/** True for a UTC timestamp `YYYY-MM-DDTHH:MM:SS[.fraction]Z` that names a real instant. */
export function isUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = TIMESTAMP.exec(value);
  if (match === null) return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= days;
}

/**
 * A key that orders UTC timestamps exactly, fraction included: the date and
 * time, then the fraction padded to nanoseconds. Plain string comparison of
 * the timestamps would put `10:00:00.5Z` before `10:00:00Z`.
 */
export function timeKey(timestamp: string): string {
  const match = TIMESTAMP.exec(timestamp);
  if (match === null) return timestamp;
  return `${timestamp.slice(0, 19)}.${(match[7] ?? "").padEnd(9, "0")}`;
}

/**
 * Record order everywhere in this package: finishedAt, then evidenceId. The
 * last is the latest. Two records agreeing on both (a repeated evidence ID the
 * reader would have refused) fall back to their canonical JSON, so the order
 * never depends on input order.
 */
export function compareRecords(a: RunRecord, b: RunRecord): number {
  return (
    compareStrings(timeKey(a.finishedAt), timeKey(b.finishedAt)) ||
    compareStrings(a.evidenceId, b.evidenceId) ||
    compareStrings(canonicalJson(a), canonicalJson(b))
  );
}

export interface ReadRunRecords {
  /** The well-formed records, in input order; a malformed record is dropped and reported. */
  records: RunRecord[];
  /** EVID001 errors, sorted by core's order. */
  diagnostics: Diagnostic[];
}

/**
 * Read run records from parsed JSON (an array of objects). Every problem is
 * one EVID001 error with a JSON pointer into the input as its field; a record
 * with any problem is not returned, so it can never count as evidence. Of two
 * records with one evidence ID the first is kept and the later ones reported.
 */
export function readRunRecords(json: unknown, path: string): ReadRunRecords {
  const diagnostics: Diagnostic[] = [];
  if (!Array.isArray(json)) {
    diagnostics.push(
      evidenceDiagnostic({
        code: "EVID001",
        artifact: null,
        path,
        field: "",
        message: `The evidence in ${path} is ${describe(json)}, not an array of run records.`,
        remediation: "Write the run records as a JSON array of objects, one per run (Core §8).",
      }),
    );
    return { records: [], diagnostics };
  }

  const records: RunRecord[] = [];
  const seen = new Map<string, number>();
  json.forEach((entry, index) => {
    const problems: Problem[] = [];
    const record = readRecord(entry, index, problems);
    if (record !== null) {
      const first = seen.get(record.evidenceId);
      if (first !== undefined) {
        problems.push({
          field: `/${index}/evidenceId`,
          message: `Evidence ID ${record.evidenceId} at entry ${index} repeats entry ${first}.`,
          remediation: "Give every run its own evidence ID; tools never merge two records into one.",
        });
      } else {
        seen.set(record.evidenceId, index);
      }
    }
    const artifact = verificationOf(entry);
    for (const problem of problems) {
      diagnostics.push(evidenceDiagnostic({ code: "EVID001", artifact, path, ...problem }));
    }
    if (record !== null && problems.length === 0) records.push(record);
  });
  return { records, diagnostics: sortDiagnostics(diagnostics) };
}

interface Problem {
  field: string;
  message: string;
  remediation: string;
}

function verificationOf(entry: unknown): string | null {
  if (!isRecord(entry)) return null;
  const id = entry.verificationId;
  return typeof id === "string" && ID_PATTERN.test(id) ? id : null;
}

function readRecord(entry: unknown, index: number, problems: Problem[]): RunRecord | null {
  const at = (key: string) => `/${index}/${pointerToken(key)}`;
  if (!isRecord(entry)) {
    problems.push({
      field: `/${index}`,
      message: `Evidence entry ${index} is ${describe(entry)}, not a run record.`,
      remediation: "Write each run as an object with the fields Core §8 lists.",
    });
    return null;
  }
  const problem = (key: string, message: string, remediation: string) =>
    problems.push({ field: at(key), message, remediation });

  for (const key of Object.keys(entry).sort(compareStrings)) {
    if (!KNOWN.has(key)) {
      problem(
        key,
        `Run record ${index} has the unknown key \`${key}\`.`,
        "Remove it, or move it under `extensions` with a namespaced key such as `org.example/build`.",
      );
    }
  }
  for (const key of REQUIRED) {
    if (!Object.hasOwn(entry, key)) {
      problem(
        key,
        `Run record ${index} has no \`${key}\`.`,
        `Add \`${key}\`; Core §8 requires it on every run record${key === "tool" || key === "reviewer" ? ", as null when it does not apply" : ""}.`,
      );
    }
  }

  const text = (key: string, pattern: RegExp, what: string, remediation: string): string | undefined => {
    if (!Object.hasOwn(entry, key)) return undefined;
    const value = entry[key];
    if (typeof value === "string" && pattern.test(value)) return value;
    problem(key, `\`${key}\` of run record ${index} must be ${what}, but it is ${describe(value)}.`, remediation);
    return undefined;
  };

  const evidenceId = text(
    "evidenceId",
    NO_SPACE,
    "a non-empty string without spaces",
    "Give the run a stable evidence ID, such as the one the adapter derives.",
  );
  const verificationId = text(
    "verificationId",
    ID_PATTERN,
    "a verification artifact ID",
    "Name the verification this run executed, such as TEST-ASMT-SCHEDULE.",
  );
  const commit = text(
    "commit",
    NO_SPACE,
    "a non-empty commit identifier",
    "Record the source commit the run executed against.",
  );
  const graphHash = readGraphHash(entry, problem, index);
  const environment = text(
    "environment",
    /\S/,
    "a non-empty string",
    "Name the environment the run executed in, such as ci or pilot.",
  );
  const uri = text("uri", URI, "a URI with a scheme", "Link the run's report, such as https://ci.example/runs/42.");
  const scope = readScope(entry, at, problems, index);
  const tool = readTool(entry, at, problems, index);
  const reviewer = readReviewer(entry, problem, index);
  const startedAt = readTime(entry, "startedAt", problem, index);
  const finishedAt = readTime(entry, "finishedAt", problem, index);

  let result: RunResult | undefined;
  if (Object.hasOwn(entry, "result")) {
    if ((RUN_RESULTS as readonly unknown[]).includes(entry.result)) result = entry.result as RunResult;
    else
      problem(
        "result",
        `\`result\` of run record ${index} must be pass, fail, skip or error, but it is ${describe(entry.result)}.`,
        "Record one of the four results; anything else is not evidence (Core §8).",
      );
  }

  let rationale: string | undefined;
  if (Object.hasOwn(entry, "rationale")) {
    if (typeof entry.rationale === "string" && /\S/.test(entry.rationale)) rationale = entry.rationale;
    else
      problem(
        "rationale",
        `\`rationale\` of run record ${index} must be a non-empty string, but it is ${describe(entry.rationale)}.`,
        "Say what the reviewer examined and why it supports the result, or remove the key.",
      );
  }

  let extensions: Record<string, unknown> | undefined;
  if (Object.hasOwn(entry, "extensions")) {
    const value = entry.extensions;
    if (!isRecord(value)) {
      problem(
        "extensions",
        `\`extensions\` of run record ${index} must be a mapping.`,
        "Write namespaced keys under `extensions`.",
      );
    } else {
      for (const key of Object.keys(value).sort(compareStrings)) {
        if (!EXTENSION_KEY.test(key)) {
          problems.push({
            field: `${at("extensions")}/${pointerToken(key)}`,
            message: `Extension key \`${key}\` of run record ${index} is not namespaced.`,
            remediation: "Prefix it with a namespace you control, such as `org.example/build`.",
          });
        }
      }
      extensions = value;
    }
  }

  if (reviewer === null && Object.hasOwn(entry, "tool") && entry.tool === null) {
    problem(
      "tool",
      `Run record ${index} names neither a tool nor a reviewer, so nothing identifies who or what produced it.`,
      "Record the tool and version for an automated run, or the reviewer and rationale for a manual review (Core §8).",
    );
  }
  if (typeof reviewer === "string" && rationale === undefined && !Object.hasOwn(entry, "rationale")) {
    problem(
      "rationale",
      `Manual run record ${index} by ${reviewer} gives no rationale.`,
      "Add the review rationale; a manual record must identify its reviewer and why the result holds (Core §8).",
    );
  }
  if (
    startedAt !== undefined &&
    finishedAt !== undefined &&
    compareStrings(timeKey(finishedAt), timeKey(startedAt)) < 0
  ) {
    problem(
      "finishedAt",
      `Run record ${index} finished at ${finishedAt}, before it started at ${startedAt}.`,
      "Record the run's real start and end in UTC; the end cannot precede the start.",
    );
  }

  if (problems.length > 0) return null;
  const record: RunRecord = {
    evidenceId: evidenceId as string,
    verificationId: verificationId as string,
    commit: commit as string,
    graphHash: graphHash as string,
    environment: environment as string,
    scope: scope as RunScope,
    tool: tool as RunTool | null,
    reviewer: reviewer as string | null,
    startedAt: startedAt as string,
    finishedAt: finishedAt as string,
    result: result as RunResult,
    uri: uri as string,
  };
  if (rationale !== undefined) record.rationale = rationale;
  if (extensions !== undefined) record.extensions = extensions;
  return record;
}

type Report = (key: string, message: string, remediation: string) => void;

function readGraphHash(entry: Record<string, unknown>, problem: Report, index: number): string | undefined {
  if (!Object.hasOwn(entry, "graphHash")) return undefined;
  const value = entry.graphHash;
  if (typeof value === "string" && (GRAPH_HASH.test(value) || value === CURRENT)) return value;
  problem(
    "graphHash",
    `\`graphHash\` of run record ${index} must be 64 lowercase hex characters, but it is ${describe(value)}.`,
    "Record the graph hash of the snapshot the run assessed, as `intentset export` reports it (ADR 0005).",
  );
  return undefined;
}

function readTime(entry: Record<string, unknown>, key: string, problem: Report, index: number): string | undefined {
  if (!Object.hasOwn(entry, key)) return undefined;
  const value = entry[key];
  if (isUtcTimestamp(value)) return value;
  problem(
    key,
    `\`${key}\` of run record ${index} must be a UTC timestamp such as 2026-10-02T09:30:00Z, but it is ${describe(value)}.`,
    "Write the instant in UTC with a Z suffix; local offsets are not accepted.",
  );
  return undefined;
}

function readReviewer(entry: Record<string, unknown>, problem: Report, index: number): string | null | undefined {
  if (!Object.hasOwn(entry, "reviewer")) return undefined;
  const value = entry.reviewer;
  if (value === null) return null;
  if (typeof value === "string" && /\S/.test(value)) return value;
  problem(
    "reviewer",
    `\`reviewer\` of run record ${index} must be a reviewer's identity or null, but it is ${describe(value)}.`,
    "Name the person who performed the review, or write null for an automated run.",
  );
  return undefined;
}

function readScope(
  entry: Record<string, unknown>,
  at: (key: string) => string,
  problems: Problem[],
  index: number,
): RunScope | undefined {
  if (!Object.hasOwn(entry, "scope")) return undefined;
  const value = entry.scope;
  if (!isRecord(value)) {
    problems.push({
      field: at("scope"),
      message: `\`scope\` of run record ${index} must be a mapping with product and release, but it is ${describe(value)}.`,
      remediation: "Record the exact product and release the run assessed (Core §8).",
    });
    return undefined;
  }
  let ok = true;
  for (const key of Object.keys(value).sort(compareStrings)) {
    if (key !== "product" && key !== "release") {
      problems.push({
        field: `${at("scope")}/${pointerToken(key)}`,
        message: `\`scope\` of run record ${index} has the unknown key \`${key}\`.`,
        remediation: "A scope names a product and a release and nothing else.",
      });
      ok = false;
    }
  }
  if (typeof value.product !== "string" || !ID_PATTERN.test(value.product)) {
    problems.push({
      field: `${at("scope")}/product`,
      message: `\`scope.product\` of run record ${index} must be a product ID, but it is ${describe(value.product)}.`,
      remediation: "Name the product artifact, such as PRD-LANTERN.",
    });
    ok = false;
  }
  if (typeof value.release !== "string" || !/\S/.test(value.release)) {
    problems.push({
      field: `${at("scope")}/release`,
      message: `\`scope.release\` of run record ${index} must be a release label, but it is ${describe(value.release)}.`,
      remediation: "Give the exact release label the run assessed, such as pilot-1.",
    });
    ok = false;
  }
  return ok ? { product: value.product as string, release: value.release as string } : undefined;
}

function readTool(
  entry: Record<string, unknown>,
  at: (key: string) => string,
  problems: Problem[],
  index: number,
): RunTool | null | undefined {
  if (!Object.hasOwn(entry, "tool")) return undefined;
  const value = entry.tool;
  if (value === null) return null;
  if (!isRecord(value)) {
    problems.push({
      field: at("tool"),
      message: `\`tool\` of run record ${index} must be a mapping with name and version, or null, but it is ${describe(value)}.`,
      remediation: "Record the tool that ran the check and its version, such as node:test and v24.15.0.",
    });
    return undefined;
  }
  let ok = true;
  for (const key of Object.keys(value).sort(compareStrings)) {
    if (key !== "name" && key !== "version") {
      problems.push({
        field: `${at("tool")}/${pointerToken(key)}`,
        message: `\`tool\` of run record ${index} has the unknown key \`${key}\`.`,
        remediation: "A tool is a name and a version and nothing else.",
      });
      ok = false;
    }
  }
  for (const key of ["name", "version"] as const) {
    if (typeof value[key] !== "string" || !/\S/.test(value[key] as string)) {
      problems.push({
        field: `${at("tool")}/${key}`,
        message: `\`tool.${key}\` of run record ${index} must be a non-empty string, but it is ${describe(value[key])}.`,
        remediation: `Record the tool's ${key}.`,
      });
      ok = false;
    }
  }
  return ok ? { name: value.name as string, version: value.version as string } : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (value === undefined) return "absent";
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "string")
    return value === "" ? "an empty string" : JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
  if (typeof value === "object") return "a mapping";
  return `the ${typeof value} ${String(value)}`;
}
