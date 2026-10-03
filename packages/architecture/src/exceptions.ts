/**
 * Exception records (VSA §9). A record names one rule and the exact paths or
 * edges it tolerates, with rationale, accountable owner, approver, creation
 * and expiry dates and a remediation issue. Records live one per file in
 * `architecture/exceptions/*.yaml` (profile §1), or are handed in.
 *
 * A diagnostic a current record covers is kept, never hidden: it becomes a
 * warning whose message says which exception covers it and until when, so a
 * report built on it reads "with exceptions" rather than as a pass (Core
 * §11). An expired record is itself an error, VSA013, and what it covered
 * stays an error. A record that is malformed is VSA013 and covers nothing; a
 * current record that covers nothing is a VSA013 warning, so retired
 * violations retire their exceptions too.
 */
import { ID_PATTERN, parseYamlDetailed } from "@intentset/core";
import { type Finding, finding, type SubjectEdge } from "./finding.ts";
import { compareStrings, matchPattern, validatePattern } from "./patterns.ts";

export const EXCEPTIONS_PATTERNS = ["architecture/exceptions/*.yaml", "architecture/exceptions/*.yml"];

export interface ExceptionRecord {
  id: string;
  rule: string;
  paths: string[];
  edges: SubjectEdge[];
  rationale: string;
  owner: string;
  approver: string;
  /** YYYY-MM-DD. */
  created: string;
  /** YYYY-MM-DD, the last day the exception holds. */
  expires: string;
  remediation: string;
  /** The file it was read from, or null when it was handed in. */
  source: string | null;
}

const TEXT_FIELDS = ["id", "rule", "rationale", "owner", "approver", "created", "expires", "remediation"] as const;
const KNOWN_FIELDS = [...TEXT_FIELDS, "paths", "edges"];
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CODE = /^[A-Z]+[0-9]{3}$/;

function isDate(text: string): boolean {
  const match = DATE.exec(text);
  if (match === null) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === text;
}

/** Validate one record. Returns the record, or the problems that keep it from covering anything. */
export function readExceptionRecord(
  value: unknown,
  source: string | null,
  lines: ReadonlyMap<string, number> = new Map(),
): { record: ExceptionRecord | null; findings: Finding[] } {
  const findings: Finding[] = [];
  const fail = (field: string | undefined, message: string) => {
    const line = field === undefined ? undefined : lines.get(field);
    findings.push(
      finding({
        code: "VSA013",
        artifact: null,
        path: source,
        ...(line !== undefined ? { location: { line } } : {}),
        ...(field !== undefined ? { field } : {}),
        message,
        remediation:
          "An exception records id, rule, paths or edges, rationale, owner, approver, created, expires and remediation (VSA §9).",
      }),
    );
  };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(undefined, "The exception record is not a mapping.");
    return { record: null, findings };
  }
  const map = value as Record<string, unknown>;
  for (const key of Object.keys(map).sort(compareStrings)) {
    if (!KNOWN_FIELDS.includes(key)) fail(`/${key}`, `The exception record has the unknown key \`${key}\`.`);
  }
  for (const key of TEXT_FIELDS) {
    if (typeof map[key] !== "string" || (map[key] as string).trim() === "") {
      fail(`/${key}`, `The exception record has no \`${key}\`.`);
    }
  }
  const text = (key: (typeof TEXT_FIELDS)[number]) => (typeof map[key] === "string" ? (map[key] as string) : "");
  if (text("id") !== "" && !ID_PATTERN.test(text("id")))
    fail("/id", `The exception id ${text("id")} does not match the ID pattern.`);
  if (text("rule") !== "" && !CODE.test(text("rule")))
    fail("/rule", `The exception rule ${text("rule")} is not a diagnostic code.`);
  for (const key of ["created", "expires"] as const) {
    if (text(key) !== "" && !isDate(text(key)))
      fail(`/${key}`, `The exception's ${key} date ${text(key)} is not a quoted YYYY-MM-DD date.`);
  }
  if (isDate(text("created")) && isDate(text("expires")) && text("expires") < text("created")) {
    fail("/expires", `The exception expires on ${text("expires")}, before it was created on ${text("created")}.`);
  }

  const paths: string[] = [];
  if (map.paths !== undefined && map.paths !== null) {
    if (!Array.isArray(map.paths)) fail("/paths", "The exception's paths is not a list.");
    else
      map.paths.forEach((item, i) => {
        const why = typeof item === "string" ? validatePattern(item) : "is not a string";
        if (why !== null) fail(`/paths/${i}`, `Exception path ${i} ${why}.`);
        else paths.push(item as string);
      });
  }
  const edges: SubjectEdge[] = [];
  if (map.edges !== undefined && map.edges !== null) {
    if (!Array.isArray(map.edges)) fail("/edges", "The exception's edges is not a list.");
    else
      map.edges.forEach((item, i) => {
        const edge = item as Record<string, unknown> | null;
        if (typeof edge !== "object" || edge === null || typeof edge.from !== "string" || typeof edge.to !== "string") {
          fail(`/edges/${i}`, `Exception edge ${i} is not a mapping with from and to.`);
        } else edges.push({ from: edge.from, to: edge.to });
      });
  }
  if (paths.length === 0 && edges.length === 0) {
    fail("/paths", "The exception names no exact paths or edges, and an exception is never a blanket waiver.");
  }
  if (findings.length > 0) return { record: null, findings };
  return {
    record: {
      id: text("id"),
      rule: text("rule"),
      paths,
      edges,
      rationale: text("rationale"),
      owner: text("owner"),
      approver: text("approver"),
      created: text("created"),
      expires: text("expires"),
      remediation: text("remediation"),
      source,
    },
    findings,
  };
}

/** Every exception file in the tree, read with core's strict YAML reader. */
export function readExceptions(files: ReadonlyMap<string, string>): {
  records: ExceptionRecord[];
  findings: Finding[];
} {
  const records: ExceptionRecord[] = [];
  const findings: Finding[] = [];
  for (const path of [...files.keys()].sort(compareStrings)) {
    if (!EXCEPTIONS_PATTERNS.some((pattern) => matchPattern(pattern, path))) continue;
    const parsed = parseYamlDetailed(files.get(path) as string);
    if (parsed.error !== null) {
      findings.push(
        finding({
          code: "VSA013",
          artifact: null,
          path,
          location: { line: parsed.error.line },
          message: `The exception file does not parse: ${parsed.error.message}`,
          remediation: "Write the exception as one block mapping (VSA §9).",
        }),
      );
      continue;
    }
    const read = readExceptionRecord(parsed.value, path, parsed.lines);
    findings.push(...read.findings);
    if (read.record !== null) records.push(read.record);
  }
  return { records, findings };
}

/** Does the record name this finding's rule and one of its exact paths or edges? */
export function covers(record: ExceptionRecord, target: Finding): boolean {
  if (record.rule !== target.diagnostic.code) return false;
  if (record.paths.some((pattern) => target.paths.some((path) => matchPattern(pattern, path)))) return true;
  return record.edges.some((edge) => target.edges.some((other) => other.from === edge.from && other.to === edge.to));
}

/** Put a note in parentheses before a message's final period. */
export function annotate(message: string, note: string): string {
  return message.endsWith(".") ? `${message.slice(0, -1)} (${note}).` : `${message} (${note})`;
}

/**
 * Apply exceptions on a given date (YYYY-MM-DD). Returns the findings with
 * covered ones rewritten, the VSA013 findings about the records themselves,
 * and how many diagnostics a current exception covers.
 */
export function applyExceptions(
  findings: readonly Finding[],
  records: readonly ExceptionRecord[],
  today: string,
): { findings: Finding[]; excepted: number; recordFindings: Finding[] } {
  const recordFindings: Finding[] = [];
  const seen = new Map<string, ExceptionRecord>();
  const usable: ExceptionRecord[] = [];
  for (const record of [...records].sort(
    (a, b) => compareStrings(a.id, b.id) || compareStrings(a.source ?? "", b.source ?? ""),
  )) {
    const earlier = seen.get(record.id);
    if (earlier !== undefined) {
      recordFindings.push(
        finding({
          code: "VSA013",
          artifact: null,
          path: record.source,
          field: "/id",
          message: `Exception ${record.id} is recorded twice, here and in ${earlier.source ?? "the records handed in"}.`,
          remediation: "Keep one record per exception ID; IDs are never reused (VSA §9).",
        }),
      );
      continue;
    }
    seen.set(record.id, record);
    usable.push(record);
  }

  let excepted = 0;
  const used = new Set<string>();
  const out = findings.map((item) => {
    const record = usable.find((candidate) => covers(candidate, item));
    if (record === undefined) return item;
    used.add(record.id);
    if (record.expires < today) {
      return {
        ...item,
        diagnostic: {
          ...item.diagnostic,
          message: annotate(item.diagnostic.message, `exception ${record.id} expired ${record.expires}`),
        },
      };
    }
    excepted++;
    return {
      ...item,
      diagnostic: {
        ...item.diagnostic,
        severity: "warning" as const,
        message: annotate(item.diagnostic.message, `excepted by ${record.id} until ${record.expires}`),
      },
    };
  });

  for (const record of usable) {
    if (record.expires < today) {
      recordFindings.push(
        finding({
          code: "VSA013",
          artifact: null,
          path: record.source,
          field: "/expires",
          message: `Exception ${record.id} for ${record.rule} expired on ${record.expires}, so what it covered is an error again.`,
          remediation: `Fix the violation tracked by ${record.remediation}, or have ${record.approver} renew the exception with a new expiry (VSA §9).`,
        }),
      );
    } else if (!used.has(record.id)) {
      recordFindings.push(
        finding({
          code: "VSA013",
          severity: "warning",
          artifact: null,
          path: record.source,
          message: `Exception ${record.id} for ${record.rule} covers no current diagnostic.`,
          remediation: "Remove the record; the violation it tolerated is gone (VSA §9).",
        }),
      );
    }
  }
  return { findings: out, excepted, recordFindings };
}
