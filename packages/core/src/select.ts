/**
 * Selecting records (spec/list.md, ADR 0016): a closed, typed selector over a
 * graph or a checked export, and the `intentset/list/0.1` result.
 *
 * The selector is data, not a language. Its fields combine with AND and the
 * values within one field with OR, as availability does (Core §7); matching is
 * exact, except that an ID ending in `*` matches by prefix. A link predicate
 * looks one hop: the record at the far end is matched on its own fields, never
 * on its links. An unknown key is an error, never ignored.
 *
 * Both sources are read through the export's projection (spec/export.md §3),
 * so a list from the tree and a list from its export give the same answer.
 * Where the answer depends on a link end the source withheld, the record is
 * undetermined: counted and listed apart, never a match and never a miss
 * (design invariant 6).
 */
import { projectArtifacts } from "./export.ts";
import { matchGlob } from "./glob.ts";
import { compareStrings, isRecord } from "./report.ts";
import { deliveryOf } from "./delivery.ts";
import { describing, type LinkIndex, linkPossible } from "./slices.ts";
import {
  ARTIFACT_TYPES,
  type ArtifactType,
  type Availability,
  DELIVERIES,
  type Delivery,
  type ExportArtifact,
  type ExportEnvelope,
  type Graph,
  LINK_KINDS,
  type Level,
  type LinkKind,
  PARENT_TARGETS,
  type Registries,
  STATUSES,
  type Status,
  VISIBILITIES,
  type Visibility,
} from "./types.ts";

/** The result's contract (spec/list.md §5). A reader rejects any other value. */
export const LIST_CONTRACT = "intentset/list/0.1";

/** What `deliveries` matches: a record's effective delivery, or `unstated` when it has none (ADR 0017). */
export const DELIVERY_VALUES = [...DELIVERIES, "unstated"] as const;
export type DeliveryValue = Delivery | "unstated";

/** The availability dimensions a selector matches, `notReleases` the one negative. */
export const AVAILABILITY_SELECTORS = ["products", "releases", "notReleases", "roles", "editions", "flags"] as const;
export type AvailabilitySelectorName = (typeof AVAILABILITY_SELECTORS)[number];
export type AvailabilitySelector = Partial<Record<AvailabilitySelectorName, string[]>>;

/** The fields a link's far end may be matched on: a record's own fields, never its links (one hop). */
export const END_FIELDS = [
  "ids",
  "types",
  "statuses",
  "deliveries",
  "owners",
  "audiences",
  "visibilities",
  "under",
  "availability",
  "hasExtension",
] as const;

/** Every selector field, in the order the normalized selector is written. */
export const SELECTOR_FIELDS = [...END_FIELDS, "links", "describing", "claims"] as const;
export type SelectorField = (typeof SELECTOR_FIELDS)[number];

export const LINK_DIRECTIONS = ["out", "in"] as const;
export const LINK_QUANTIFIERS = ["some", "none", "all"] as const;
export type LinkQuantifier = (typeof LINK_QUANTIFIERS)[number];

/** What a link's far end must be. */
export interface EndSelector {
  ids?: string[];
  types?: ArtifactType[];
  statuses?: Status[];
  /** The effective delivery (Core §7, ADR 0017), `unstated` for a record that states none. */
  deliveries?: DeliveryValue[];
  owners?: string[];
  audiences?: string[];
  visibilities?: Visibility[];
  under?: string[];
  availability?: AvailabilitySelector;
  hasExtension?: string[];
}

export interface LinkPredicate {
  direction: "out" | "in";
  kind: LinkKind;
  quantifier: LinkQuantifier;
  match?: EndSelector;
}

export interface Selector extends EndSelector {
  links?: LinkPredicate[];
  describing?: string[];
  claims?: string[];
}

export interface SelectorProblem {
  /** JSON pointer into the selector as given; "" for the whole of it. */
  pointer: string;
  message: string;
}

export type ReadSelectorResult = { ok: true; selector: Selector } | { ok: false; problems: SelectorProblem[] };

const CLOSED_VALUES: Partial<Record<SelectorField, readonly string[]>> = {
  types: ARTIFACT_TYPES,
  statuses: STATUSES,
  deliveries: DELIVERY_VALUES,
  visibilities: VISIBILITIES,
};

/**
 * spec/list.md §1: read a selector from data (a parsed `--where` file, or what the command line compiled), and
 * normalize it: every list sorted with duplicates removed, a link's quantifier written out. Every problem is
 * collected; one makes the selector unusable.
 */
export function readSelector(value: unknown): ReadSelectorResult {
  const problems: SelectorProblem[] = [];
  const selector = readFields(value, "", SELECTOR_FIELDS, problems) as Selector;
  return problems.length === 0 ? { ok: true, selector } : { ok: false, problems };
}

function readFields(
  value: unknown,
  at: string,
  allowed: readonly SelectorField[],
  problems: SelectorProblem[],
): Selector | EndSelector {
  const out: Record<string, unknown> = {};
  if (!isRecord(value)) {
    problems.push({ pointer: at, message: "A selector is an object of fields." });
    return out;
  }
  for (const key of Object.keys(value).sort(compareStrings)) {
    const pointer = `${at}/${escapePointer(key)}`;
    if (!(allowed as readonly string[]).includes(key)) {
      const hop = (SELECTOR_FIELDS as readonly string[]).includes(key);
      problems.push({
        pointer,
        message: hop
          ? `${key} cannot match a link's far end: a link predicate looks one hop, so its match holds only ${END_FIELDS.join(", ")}.`
          : `${key} is not a selector field; the fields are ${allowed.join(", ")}.`,
      });
    }
  }
  for (const field of allowed) {
    if (!Object.hasOwn(value, field)) continue;
    const pointer = `${at}/${field}`;
    const given = value[field];
    if (field === "availability") {
      const availability = readAvailability(given, pointer, problems);
      if (availability !== null) out.availability = availability;
    } else if (field === "links") {
      const links = readLinks(given, pointer, problems);
      if (links !== null) out.links = links;
    } else {
      const list = readList(given, pointer, problems, CLOSED_VALUES[field]);
      if (list === null) continue;
      if (field === "ids") {
        for (const [i, id] of list.entries()) {
          if (id.indexOf("*") !== -1 && id.indexOf("*") !== id.length - 1) {
            problems.push({
              pointer: `${pointer}/${i}`,
              message: `${id}: only a trailing * is a pattern, matching every ID that starts with what is before it.`,
            });
          }
        }
      }
      out[field] = list;
    }
  }
  return out;
}

function readList(
  value: unknown,
  pointer: string,
  problems: SelectorProblem[],
  closed?: readonly string[],
): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    problems.push({
      pointer,
      message:
        "Give a nonempty list of values; the values in one field combine with OR, and an empty list would match nothing.",
    });
    return null;
  }
  let ok = true;
  for (const [i, item] of value.entries()) {
    if (typeof item !== "string" || item === "") {
      problems.push({ pointer: `${pointer}/${i}`, message: "Each value is a nonempty string." });
      ok = false;
    } else if (closed !== undefined && !closed.includes(item)) {
      problems.push({ pointer: `${pointer}/${i}`, message: `${item} is not one of ${closed.join(", ")}.` });
      ok = false;
    }
  }
  return ok ? [...new Set(value as string[])].sort(compareStrings) : null;
}

function readAvailability(value: unknown, pointer: string, problems: SelectorProblem[]): AvailabilitySelector | null {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    problems.push({
      pointer,
      message: `availability is an object of one or more of ${AVAILABILITY_SELECTORS.join(", ")}.`,
    });
    return null;
  }
  const out: AvailabilitySelector = {};
  for (const key of Object.keys(value).sort(compareStrings)) {
    if (!(AVAILABILITY_SELECTORS as readonly string[]).includes(key)) {
      problems.push({
        pointer: `${pointer}/${escapePointer(key)}`,
        message: `${key} is not an availability field; the fields are ${AVAILABILITY_SELECTORS.join(", ")}.`,
      });
    }
  }
  for (const name of AVAILABILITY_SELECTORS) {
    if (!Object.hasOwn(value, name)) continue;
    const list = readList(value[name], `${pointer}/${name}`, problems);
    if (list !== null) out[name] = list;
  }
  return out;
}

const LINK_KEYS = ["direction", "kind", "quantifier", "match"];

function readLinks(value: unknown, pointer: string, problems: SelectorProblem[]): LinkPredicate[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    problems.push({ pointer, message: "links is a nonempty list of link predicates, each a condition of its own." });
    return null;
  }
  const out: LinkPredicate[] = [];
  for (const [i, item] of value.entries()) {
    const at = `${pointer}/${i}`;
    if (!isRecord(item)) {
      problems.push({ pointer: at, message: "A link predicate is an object: direction, kind, quantifier, match." });
      continue;
    }
    const before = problems.length;
    for (const key of Object.keys(item).sort(compareStrings)) {
      if (!LINK_KEYS.includes(key)) {
        problems.push({
          pointer: `${at}/${escapePointer(key)}`,
          message: `${key} is not part of a link predicate; its keys are ${LINK_KEYS.join(", ")}.`,
        });
      }
    }
    const direction = item.direction;
    if (!(LINK_DIRECTIONS as readonly unknown[]).includes(direction)) {
      problems.push({
        pointer: `${at}/direction`,
        message: "direction is out (links the record authors) or in (links authored to it).",
      });
    }
    const kind = item.kind;
    if (!(LINK_KINDS as readonly unknown[]).includes(kind)) {
      problems.push({ pointer: `${at}/kind`, message: `kind is one of ${LINK_KINDS.join(", ")}.` });
    }
    const quantifier = item.quantifier ?? "some";
    if (!(LINK_QUANTIFIERS as readonly unknown[]).includes(quantifier)) {
      problems.push({ pointer: `${at}/quantifier`, message: `quantifier is one of ${LINK_QUANTIFIERS.join(", ")}.` });
    }
    let match: EndSelector | undefined;
    if (Object.hasOwn(item, "match")) {
      match = readFields(item.match, `${at}/match`, END_FIELDS, problems) as EndSelector;
    } else if (quantifier === "all") {
      problems.push({
        pointer: `${at}/match`,
        message: "all needs a match: every link of a kind is trivially a link of that kind.",
      });
    }
    if (problems.length > before) continue;
    const predicate: LinkPredicate = {
      direction: direction as LinkPredicate["direction"],
      kind: kind as LinkKind,
      quantifier: quantifier as LinkQuantifier,
    };
    if (match !== undefined) predicate.match = match;
    out.push(predicate);
  }
  return problems.length === 0 ? out.sort(comparePredicates) : null;
}

function comparePredicates(a: LinkPredicate, b: LinkPredicate): number {
  return compareStrings(JSON.stringify(sortedKeys(a)), JSON.stringify(sortedKeys(b)));
}

function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareStrings)
      .map((key) => [key, sortedKeys(value[key])]),
  );
}

function escapePointer(key: string): string {
  return key.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** A record as a row of the result: what review asks of it, never its body. */
export interface ListRow {
  id: string;
  type: ArtifactType;
  title: string;
  status: Status;
  owner: string;
  visibility: Visibility;
  audiences: string[];
  path: string;
  /** Null when there is none, or when it is withheld. */
  parent: string | null;
  availability: Availability | null;
  /** Core §4's review fields: null when the record names none, `not-supplied` when the source does not carry them. */
  reviewedBy: string | null | "not-supplied";
  reviewedAt: string | null | "not-supplied";
}

export interface ListCounts {
  /** Records the source holds and the selector was tried on. */
  considered: number;
  /** Records the source withheld, which were not considered. */
  withheld: number;
  matched: number;
  /** Records whose answer depends on a link end the source withheld. */
  undetermined: number;
}

export interface Selection {
  selector: Selector;
  counts: ListCounts;
  /** The matched records, sorted by ID. */
  rows: ListRow[];
  /** The undetermined records' IDs, sorted. */
  undetermined: string[];
  /** What a reader should know about the answer, in a fixed order. */
  notes: string[];
}

export interface SelectOptions {
  /** A graph only: select over restricted artifacts too. Default false: they are withheld, as an export withholds them. */
  includeRestricted?: boolean;
  /** A graph only: the registries a value is checked against, for the notes. An export carries its own. */
  registries?: Registries;
}

/** Kleene's three values: a definite yes or no, or null when a withheld link end decides. */
type Answer = boolean | null;

function all(answers: Iterable<Answer>): Answer {
  let unknown = false;
  for (const answer of answers) {
    if (answer === false) return false;
    if (answer === null) unknown = true;
  }
  return unknown ? null : true;
}

function any(answers: Iterable<Answer>): Answer {
  let unknown = false;
  for (const answer of answers) {
    if (answer === true) return true;
    if (answer === null) unknown = true;
  }
  return unknown ? null : false;
}

interface Source {
  views: Map<string, ExportArtifact>;
  withheld: number;
  review: (id: string) => { reviewedBy: ListRow["reviewedBy"]; reviewedAt: ListRow["reviewedAt"] };
  registries: Registries | null;
}

function isGraph(source: Graph | ExportEnvelope): source is Graph {
  return source.artifacts instanceof Map;
}

function readSource(source: Graph | ExportEnvelope, options: SelectOptions): Source {
  if (isGraph(source)) {
    const projected = projectArtifacts(source, options.includeRestricted === true);
    return {
      views: new Map(projected.artifacts.map((artifact) => [artifact.id, artifact])),
      withheld: projected.withheld,
      review: (id) => {
        const meta = source.artifacts.get(id)?.meta;
        return { reviewedBy: meta?.reviewedBy ?? null, reviewedAt: meta?.reviewedAt ?? null };
      },
      registries: options.registries ?? null,
    };
  }
  return {
    views: new Map(source.artifacts.map((artifact) => [artifact.id, artifact])),
    withheld: source.withholding.artifacts,
    // Export 0.4 does not carry Core §4's review fields.
    review: () => ({ reviewedBy: "not-supplied", reviewedAt: "not-supplied" }),
    registries: source.registries,
  };
}

function viewIndex(source: Source): LinkIndex {
  const hiddenByType = new Map<ArtifactType, string[]>();
  for (const view of [...source.views.values()].sort((a, b) => compareStrings(a.id, b.id))) {
    if (view.withheldLinks === 0) continue;
    const list = hiddenByType.get(view.type);
    if (list === undefined) hiddenByType.set(view.type, [view.id]);
    else list.push(view.id);
  }
  return {
    has: (id) => source.views.has(id),
    type: (id) => source.views.get(id)?.type,
    targets: (id, kind) => ends(source.views.get(id), "out", kind),
    sources: (id, kind) => ends(source.views.get(id), "in", kind),
    hidden: (id) => (source.views.get(id)?.withheldLinks ?? 0) > 0,
    hiddenOfType: (type) => hiddenByType.get(type) ?? [],
    withholds: source.withheld > 0,
  };
}

/** The visible ends of a record's `kind` links in one direction, as the export projection carries them. */
function ends(view: ExportArtifact | undefined, direction: "out" | "in", kind: LinkKind): string[] {
  if (view === undefined) return [];
  if (direction === "in") return view.derived[kind] ?? [];
  if (kind === "parent") return view.parent === null ? [] : [view.parent];
  return view.links[kind] ?? [];
}

/**
 * spec/list.md: the records of `source` the selector picks. A graph is read through the export's projection, so
 * restricted artifacts are withheld unless `includeRestricted`; an export is read as it is, and should come from
 * `readExport`. Throws on a selector `readSelector` would reject.
 */
export function select(source: Graph | ExportEnvelope, selector: Selector, options: SelectOptions = {}): Selection {
  const read = readSelector(selector);
  if (!read.ok) {
    throw new TypeError(`select: ${read.problems.map((p) => `${p.pointer || "/"} ${p.message}`).join("; ")}`);
  }
  const normalized = read.selector;
  const src = readSource(source, options);
  const index = viewIndex(src);
  // A record that is not a slice has no describing records (Core §10), so naming one matches nothing.
  const describingSets = (normalized.describing ?? []).map((slice) =>
    src.views.has(slice) && src.views.get(slice)?.type !== "slice"
      ? { exact: new Set<string>(), loose: new Set<string>() }
      : { exact: describing(index, slice, false).ids, loose: describing(index, slice, true).ids },
  );

  const rows: ListRow[] = [];
  const undetermined: string[] = [];
  for (const id of [...src.views.keys()].sort(compareStrings)) {
    const view = src.views.get(id) as ExportArtifact;
    const answer = all([
      matchEnd(view, normalized, src),
      ...(normalized.links ?? []).map((predicate) => matchLink(view, predicate, src)),
      normalized.describing === undefined
        ? true
        : any(describingSets.map((sets) => (sets.exact.has(id) ? true : sets.loose.has(id) ? null : false))),
      normalized.claims === undefined ? true : claims(view, normalized.claims),
    ]);
    if (answer === true) rows.push(toRow(view, src));
    else if (answer === null) undetermined.push(id);
  }
  return {
    selector: normalized,
    counts: {
      considered: src.views.size,
      withheld: src.withheld,
      matched: rows.length,
      undetermined: undetermined.length,
    },
    rows,
    undetermined,
    notes: notesFor(normalized, src),
  };
}

function toRow(view: ExportArtifact, source: Source): ListRow {
  return {
    id: view.id,
    type: view.type,
    title: view.title,
    status: view.status,
    owner: view.owner,
    visibility: view.visibility,
    audiences: view.audiences,
    path: view.path,
    parent: view.parent,
    availability: view.availability,
    ...source.review(view.id),
  };
}

function matchEnd(view: ExportArtifact, selector: EndSelector, source: Source): Answer {
  const has = <T>(list: readonly T[] | undefined, value: T) => list === undefined || list.includes(value);
  if (selector.ids !== undefined && !selector.ids.some((pattern) => idMatches(pattern, view.id))) return false;
  if (!has(selector.types, view.type) || !has(selector.statuses, view.status)) return false;
  if (!has(selector.deliveries, deliveryOf(view) ?? "unstated")) return false;
  if (!has(selector.owners, view.owner) || !has(selector.visibilities, view.visibility)) return false;
  if (selector.audiences !== undefined && !view.audiences.some((a) => selector.audiences?.includes(a))) return false;
  if (selector.hasExtension !== undefined) {
    const keys = Object.keys(view.extensions ?? {});
    if (!keys.some((key) => selector.hasExtension?.includes(key))) return false;
  }
  if (selector.availability !== undefined && !availabilityMatches(view.availability, selector.availability)) {
    return false;
  }
  return selector.under === undefined ? true : under(view, selector.under, source);
}

function idMatches(pattern: string, id: string): boolean {
  return pattern.endsWith("*") ? id.startsWith(pattern.slice(0, -1)) : id === pattern;
}

/**
 * Exact matching in each dimension the selector names (Core §7): a record has a value the list names. A record with
 * no availability has no value in any dimension, so it never matches a positive dimension and always matches
 * `notReleases`.
 */
function availabilityMatches(availability: Availability | null, selector: AvailabilitySelector): boolean {
  const values = (name: keyof Availability) => availability?.[name] ?? [];
  for (const name of ["products", "releases", "roles", "editions", "flags"] as const) {
    const wanted = selector[name];
    if (wanted !== undefined && !values(name).some((value) => wanted.includes(value))) return false;
  }
  const excluded = selector.notReleases;
  return excluded === undefined || !values("releases").some((value) => excluded.includes(value));
}

/**
 * True when one of `ancestors` is on the record's navigation chain (Core §5, the ancestors impact reports), the
 * record itself not included. Undetermined when the chain stops at a record whose parent may be withheld.
 */
function under(view: ExportArtifact, ancestors: readonly string[], source: Source): Answer {
  const visited = new Set<string>([view.id]);
  let current = view;
  while (true) {
    const parent = current.parent;
    if (parent === null) {
      const cut = current.withheldLinks > 0 && PARENT_TARGETS[current.type] !== undefined;
      return cut ? null : false;
    }
    if (visited.has(parent)) return false;
    const next = source.views.get(parent);
    if (next === undefined) return false;
    if (ancestors.includes(parent)) return true;
    visited.add(parent);
    current = next;
  }
}

/**
 * One link predicate (spec/list.md §1.3): the visible ends of the record's `kind` links in the direction, each
 * matched on its own fields, and the quantifier over them. A withheld end of a kind the record can have leaves a
 * definite answer only where the visible ends already decide it.
 */
function matchLink(view: ExportArtifact, predicate: LinkPredicate, source: Source): Answer {
  const answers = ends(view, predicate.direction, predicate.kind).map((id): Answer => {
    if (predicate.match === undefined) return true;
    const far = source.views.get(id);
    return far === undefined ? false : matchEnd(far, predicate.match, source);
  });
  const hidden = view.withheldLinks > 0 && linkPossible(view.type, predicate.direction, predicate.kind);
  const unknowns = hidden ? [null] : [];
  if (predicate.quantifier === "some") return any([...answers, ...unknowns]);
  if (predicate.quantifier === "all") return all([...answers, ...unknowns]);
  const some = any([...answers, ...unknowns]);
  return some === null ? null : !some;
}

function claims(view: ExportArtifact, paths: readonly string[]): boolean {
  if (view.type !== "slice" || view.status === "retired" || view.slice === null) return false;
  const claimed = view.slice.claims;
  return paths.some((path) => claimed.some((claim) => matchGlob(claim.path, path)));
}

const REGISTRY_CHECKS: Array<{
  name: string;
  registry: keyof Registries;
  values: (selector: EndSelector) => string[] | undefined;
}> = [
  { name: "owners", registry: "owners", values: (s) => s.owners },
  { name: "audiences", registry: "audiences", values: (s) => s.audiences },
  { name: "availability.releases", registry: "releases", values: (s) => s.availability?.releases },
  { name: "availability.notReleases", registry: "releases", values: (s) => s.availability?.notReleases },
  { name: "availability.roles", registry: "roles", values: (s) => s.availability?.roles },
  { name: "availability.editions", registry: "editions", values: (s) => s.availability?.editions },
  { name: "availability.flags", registry: "flags", values: (s) => s.availability?.flags },
];

/** spec/list.md §4: what a reader needs to read the answer right. */
function notesFor(selector: Selector, source: Source): string[] {
  const notes: string[] = [];
  const ends: EndSelector[] = [selector, ...(selector.links ?? []).flatMap((link) => link.match ?? [])];
  if (ends.some((end) => end.availability !== undefined)) {
    notes.push("Status and availability are authored claims, not a reviewed release snapshot (Core §7).");
  }
  if (source.registries !== null) {
    const registries = source.registries;
    const unknown = new Set<string>();
    for (const end of ends) {
      for (const check of REGISTRY_CHECKS) {
        const declared = registries[check.registry] as readonly unknown[];
        for (const value of check.values(end) ?? []) {
          if (!declared.includes(value)) {
            const effect = check.name.endsWith("notReleases") ? "excludes" : "matches";
            unknown.add(`${check.name}: ${value} is not in the ${check.registry} registry, so it ${effect} no record.`);
          }
        }
      }
    }
    notes.push(...[...unknown].sort(compareStrings));
  }
  for (const slice of selector.describing ?? []) {
    const view = source.views.get(slice);
    if (view?.type === "slice") continue;
    notes.push(
      view !== undefined
        ? `describing: ${slice} is ${/^[aeiou]/.test(view.type) ? "an" : "a"} ${view.type}, not a slice.`
        : source.withheld > 0
          ? `describing: ${slice} is not a visible slice; it may be withheld, so what describes it is undetermined.`
          : `describing: ${slice} is not a slice in this source, so nothing describes it.`,
    );
  }
  return notes;
}

/** The fields `--count-by` groups by: a record's own, and each availability dimension. */
export const COUNT_FIELDS = [
  "type",
  "status",
  "owner",
  "visibility",
  "audience",
  "product",
  "release",
  "role",
  "edition",
  "flag",
] as const;
export type CountField = (typeof COUNT_FIELDS)[number];

const MULTI_VALUED: Partial<Record<CountField, (row: ListRow) => string[]>> = {
  audience: (row) => row.audiences,
  product: (row) => row.availability?.products ?? [],
  release: (row) => row.availability?.releases ?? [],
  role: (row) => row.availability?.roles ?? [],
  edition: (row) => row.availability?.editions ?? [],
  flag: (row) => row.availability?.flags ?? [],
};

export interface CountBy {
  field: CountField;
  /** True when a record can hold several values, so it counts once under each and the counts can sum past `matched`. */
  multiValued: boolean;
  /** Sorted by value, the group of records with no value (null) last. */
  groups: Array<{ value: string | null; count: number }>;
}

/** spec/list.md §5.2: the matched records counted by one field. Counts only: never a percentage. */
export function countBy(selection: Selection, field: CountField): CountBy {
  const counts = new Map<string | null, number>();
  const bump = (value: string | null) => counts.set(value, (counts.get(value) ?? 0) + 1);
  const multi = MULTI_VALUED[field];
  for (const row of selection.rows) {
    if (multi === undefined) bump(row[field as "type" | "status" | "owner" | "visibility"]);
    else {
      const values = [...new Set(multi(row))];
      if (values.length === 0) bump(null);
      for (const value of values) bump(value);
    }
  }
  const groups = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => (a.value === null ? 1 : b.value === null ? -1 : compareStrings(a.value, b.value)));
  return { field, multiValued: multi !== undefined, groups };
}

/** The snapshot a list names (spec/list.md §5): the source's commit and graph hash. */
export interface ListSnapshot {
  repository: string;
  commit: string | null;
  commitUnavailable?: string;
  uncommitted: boolean;
  graphHash: string;
  /** An export source only: when it was generated. */
  generatedAt?: string;
}

export interface ListValidation {
  level: Level;
  status: "pass" | "fail";
  errors: number;
  warnings: number;
}

/** The `intentset/list/0.1` result (spec/list.md §5). */
export interface ListOutput {
  contract: typeof LIST_CONTRACT;
  /** `tree` when the records were read from the repository, `export` when from an export envelope. */
  source: "tree" | "export";
  snapshot: ListSnapshot;
  validation: ListValidation;
  selector: Selector;
  counts: ListCounts;
  rows: ListRow[];
  undetermined: string[];
  countBy: CountBy | null;
  notes: string[];
}

/** The snapshot and validation an export names, for a list read from it. */
export function exportListMeta(envelope: ExportEnvelope): { snapshot: ListSnapshot; validation: ListValidation } {
  const snapshot: ListSnapshot = {
    repository: envelope.repository,
    commit: envelope.source.commit,
    uncommitted: envelope.source.uncommitted,
    graphHash: envelope.graphHash,
    generatedAt: envelope.generatedAt,
  };
  if (envelope.source.commitUnavailable !== undefined) snapshot.commitUnavailable = envelope.source.commitUnavailable;
  const { level, status, errors, warnings } = envelope.validation;
  return { snapshot, validation: { level, status, errors, warnings } };
}

/** spec/list.md §5: a selection as the versioned result, with the snapshot and validation it was made over. */
export function listOutput(
  selection: Selection,
  meta: { source: "tree" | "export"; snapshot: ListSnapshot; validation: ListValidation },
  countField: CountField | null = null,
): ListOutput {
  return {
    contract: LIST_CONTRACT,
    source: meta.source,
    snapshot: meta.snapshot,
    validation: meta.validation,
    selector: selection.selector,
    counts: selection.counts,
    rows: selection.rows,
    undetermined: selection.undetermined,
    countBy: countField === null ? null : countBy(selection, countField),
    notes: selection.notes,
  };
}
