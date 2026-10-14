/**
 * The subject of a verification (ADR 0013, prototype): a hash of what the
 * check is about, so a run record can stay current while the subject is
 * unchanged. Pure: it reads nothing but what it is given.
 *
 * The subject is the verification record and what it verifies (each verified
 * behavior, the rules that govern it and the scenarios that illustrate it,
 * by source hash); the slices that implement the
 * verified behaviors, the transitive closure of their `dependsOn`, and any
 * slice the verification names in the optional `verification.exercises`, each
 * with its record's source hash and the content of every file it claims; the
 * test's own file (`locator`); and the repository's global inputs.
 *
 * The slices' claimed files are resolved by the architecture package and
 * passed in, so this package does not depend on it. The hash is the SHA-256
 * of the canonical JSON of the sorted entries (ADR 0005), like `graphHash`.
 * `parts` carries the hash of each entry, so a diagnostic can say which part
 * moved between two subjects (`movedParts`).
 */
import { type Graph, canonicalJson, sha256Hex } from "@intentset/core";

export const SUBJECT_PART_KINDS = ["verification", "verified", "slice", "slice-file", "test", "global-input"] as const;
export type SubjectPartKind = (typeof SUBJECT_PART_KINDS)[number];

/** One thing that went into the hash: `id` is a record ID or a path, `hash` its content or source hash. */
export interface SubjectPart {
  kind: SubjectPartKind;
  id: string;
  hash: string;
  /** For a slice: why it is included (`implements`, `dependsOn`, `exercises`; sorted, joined by a comma). */
  why?: string;
  /** For a slice file: the slice that claims it. */
  slice?: string;
}

export interface Subject {
  hash: string;
  /** Sorted by kind, then ID. */
  parts: SubjectPart[];
}

export interface SubjectInput {
  graph: Graph;
  verificationId: string;
  /** Repository-relative path to its bytes; undefined when the file does not exist. */
  readFile: (path: string) => Uint8Array | undefined;
  /** Slice ID to the repository-relative files it claims, as the architecture package resolves them. */
  sliceFiles: ReadonlyMap<string, readonly string[]> | Readonly<Record<string, readonly string[]>>;
  /** Files whose change affects every check and that belong to no slice (`evidence.globalInputs`). */
  globalInputs: readonly string[];
}

/** What a missing file hashes as, so a deleted file moves the subject and is told apart from an empty one. */
export const ABSENT = "absent";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The verification's `verification.exercises`, or none: the field is optional and not yet in core's type. */
function exercisesOf(graph: Graph, id: string): string[] {
  const meta = graph.artifacts.get(id)?.meta.verification as { exercises?: unknown } | undefined;
  const list = meta?.exercises;
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
}

/** The behaviors a verification is about: those it verifies, those governed by a rule it verifies, those a scenario it verifies illustrates. */
export function verifiedBehaviors(graph: Graph, verificationId: string): string[] {
  const behaviors = new Set<string>();
  for (const edge of graph.out.get(verificationId) ?? []) {
    if (edge.kind !== "verifies") continue;
    const target = graph.artifacts.get(edge.to);
    if (target === undefined) continue;
    if (target.meta.type === "behavior") behaviors.add(target.meta.id);
    else if (target.meta.type === "rule") {
      for (const back of graph.in.get(target.meta.id) ?? []) if (back.kind === "governedBy") behaviors.add(back.from);
    } else if (target.meta.type === "scenario") {
      for (const out of graph.out.get(target.meta.id) ?? []) if (out.kind === "illustrates") behaviors.add(out.to);
    }
  }
  return [...behaviors].filter((id) => graph.artifacts.get(id)?.meta.type === "behavior").sort(cmp);
}

/** The slices a subject includes, each with why: implementers, their `dependsOn` closure, and the exercised slices. */
export function includedSlices(graph: Graph, verificationId: string): Map<string, string> {
  const why = new Map<string, Set<string>>();
  const add = (id: string, reason: string) => {
    const set = why.get(id) ?? new Set<string>();
    set.add(reason);
    why.set(id, set);
  };
  const queue: string[] = [];
  const seed = (id: string, reason: string) => {
    if (graph.artifacts.get(id)?.meta.type !== "slice") return;
    if (!why.has(id)) queue.push(id);
    add(id, reason);
  };
  for (const behavior of verifiedBehaviors(graph, verificationId)) {
    for (const edge of graph.in.get(behavior) ?? []) if (edge.kind === "implements") seed(edge.from, "implements");
  }
  for (const id of exercisesOf(graph, verificationId)) seed(id, "exercises");
  while (queue.length > 0) {
    const id = queue.pop() as string;
    for (const edge of graph.out.get(id) ?? []) {
      if (edge.kind !== "dependsOn") continue;
      if (!why.has(edge.to)) queue.push(edge.to);
      if (graph.artifacts.get(edge.to)?.meta.type === "slice") add(edge.to, "dependsOn");
    }
  }
  return new Map([...why].sort(([a], [b]) => cmp(a, b)).map(([id, set]) => [id, [...set].sort(cmp).join(",")]));
}

export function computeSubject(input: SubjectInput): Subject {
  const { graph, verificationId, readFile, globalInputs } = input;
  const verification = graph.artifacts.get(verificationId);
  if (verification === undefined || verification.meta.type !== "verification") {
    throw new Error(`${verificationId} is not a verification in the graph`);
  }
  const claimed = (id: string): readonly string[] =>
    input.sliceFiles instanceof Map
      ? (input.sliceFiles.get(id) ?? [])
      : ((input.sliceFiles as Record<string, readonly string[]>)[id] ?? []);
  const fileHash = (path: string) => {
    const bytes = readFile(path);
    return bytes === undefined ? ABSENT : sha256Hex(bytes);
  };

  const parts: SubjectPart[] = [{ kind: "verification", id: verificationId, hash: verification.sourceHash }];

  const targets = new Set<string>();
  for (const edge of graph.out.get(verificationId) ?? []) if (edge.kind === "verifies") targets.add(edge.to);
  for (const id of verifiedBehaviors(graph, verificationId)) {
    targets.add(id);
    for (const edge of graph.out.get(id) ?? []) if (edge.kind === "governedBy") targets.add(edge.to);
    for (const edge of graph.in.get(id) ?? []) if (edge.kind === "illustrates") targets.add(edge.from);
  }
  for (const id of targets) {
    const artifact = graph.artifacts.get(id);
    parts.push({ kind: "verified", id, hash: artifact === undefined ? ABSENT : artifact.sourceHash });
  }

  for (const [id, why] of includedSlices(graph, verificationId)) {
    parts.push({ kind: "slice", id, hash: graph.artifacts.get(id)?.sourceHash ?? ABSENT, why });
    for (const path of [...new Set(claimed(id))].sort(cmp)) {
      parts.push({ kind: "slice-file", id: path, hash: fileHash(path), slice: id });
    }
  }

  const locator = verification.meta.verification?.locator;
  if (locator !== undefined && locator !== "") parts.push({ kind: "test", id: locator, hash: fileHash(locator) });
  for (const path of [...new Set(globalInputs)]) parts.push({ kind: "global-input", id: path, hash: fileHash(path) });

  parts.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.id, b.id) || cmp(a.slice ?? "", b.slice ?? ""));
  const entries = parts.map(({ kind, id, hash, why, slice }) => ({ kind, id, hash, why, slice }));
  return { hash: sha256Hex(canonicalJson(entries)), parts };
}

/** The parts that differ between two subjects, as `kind id` keys, sorted: added, removed or changed. */
export function movedParts(before: Subject, after: Subject): string[] {
  const key = (p: SubjectPart) => `${p.kind} ${p.id}${p.slice === undefined ? "" : ` (${p.slice})`}`;
  const a = new Map(before.parts.map((p) => [key(p), p.hash]));
  const b = new Map(after.parts.map((p) => [key(p), p.hash]));
  const moved: string[] = [];
  for (const [k, h] of a) if (b.get(k) !== h) moved.push(k);
  for (const k of b.keys()) if (!a.has(k)) moved.push(k);
  return moved.sort(cmp);
}
