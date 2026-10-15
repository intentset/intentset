/**
 * The subject of a verification (Core §8, ADR 0013): a hash of what the check
 * is about, so a run record can stay current while the subject is unchanged.
 * Pure: it reads nothing but what it is given, so the same inputs give the
 * same hash on every machine.
 *
 * The subject is:
 *
 * - the verification record and what it verifies (each verified behavior, the
 *   rules that govern it and the scenarios that illustrate it), each by the
 *   source hash of its whole record: its prose is its promise;
 * - the slices that implement the verified behaviors, the transitive closure
 *   of their `dependsOn`, and those the verification names in
 *   `verification.exercises`: each by the hash of its **binding fields**
 *   (`implements`, `dependsOn`, `claims`, `usesResources`, `entrypoints`;
 *   never its prose) and the content of every file its claims resolve to;
 *   A slice reached only through `dependsOn` is a **dependency**: under
 *   `dependencies: "entrypoint"` (`evidence.dependencies`) it contributes its
 *   binding fields, the files of its `entrypoints` and the records of the
 *   contracts it exposes or consumes and the decisions those name (a
 *   `contract` and a `decision` part), not its other claimed files; the
 *   files left out are `dependencyInternals`, so a report can say what the
 *   subject could not see (EVID007). An implementing slice and an exercised
 *   slice always contribute every file. `dependencies: "files"` is the rule
 *   of Core §8 up to 0.7.0 (ADR 0013, amended 2026-10-15, second);
 * - the resources the verification exercises: each by its registry entry and
 *   the content of the files its path matches. A resource counts where
 *   `verification.exercises` names it, or where a slice that implements a
 *   verified behavior lists it in `usesResources` and also claims a file it
 *   matches (the slice's own resource). A resource a slice merely lists is not
 *   hashed, so a change to a backend a web slice talks to does not move every
 *   check of that slice; `resourceMode: "used"` (`evidence.resources: used`)
 *   hashes the files of every resource an included slice lists, as Core §8
 *   did from 0.7.0 to 0.7.1 (ADR 0013, amended 2026-10-15). What a subject
 *   leaves out is `unexercised`, so a report can say what it could not see
 *   (EVID006);
 * - the test file (`locator`) and the local files it imports, transitively,
 *   which the caller resolves (`localImports`) with the architecture
 *   package's resolver and stops at a package boundary;
 * - the repository's global inputs, which the caller has expanded to paths.
 *
 * The slices' and resources' files are resolved by the architecture package
 * and passed in, so this package does not depend on it. The hash is the
 * SHA-256 of the canonical JSON of the sorted entries (ADR 0005), like
 * `graphHash`; a file is its content's SHA-256, a missing one the word
 * `absent`, so a deleted file moves the subject. `parts` carries each entry,
 * so a report can say which part moved (`movedParts`).
 */
import {
  canonicalJson,
  DEFAULT_EVIDENCE_DEPENDENCIES,
  type EvidenceDependencies,
  type EvidenceResources,
  type Graph,
  sha256Hex,
} from "@intentset/core";

export const SUBJECT_PART_KINDS = [
  "verification",
  "verified",
  "slice",
  "slice-file",
  "contract",
  "decision",
  "resource",
  "resource-file",
  "test",
  "test-import",
  "global-input",
] as const;
export type SubjectPartKind = (typeof SUBJECT_PART_KINDS)[number];

/** One thing that went into the hash: `id` is a record ID or a path, `hash` its content or source hash. */
export interface SubjectPart {
  kind: SubjectPartKind;
  id: string;
  hash: string;
  /** For a slice or a resource: why it is included (`implements`, `dependsOn`, `exercises`, `usesResources`; sorted, joined by a comma). */
  why?: string;
  /** For a slice file or a resource file: the slice or resource it belongs to. */
  owner?: string;
  /** The repository-relative file the part is, or the record's file: what a `git diff` names when the part moves. */
  path?: string;
}

/** A registry resource an included slice lists in `usesResources` that the subject does not hash, with the files its path matches. */
export interface UnexercisedResource {
  id: string;
  files: string[];
}

/** A dependency slice whose claimed files the subject does not hash (`dependencies: "entrypoint"`), with those files. */
export interface DependencyInternals {
  id: string;
  files: string[];
}

export interface Subject {
  hash: string;
  /** Sorted by kind, then ID. */
  parts: SubjectPart[];
  /** The resources the included slices list that this subject leaves out, sorted by ID; always empty under `resourceMode: "used"`. Not part of the hash. */
  unexercised: UnexercisedResource[];
  /** The dependency slices whose internal files this subject leaves out, sorted by ID; always empty under `dependencies: "files"`. Not part of the hash. */
  dependencyInternals: DependencyInternals[];
}

/** A registry resource as the subject sees it: its record, and the files its path matches. */
export interface SubjectResource {
  record: unknown;
  files: readonly string[];
}

export interface SubjectInput {
  graph: Graph;
  verificationId: string;
  /** Repository-relative path to its bytes; undefined when the file does not exist. */
  readFile: (path: string) => Uint8Array | undefined;
  /** A memoized hash of a file's content (or `absent`), for a caller hashing many subjects; default: hash `readFile`. */
  fileHash?: (path: string) => string;
  /** Slice ID to the repository-relative files it claims, as the architecture package resolves them. */
  sliceFiles: ReadonlyMap<string, readonly string[]> | Readonly<Record<string, readonly string[]>>;
  /** Registry resource ID to its record and files; absent means the repository declares none. */
  resources?: ReadonlyMap<string, SubjectResource>;
  /** Which resource files count (`evidence.resources`): `exercised`, the default, or `used`. */
  resourceMode?: EvidenceResources;
  /** What a dependency slice contributes (`evidence.dependencies`): `DEFAULT_EVIDENCE_DEPENDENCIES` when absent. */
  dependencyMode?: EvidenceDependencies;
  /** The local files a file imports, transitively and without the file itself, stopping at a package boundary. */
  localImports?: (path: string) => readonly string[];
  /** Files whose change affects every check and that belong to no slice (`evidence.globalInputs`), as paths. */
  globalInputs: readonly string[];
}

/** What a missing file hashes as, so a deleted file moves the subject and is told apart from an empty one. */
export const ABSENT = "absent";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The verification's `verification.exercises`, or none. */
export function exercisesOf(graph: Graph, id: string): string[] {
  const list = graph.artifacts.get(id)?.meta.verification?.exercises;
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

/** The contracts a slice exposes or consumes: its public contract records, whose change a dependent sees. */
export function contractsOf(graph: Graph, id: string): string[] {
  const out = new Set<string>();
  for (const edge of graph.out.get(id) ?? []) {
    if (
      (edge.kind === "exposes" || edge.kind === "consumes") &&
      graph.artifacts.get(edge.to)?.meta.type === "contract"
    ) {
      out.add(edge.to);
    }
  }
  return [...out].sort(cmp);
}

/** The binding fields of a slice record, canonical: what the subject hashes of it instead of the whole record. */
export function sliceBinding(graph: Graph, id: string): unknown {
  const artifact = graph.artifacts.get(id);
  if (artifact === undefined) return null;
  const links = artifact.meta.links;
  const slice = artifact.meta.slice;
  const sorted = (list: readonly string[] | undefined) => [...(list ?? [])].sort(cmp);
  return {
    implements: sorted(links.implements),
    dependsOn: sorted(links.dependsOn),
    claims: (slice?.claims ?? [])
      .map((c) => ({ kind: c.kind, path: c.path }))
      .sort((a, b) => cmp(a.kind, b.kind) || cmp(a.path, b.path)),
    usesResources: sorted(slice?.usesResources),
    entrypoints: sorted(slice?.entrypoints),
  };
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
  const fileHash =
    input.fileHash ??
    ((path: string) => {
      const bytes = readFile(path);
      return bytes === undefined ? ABSENT : sha256Hex(bytes);
    });
  const recordPart = (kind: SubjectPartKind, id: string, extra: Partial<SubjectPart> = {}): SubjectPart => {
    const artifact = graph.artifacts.get(id);
    return {
      kind,
      id,
      hash: artifact === undefined ? ABSENT : artifact.sourceHash,
      ...extra,
      ...(artifact === undefined ? {} : { path: artifact.path }),
    };
  };

  const parts: SubjectPart[] = [recordPart("verification", verificationId)];

  const targets = new Set<string>();
  for (const edge of graph.out.get(verificationId) ?? []) if (edge.kind === "verifies") targets.add(edge.to);
  for (const id of verifiedBehaviors(graph, verificationId)) {
    targets.add(id);
    for (const edge of graph.out.get(id) ?? []) if (edge.kind === "governedBy") targets.add(edge.to);
    for (const edge of graph.in.get(id) ?? []) if (edge.kind === "illustrates") targets.add(edge.from);
  }
  for (const id of targets) parts.push(recordPart("verified", id));

  const mode = input.resourceMode ?? "exercised";
  const dependencyMode = input.dependencyMode ?? DEFAULT_EVIDENCE_DEPENDENCIES;
  const internal = new Map<string, string[]>();
  const contractIds = new Set<string>();
  const resourceWhy = new Map<string, Set<string>>();
  const useResource = (id: string, reason: string) => {
    if (input.resources?.has(id) !== true) return;
    const set = resourceWhy.get(id) ?? new Set<string>();
    set.add(reason);
    resourceWhy.set(id, set);
  };
  const listed = new Set<string>();
  for (const id of exercisesOf(graph, verificationId)) useResource(id, "exercises");

  for (const [id, why] of includedSlices(graph, verificationId)) {
    const artifact = graph.artifacts.get(id);
    parts.push({
      kind: "slice",
      id,
      hash: artifact === undefined ? ABSENT : sha256Hex(canonicalJson(sliceBinding(graph, id))),
      why,
      ...(artifact === undefined ? {} : { path: artifact.path }),
    });
    const dependency = why === "dependsOn";
    if (dependency && dependencyMode === "entrypoint") {
      const surface = new Set(artifact?.meta.slice?.entrypoints ?? []);
      for (const path of [...surface].sort(cmp)) {
        parts.push({ kind: "slice-file", id: path, hash: fileHash(path), owner: id, path });
      }
      internal.set(id, [...new Set(claimed(id))].filter((path) => !surface.has(path)).sort(cmp));
      for (const contract of contractsOf(graph, id)) contractIds.add(contract);
    } else {
      for (const path of [...new Set(claimed(id))].sort(cmp)) {
        parts.push({ kind: "slice-file", id: path, hash: fileHash(path), owner: id, path });
      }
    }
    const implementing = why.split(",").includes("implements");
    for (const resource of artifact?.meta.slice?.usesResources ?? []) {
      if (input.resources?.has(resource) !== true) continue;
      if (mode === "used" || (implementing && ownsResource(claimed(id), input.resources.get(resource)?.files ?? []))) {
        useResource(resource, "usesResources");
      } else listed.add(resource);
    }
  }
  const decisionIds = new Set<string>();
  for (const id of [...contractIds].sort(cmp)) {
    parts.push(recordPart("contract", id));
    for (const edge of graph.out.get(id) ?? []) if (edge.kind === "informedBy") decisionIds.add(edge.to);
  }
  for (const id of [...decisionIds].sort(cmp)) parts.push(recordPart("decision", id));
  const unexercised: UnexercisedResource[] = [...listed]
    .filter((id) => !resourceWhy.has(id))
    .sort(cmp)
    .map((id) => ({ id, files: [...new Set(input.resources?.get(id)?.files ?? [])].sort(cmp) }));

  for (const [id, set] of resourceWhy) {
    const resource = input.resources?.get(id) as SubjectResource;
    parts.push({
      kind: "resource",
      id,
      hash: sha256Hex(canonicalJson(resource.record)),
      why: [...set].sort(cmp).join(","),
    });
    for (const path of [...new Set(resource.files)].sort(cmp)) {
      parts.push({ kind: "resource-file", id: path, hash: fileHash(path), owner: id, path });
    }
  }

  const locator = verification.meta.verification?.locator;
  if (locator !== undefined && locator !== "") {
    parts.push({ kind: "test", id: locator, hash: fileHash(locator), path: locator });
    for (const path of [...new Set(input.localImports?.(locator) ?? [])].sort(cmp)) {
      if (path !== locator) parts.push({ kind: "test-import", id: path, hash: fileHash(path), path });
    }
  }
  for (const path of [...new Set(globalInputs)]) {
    parts.push({ kind: "global-input", id: path, hash: fileHash(path), path });
  }

  // A claimed file of a dependency that another part hashes (an entrypoint of another slice, the test, a global input) is seen.
  const hashed = new Set(parts.filter((p) => p.path !== undefined).map((p) => p.path));
  const dependencyInternals: DependencyInternals[] = [...internal]
    .map(([id, files]) => ({ id, files: files.filter((path) => !hashed.has(path)) }))
    .filter((entry) => entry.files.length > 0)
    .sort((a, b) => cmp(a.id, b.id));

  parts.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.id, b.id) || cmp(a.owner ?? "", b.owner ?? ""));
  const entries = parts.map(({ kind, id, hash, why, owner }) => ({ kind, id, hash, why, owner }));
  return { hash: sha256Hex(canonicalJson(entries)), parts, unexercised, dependencyInternals };
}

/** True when a slice claims a file a resource's path matches: the resource is the slice's own, not only one it talks to. */
function ownsResource(claimedFiles: readonly string[], resourceFiles: readonly string[]): boolean {
  if (claimedFiles.length === 0 || resourceFiles.length === 0) return false;
  const files = new Set(resourceFiles);
  return claimedFiles.some((path) => files.has(path));
}

const partKey = (p: SubjectPart) => `${p.kind} ${p.id}${p.owner === undefined ? "" : ` (${p.owner})`}`;

/** The parts that differ between two subjects, as `kind id` keys, sorted: added, removed or changed. */
export function movedParts(before: Subject, after: Subject): string[] {
  const a = new Map(before.parts.map((p) => [partKey(p), p.hash]));
  const b = new Map(after.parts.map((p) => [partKey(p), p.hash]));
  const moved: string[] = [];
  for (const [k, h] of a) if (b.get(k) !== h) moved.push(k);
  for (const k of b.keys()) if (!a.has(k)) moved.push(k);
  return moved.sort(cmp);
}

/**
 * The parts of a subject whose file or record is among `changed`: what a
 * `git diff --name-only` since a record's commit says may have moved. A record
 * file that changed only in prose is named too, since the diff cannot tell it
 * from a change to a binding field; the hash decided the subject moved.
 */
export function partsChangedAmong(subject: Subject, changed: ReadonlySet<string>): string[] {
  return subject.parts
    .filter((p) => p.path !== undefined && changed.has(p.path))
    .map(partKey)
    .sort(cmp);
}
