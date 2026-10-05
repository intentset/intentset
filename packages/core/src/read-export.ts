/**
 * Reading an export as a consumer must (spec/export.md §5): the checks a
 * connector runs before it lets an envelope replace the snapshot it holds.
 *
 *   not-json              the bytes are not UTF-8 JSON, or are over the size limit
 *   unsupported-contract  `contract` is missing or names a version this reader does not know
 *   malformed             the value does not have the envelope's shape (spec/export.schema.json)
 *   identity-mismatch     the repository or product is not the one the connection was made for
 *   mixed-snapshot        a report was computed at another commit or graph hash than the envelope's
 *   forbidden-content     the envelope holds what its own withholding says it left out
 *   inconsistent-report   counts, statuses or IDs contradict each other or the artifacts
 *
 * The first three stop the read; the rest are all collected, and the result's
 * category is the first in that order. The shape checks are typed code that
 * mirrors the schema (ADR 0002), and a test holds the two in agreement over
 * every consumer fixture. Nothing here trusts the producer to have been this
 * implementation: a consumer in another language makes the same checks.
 */
import { compareStrings, isRecord } from "./report.ts";
import {
  CLAIM_KINDS,
  EXPORT_EVIDENCE_STATUSES,
  EXPORT_REPORTS,
  type ExportEnvelope,
  type ExportReportName,
  ID_PATTERN,
  LEVELS,
  LINK_KINDS,
  MEASURE_DIRECTIONS,
  METRIC_PATTERN,
  OWNERSHIP_REGIONS,
  STATUSES,
  SUPPORTED_EXPORT_CONTRACTS,
  ARTIFACT_TYPES,
  TIP_MAX_LENGTH,
  TIP_PATTERN,
  VISIBILITIES,
} from "./types.ts";

export const EXPORT_PROBLEM_CATEGORIES = [
  "not-json",
  "unsupported-contract",
  "malformed",
  "identity-mismatch",
  "mixed-snapshot",
  "forbidden-content",
  "inconsistent-report",
] as const;
export type ExportProblemCategory = (typeof EXPORT_PROBLEM_CATEGORIES)[number];

export interface ExportProblem {
  category: ExportProblemCategory;
  /** JSON pointer to the offending value; "" for the whole input. */
  pointer: string;
  /** One sentence, safe to show: it quotes structure, never artifact text. */
  message: string;
}

export interface ReadExportOptions {
  /** The repository the connection was made for: the envelope's `repository` must equal it. */
  repository?: string;
  /** The product the connection was made for: it must be one of the envelope's `products`. */
  product?: string;
  /** Largest input accepted, in bytes, for a string or byte input. Default 64 MiB. */
  maxBytes?: number;
}

export type ReadExportResult =
  | {
      ok: true;
      envelope: ExportEnvelope;
      /** The report sections present, in EXPORT_REPORTS order. Any other is not supplied, never zero or pass. */
      supplied: ExportReportName[];
    }
  | { ok: false; category: ExportProblemCategory; problems: ExportProblem[] };

export const EXPORT_MAX_BYTES = 64 * 1024 * 1024;

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const GENERATED_AT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$/;
const TIMESTAMP =
  /^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,9})?Z$/;
/** Intentset's codes, for every origin but syntax. */
const CODE = /^[A-Z]+[0-9]{3}$/;
/** Markset's own codes, which a diagnostic with origin syntax carries unchanged (§1): a host never renames them. */
const MARKSET_CODE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;
const POINTER = /^(?:\/.*)?$/;
const PROFILE = /^intentset\/[a-z]+\/0\.1$/;
const EXTENSION_KEY = /^[^/]+\/.+$/;
const TOKEN = /^\S+$/;
const TEXT = /\S/;
const URI = /^[A-Za-z][A-Za-z0-9+.-]*:\S+$/;

/** spec/export.md §5: read an envelope as a consumer must, from text, bytes or an already parsed value. */
export function readExport(input: unknown, options: ReadExportOptions = {}): ReadExportResult {
  const maxBytes = options.maxBytes ?? EXPORT_MAX_BYTES;
  let value: unknown = input;
  if (typeof input === "string" || input instanceof Uint8Array) {
    const bytes = typeof input === "string" ? new TextEncoder().encode(input).length : input.length;
    if (bytes > maxBytes) {
      return failed("not-json", "", `The export is ${bytes} bytes, over the ${maxBytes}-byte limit.`);
    }
    let text: string;
    try {
      text = typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true }).decode(input);
    } catch {
      return failed("not-json", "", "The export is not valid UTF-8.");
    }
    try {
      value = JSON.parse(text);
    } catch (error) {
      return failed("not-json", "", `The export is not JSON: ${(error as Error).message}`);
    }
  }

  if (!isRecord(value) || typeof value.contract !== "string") {
    return failed("unsupported-contract", "/contract", "The export names no contract, so its version is unknown.");
  }
  if (!SUPPORTED_EXPORT_CONTRACTS.includes(value.contract)) {
    return failed(
      "unsupported-contract",
      "/contract",
      `The export's contract is ${JSON.stringify(value.contract).slice(0, 80)}; this reader supports ${SUPPORTED_EXPORT_CONTRACTS.join(", ")}.`,
    );
  }

  const shape = new Shape();
  shape.envelope(value);
  if (shape.problems.length > 0) {
    return { ok: false, category: "malformed", problems: shape.problems };
  }
  const envelope = value as unknown as ExportEnvelope;
  const problems = [
    ...identity(envelope, options),
    ...snapshots(envelope),
    ...forbidden(envelope),
    ...consistency(envelope),
  ];
  if (problems.length > 0) {
    const rank = (p: ExportProblem) => EXPORT_PROBLEM_CATEGORIES.indexOf(p.category);
    problems.sort((a, b) => rank(a) - rank(b) || compareStrings(a.pointer, b.pointer));
    return { ok: false, category: problems[0].category, problems };
  }
  return { ok: true, envelope, supplied: EXPORT_REPORTS.filter((name) => envelope.reports[name] !== undefined) };
}

function failed(category: ExportProblemCategory, pointer: string, message: string): ReadExportResult {
  return { ok: false, category, problems: [{ category, pointer, message }] };
}

/** The shape checks: spec/export.schema.json in typed code. Every problem is `malformed`. */
class Shape {
  problems: ExportProblem[] = [];

  fail(pointer: string, message: string): void {
    // A broken input can repeat one mistake thousands of times; the first hundred say enough.
    if (this.problems.length < 100) this.problems.push({ category: "malformed", pointer, message });
  }

  /** An object with exactly these members (optional ones may be absent); null when it is not an object. */
  object(
    value: unknown,
    at: string,
    required: readonly string[],
    optional: readonly string[] = [],
  ): Record<string, unknown> | null {
    if (!isRecord(value)) {
      this.fail(at, "Expected an object.");
      return null;
    }
    for (const key of required)
      if (!Object.hasOwn(value, key)) this.fail(`${at}/${key}`, `Missing required member ${key}.`);
    for (const key of Object.keys(value)) {
      if (!required.includes(key) && !optional.includes(key))
        this.fail(`${at}/${pointerToken(key)}`, `Unknown member ${key}.`);
    }
    return value;
  }

  string(value: unknown, at: string, pattern?: RegExp, what = "a string"): value is string {
    if (typeof value !== "string" || value.length === 0) {
      this.fail(at, `Expected ${what}.`);
      return false;
    }
    if (pattern !== undefined && !pattern.test(value)) {
      this.fail(at, `Expected ${what}.`);
      return false;
    }
    return true;
  }

  nullable(value: unknown, at: string, check: (value: unknown, at: string) => void): void {
    if (value !== null) check(value, at);
  }

  id(value: unknown, at: string): void {
    this.string(value, at, ID_PATTERN, "an artifact ID");
  }

  integer(value: unknown, at: string, minimum = 0): void {
    if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) {
      this.fail(at, `Expected an integer of at least ${minimum}.`);
    }
  }

  boolean(value: unknown, at: string): void {
    if (typeof value !== "boolean") this.fail(at, "Expected true or false.");
  }

  oneOf(value: unknown, at: string, options: readonly unknown[]): void {
    if (!options.includes(value)) this.fail(at, `Expected one of ${options.join(", ")}.`);
  }

  /** An array whose items pass `item`; `unique` compares items as JSON, `sorted` as strings or by `key`. */
  array(
    value: unknown,
    at: string,
    item: (value: unknown, at: string) => void,
    rules: { unique?: boolean; minItems?: number; sortedBy?: (value: unknown) => string } = {},
  ): unknown[] {
    if (!Array.isArray(value)) {
      this.fail(at, "Expected an array.");
      return [];
    }
    for (const [i, entry] of value.entries()) item(entry, `${at}/${i}`);
    if (rules.minItems !== undefined && value.length < rules.minItems) {
      this.fail(at, `Expected at least ${rules.minItems} item${rules.minItems === 1 ? "" : "s"}.`);
    }
    if (rules.unique === true && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) {
      this.fail(at, "Expected no repeated items.");
    }
    if (rules.sortedBy !== undefined) {
      const keys = value.map(rules.sortedBy);
      for (let i = 1; i < keys.length; i++) {
        if (compareStrings(keys[i - 1], keys[i]) >= 0) {
          this.fail(`${at}/${i}`, "Expected items sorted and unique.");
          break;
        }
      }
    }
    return value;
  }

  strings(value: unknown, at: string, rules: { minItems?: number } = {}): void {
    this.array(value, at, (v, p) => this.string(v, p), { unique: true, ...rules });
  }

  ids(value: unknown, at: string): void {
    this.array(value, at, (v, p) => this.id(v, p), { unique: true });
  }

  extensions(value: unknown, at: string): void {
    if (!isRecord(value)) {
      this.fail(at, "Expected an object.");
      return;
    }
    for (const key of Object.keys(value)) {
      if (!EXTENSION_KEY.test(key))
        this.fail(`${at}/${pointerToken(key)}`, "Expected a namespaced key such as example.org/name.");
    }
  }

  envelope(value: Record<string, unknown>): void {
    const v = this.object(value, "", [
      "contract",
      "spec",
      "generatedAt",
      "repository",
      "products",
      "source",
      "graphHash",
      "release",
      "validation",
      "withholding",
      "registries",
      "artifacts",
      "reports",
    ]);
    if (v === null) return;
    if (v.spec !== "0.1") this.fail("/spec", "Expected 0.1.");
    this.string(v.generatedAt, "/generatedAt", GENERATED_AT, "an ISO 8601 time");
    this.string(v.repository, "/repository");
    this.array(v.products, "/products", (p, at) => this.id(p, at), { sortedBy: String });
    this.source(v.source);
    this.string(v.graphHash, "/graphHash", SHA256, "a SHA-256 in lowercase hex");
    this.nullable(v.release, "/release", (release, at) => {
      const r = this.object(release, at, ["product", "label"]);
      if (r === null) return;
      this.id(r.product, `${at}/product`);
      this.string(r.label, `${at}/label`);
    });
    this.validation(v.validation);
    const w = this.object(v.withholding, "/withholding", ["visibilities", "artifacts", "diagnostics"]);
    if (w !== null) {
      this.array(w.visibilities, "/withholding/visibilities", (x, at) => this.oneOf(x, at, VISIBILITIES), {
        unique: true,
      });
      this.integer(w.artifacts, "/withholding/artifacts");
      this.integer(w.diagnostics, "/withholding/diagnostics");
    }
    this.registries(v.registries);
    this.array(v.artifacts, "/artifacts", (a, at) => this.artifact(a, at), {
      sortedBy: (a) => (isRecord(a) && typeof a.id === "string" ? a.id : ""),
    });
    this.reports(v.reports);
  }

  source(value: unknown): void {
    const s = this.object(value, "/source", ["commit", "uncommitted"], ["commitUnavailable"]);
    if (s === null) return;
    this.boolean(s.uncommitted, "/source/uncommitted");
    if (s.commit === null) {
      if (!Object.hasOwn(s, "commitUnavailable"))
        this.fail("/source/commitUnavailable", "Expected a reason when commit is null.");
      else this.string(s.commitUnavailable, "/source/commitUnavailable");
      if (s.uncommitted === true) this.fail("/source/uncommitted", "Expected false when commit is null.");
    } else {
      this.string(s.commit, "/source/commit", COMMIT, "a full commit ID");
      if (Object.hasOwn(s, "commitUnavailable"))
        this.fail("/source/commitUnavailable", "Expected no reason when there is a commit.");
    }
  }

  validation(value: unknown): void {
    const v = this.object(value, "/validation", ["level", "scope", "status", "errors", "warnings", "diagnostics"]);
    if (v === null) return;
    this.oneOf(v.level, "/validation/level", LEVELS);
    this.array(v.scope, "/validation/scope", (s, at) => this.string(s, at));
    this.oneOf(v.status, "/validation/status", ["pass", "fail"]);
    this.integer(v.errors, "/validation/errors");
    this.integer(v.warnings, "/validation/warnings");
    this.array(v.diagnostics, "/validation/diagnostics", (d, at) => this.diagnostic(d, at));
  }

  diagnostic(value: unknown, at: string): void {
    const d = this.object(
      value,
      at,
      ["code", "severity", "origin", "artifact", "path", "message", "remediation"],
      ["location", "field"],
    );
    if (d === null) return;
    if (d.origin === "syntax") {
      this.string(
        d.code,
        `${at}/code`,
        MARKSET_CODE,
        "a Markset code such as DIRECTIVE_UNKNOWN_NAME, as the origin is syntax",
      );
    } else {
      this.string(d.code, `${at}/code`, CODE, "an Intentset code such as CORE003");
    }
    this.oneOf(d.severity, `${at}/severity`, ["error", "warning"]);
    this.oneOf(d.origin, `${at}/origin`, [
      "syntax",
      "profile",
      "graph",
      "architecture",
      "evidence",
      "publication",
      "render",
    ]);
    if (d.artifact !== null && typeof d.artifact !== "string")
      this.fail(`${at}/artifact`, "Expected a string or null.");
    if (d.path !== null && typeof d.path !== "string") this.fail(`${at}/path`, "Expected a string or null.");
    if (Object.hasOwn(d, "location")) {
      const l = this.object(d.location, `${at}/location`, ["line"], ["column"]);
      if (l !== null) {
        this.integer(l.line, `${at}/location/line`, 1);
        if (Object.hasOwn(l, "column")) this.integer(l.column, `${at}/location/column`, 1);
      }
    }
    if (Object.hasOwn(d, "field") && (typeof d.field !== "string" || !POINTER.test(d.field))) {
      this.fail(`${at}/field`, "Expected a JSON pointer.");
    }
    this.string(d.message, `${at}/message`);
    this.string(d.remediation, `${at}/remediation`);
  }

  registries(value: unknown): void {
    const at = "/registries";
    const r = this.object(value, at, [
      "owners",
      "audiences",
      "releases",
      "roles",
      "editions",
      "flags",
      "evidenceSources",
      "resources",
    ]);
    if (r === null) return;
    for (const key of ["owners", "audiences", "releases", "roles", "editions", "flags", "evidenceSources"])
      this.strings(r[key], `${at}/${key}`);
    this.array(r.resources, `${at}/resources`, (resource, p) => {
      const x = this.object(resource, p, ["id", "path", "owner", "consumers"]);
      if (x === null) return;
      this.id(x.id, `${p}/id`);
      this.string(x.path, `${p}/path`);
      this.string(x.owner, `${p}/owner`);
      this.strings(x.consumers, `${p}/consumers`);
    });
  }

  artifact(value: unknown, at: string): void {
    const a = this.object(
      value,
      at,
      [
        "id",
        "type",
        "title",
        "status",
        "owner",
        "visibility",
        "audiences",
        "profile",
        "revision",
        "path",
        "sourceHash",
        "parent",
        "links",
        "derived",
        "withheldLinks",
        "availability",
        "slice",
        "verification",
        "measure",
        "tips",
        "extensions",
      ],
      ["body"],
    );
    if (a === null) return;
    this.id(a.id, `${at}/id`);
    this.oneOf(a.type, `${at}/type`, ARTIFACT_TYPES);
    this.string(a.title, `${at}/title`);
    this.oneOf(a.status, `${at}/status`, STATUSES);
    this.string(a.owner, `${at}/owner`);
    this.oneOf(a.visibility, `${at}/visibility`, VISIBILITIES);
    this.strings(a.audiences, `${at}/audiences`, { minItems: 1 });
    this.string(a.profile, `${at}/profile`, PROFILE, "a profile such as intentset/behavior/0.1");
    this.nullable(a.revision, `${at}/revision`, (r, p) => this.integer(r, p, 1));
    this.string(a.path, `${at}/path`);
    this.string(a.sourceHash, `${at}/sourceHash`, SHA256, "a SHA-256 in lowercase hex");
    this.nullable(a.parent, `${at}/parent`, (p, q) => this.id(p, q));
    const kinds = LINK_KINDS.filter((kind) => kind !== "parent");
    const links = this.object(a.links, `${at}/links`, [], kinds);
    if (links !== null)
      for (const key of Object.keys(links))
        if (kinds.includes(key as never)) this.ids(links[key], `${at}/links/${key}`);
    const derived = this.object(a.derived, `${at}/derived`, [], LINK_KINDS);
    if (derived !== null) {
      for (const key of Object.keys(derived))
        if (LINK_KINDS.includes(key as never)) this.ids(derived[key], `${at}/derived/${key}`);
    }
    this.integer(a.withheldLinks, `${at}/withheldLinks`);
    this.nullable(a.availability, `${at}/availability`, (x, p) => {
      const av = this.object(x, p, ["products", "releases", "roles", "editions", "flags"]);
      if (av === null) return;
      for (const key of ["products", "releases", "roles", "editions"])
        this.strings(av[key], `${p}/${key}`, { minItems: 1 });
      this.strings(av.flags, `${p}/flags`);
    });
    this.nullable(a.slice, `${at}/slice`, (x, p) => this.slice(x, p));
    this.nullable(a.verification, `${at}/verification`, (x, p) => {
      const v = this.object(x, p, ["method", "locator", "selector"]);
      if (v === null) return;
      this.oneOf(v.method, `${p}/method`, ["automated", "manual"]);
      this.string(v.locator, `${p}/locator`);
      this.string(v.selector, `${p}/selector`);
    });
    this.nullable(a.measure, `${at}/measure`, (x, p) => {
      const m = this.object(x, p, ["metric", "baseline", "target", "window", "source", "direction"]);
      if (m === null) return;
      this.string(m.metric, `${p}/metric`, METRIC_PATTERN, "a metric identifier such as median_time_to_intervention");
      for (const key of ["baseline", "target", "window", "source"]) this.string(m[key], `${p}/${key}`);
      this.nullable(m.direction, `${p}/direction`, (d, q) => this.oneOf(d, q, MEASURE_DIRECTIONS));
    });
    this.nullable(a.tips, `${at}/tips`, (x, p) => {
      if (!isRecord(x)) {
        this.fail(p, "Expected an object of tips by explained ID.");
        return;
      }
      for (const key of Object.keys(x).sort(compareStrings)) {
        const q = `${p}/${key}`;
        if (!ID_PATTERN.test(key)) this.fail(q, "Expected an artifact ID as the key.");
        const tip = x[key];
        if (typeof tip !== "string" || tip.length > TIP_MAX_LENGTH || !TIP_PATTERN.test(tip)) {
          this.fail(q, `Expected one line of plain text, at most ${TIP_MAX_LENGTH} characters.`);
        }
      }
    });
    this.nullable(a.extensions, `${at}/extensions`, (x, p) => this.extensions(x, p));
    if (Object.hasOwn(a, "body") && typeof a.body !== "string") this.fail(`${at}/body`, "Expected a string.");
  }

  slice(value: unknown, at: string): void {
    const s = this.object(
      value,
      at,
      ["kind", "domain", "entrypoints", "layers", "claims", "usesResources"],
      ["rationale"],
    );
    if (s === null) return;
    this.oneOf(s.kind, `${at}/kind`, ["product", "technical"]);
    if (Object.hasOwn(s, "rationale") && typeof s.rationale !== "string")
      this.fail(`${at}/rationale`, "Expected a string.");
    if (typeof s.domain !== "string") this.fail(`${at}/domain`, "Expected a string.");
    this.strings(s.entrypoints, `${at}/entrypoints`, { minItems: 1 });
    if (isRecord(s.layers)) {
      for (const [layer, files] of Object.entries(s.layers)) this.strings(files, `${at}/layers/${pointerToken(layer)}`);
    } else {
      this.fail(`${at}/layers`, "Expected an object.");
    }
    this.array(s.claims, `${at}/claims`, (claim, p) => {
      const c = this.object(claim, p, ["kind", "path"]);
      if (c === null) return;
      this.oneOf(c.kind, `${p}/kind`, CLAIM_KINDS);
      this.string(c.path, `${p}/path`);
    });
    this.ids(s.usesResources, `${at}/usesResources`);
  }

  reports(value: unknown): void {
    const r = this.object(value, "/reports", [], EXPORT_REPORTS);
    if (r === null) return;
    if (Object.hasOwn(r, "evidence")) this.evidence(r.evidence, "/reports/evidence");
    if (Object.hasOwn(r, "knowledge")) this.knowledge(r.knowledge, "/reports/knowledge");
    if (Object.hasOwn(r, "impact")) this.impact(r.impact, "/reports/impact");
    if (Object.hasOwn(r, "ownership")) this.ownership(r.ownership, "/reports/ownership");
  }

  snapshotCommit(value: unknown, at: string): void {
    this.nullable(value, at, (c, p) => this.string(c, p, COMMIT, "a full commit ID"));
  }

  evidence(value: unknown, at: string): void {
    const e = this.object(value, at, ["commit", "graphHash", "scope", "records", "verifications", "claims"]);
    if (e === null) return;
    this.snapshotCommit(e.commit, `${at}/commit`);
    this.string(e.graphHash, `${at}/graphHash`, SHA256, "a SHA-256 in lowercase hex");
    this.nullable(e.scope, `${at}/scope`, (x, p) => this.runScope(x, p));
    this.integer(e.records, `${at}/records`);
    const byId = (x: unknown) => (isRecord(x) && typeof x.id === "string" ? x.id : "");
    this.array(
      e.verifications,
      `${at}/verifications`,
      (x, p) => {
        const v = this.object(x, p, ["id", "method", "status", "note", "latest", "atSnapshot", "runs", "outOfScope"]);
        if (v === null) return;
        this.id(v.id, `${p}/id`);
        this.oneOf(v.method, `${p}/method`, ["automated", "manual"]);
        this.oneOf(v.status, `${p}/status`, EXPORT_EVIDENCE_STATUSES);
        this.nullable(v.note, `${p}/note`, (n, q) => this.string(n, q));
        this.nullable(v.latest, `${p}/latest`, (r, q) => this.runRecord(r, q));
        const counts = this.object(v.atSnapshot, `${p}/atSnapshot`, ["pass", "fail", "skip", "error"]);
        if (counts !== null)
          for (const key of ["pass", "fail", "skip", "error"]) this.integer(counts[key], `${p}/atSnapshot/${key}`);
        this.integer(v.runs, `${p}/runs`);
        this.integer(v.outOfScope, `${p}/outOfScope`);
      },
      { sortedBy: byId },
    );
    this.array(
      e.claims,
      `${at}/claims`,
      (x, p) => {
        const c = this.object(x, p, [
          "id",
          "type",
          "lifecycle",
          "required",
          "linked",
          "verified",
          "verifications",
          "withheld",
        ]);
        if (c === null) return;
        this.id(c.id, `${p}/id`);
        this.oneOf(c.type, `${p}/type`, ["behavior", "rule", "scenario"]);
        this.oneOf(c.lifecycle, `${p}/lifecycle`, STATUSES);
        this.boolean(c.required, `${p}/required`);
        this.boolean(c.linked, `${p}/linked`);
        this.boolean(c.verified, `${p}/verified`);
        this.array(c.verifications, `${p}/verifications`, (id, q) => this.id(id, q), { sortedBy: String });
        this.integer(c.withheld, `${p}/withheld`);
      },
      { sortedBy: byId },
    );
  }

  runScope(value: unknown, at: string): void {
    const s = this.object(value, at, ["product", "release"]);
    if (s === null) return;
    this.id(s.product, `${at}/product`);
    this.string(s.release, `${at}/release`, TEXT);
  }

  runRecord(value: unknown, at: string): void {
    const r = this.object(
      value,
      at,
      [
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
      ],
      ["rationale", "extensions"],
    );
    if (r === null) return;
    this.string(r.evidenceId, `${at}/evidenceId`, TOKEN);
    this.id(r.verificationId, `${at}/verificationId`);
    this.string(r.commit, `${at}/commit`, TOKEN);
    if (r.graphHash !== "@current") this.string(r.graphHash, `${at}/graphHash`, SHA256, "a SHA-256 in lowercase hex");
    this.string(r.environment, `${at}/environment`, TEXT);
    this.runScope(r.scope, `${at}/scope`);
    this.nullable(r.tool, `${at}/tool`, (x, p) => {
      const t = this.object(x, p, ["name", "version"]);
      if (t === null) return;
      this.string(t.name, `${p}/name`, TEXT);
      this.string(t.version, `${p}/version`, TEXT);
    });
    this.nullable(r.reviewer, `${at}/reviewer`, (x, p) => this.string(x, p, TEXT));
    this.string(r.startedAt, `${at}/startedAt`, TIMESTAMP, "a UTC timestamp");
    this.string(r.finishedAt, `${at}/finishedAt`, TIMESTAMP, "a UTC timestamp");
    this.oneOf(r.result, `${at}/result`, ["pass", "fail", "skip", "error"]);
    this.string(r.uri, `${at}/uri`, URI, "a URI");
    if (Object.hasOwn(r, "rationale")) this.string(r.rationale, `${at}/rationale`, TEXT);
    if (Object.hasOwn(r, "extensions")) this.extensions(r.extensions, `${at}/extensions`);
    if (typeof r.reviewer === "string" && !Object.hasOwn(r, "rationale")) {
      this.fail(`${at}/rationale`, "Expected a rationale for a manual review.");
    }
    if (r.reviewer === null && !isRecord(r.tool)) this.fail(`${at}/tool`, "Expected the tool of an automated run.");
  }

  knowledge(value: unknown, at: string): void {
    const k = this.object(value, at, ["graphHash", "artifacts"]);
    if (k === null) return;
    this.string(k.graphHash, `${at}/graphHash`, SHA256, "a SHA-256 in lowercase hex");
    this.array(
      k.artifacts,
      `${at}/artifacts`,
      (x, p) => {
        const e = this.object(x, p, [
          "id",
          "lifecycle",
          "status",
          "reviewer",
          "reviewedAt",
          "sources",
          "changed",
          "missing",
          "withheld",
        ]);
        if (e === null) return;
        this.id(e.id, `${p}/id`);
        this.oneOf(e.lifecycle, `${p}/lifecycle`, STATUSES);
        this.oneOf(e.status, `${p}/status`, ["current", "needs-review"]);
        this.nullable(e.reviewer, `${p}/reviewer`, (r, q) => this.string(r, q));
        this.nullable(e.reviewedAt, `${p}/reviewedAt`, (r, q) => this.string(r, q));
        for (const key of ["sources", "changed", "missing"]) {
          this.array(e[key], `${p}/${key}`, (id, q) => this.id(id, q), { sortedBy: String });
        }
        this.integer(e.withheld, `${p}/withheld`);
      },
      { sortedBy: (x) => (isRecord(x) && typeof x.id === "string" ? x.id : "") },
    );
  }

  impact(value: unknown, at: string): void {
    const i = this.object(value, at, ["graphHash", "note", "starts"]);
    if (i === null) return;
    this.string(i.graphHash, `${at}/graphHash`, SHA256, "a SHA-256 in lowercase hex");
    this.string(i.note, `${at}/note`);
    const hits = (list: unknown, p: string) =>
      this.array(list, p, (x, q) => {
        const h = this.object(x, q, ["id", "path"]);
        if (h === null) return;
        this.id(h.id, `${q}/id`);
        this.array(
          h.path,
          `${q}/path`,
          (step, r) => {
            const s = this.object(step, r, ["id", "via", "reason"]);
            if (s === null) return;
            this.id(s.id, `${r}/id`);
            this.string(s.via, `${r}/via`);
            this.string(s.reason, `${r}/reason`);
          },
          { minItems: 1 },
        );
      });
    this.array(
      i.starts,
      `${at}/starts`,
      (x, p) => {
        const e = this.object(x, p, ["start", "direct", "candidates", "context", "ancestors", "withheld"]);
        if (e === null) return;
        this.id(e.start, `${p}/start`);
        hits(e.direct, `${p}/direct`);
        hits(e.candidates, `${p}/candidates`);
        hits(e.context, `${p}/context`);
        this.ids(e.ancestors, `${p}/ancestors`);
        this.integer(e.withheld, `${p}/withheld`);
      },
      { sortedBy: (x) => (isRecord(x) && typeof x.start === "string" ? x.start : "") },
    );
  }

  ownership(value: unknown, at: string): void {
    const o = this.object(value, at, ["commit", "graphHash", "files", "withheld"]);
    if (o === null) return;
    this.snapshotCommit(o.commit, `${at}/commit`);
    this.string(o.graphHash, `${at}/graphHash`, SHA256, "a SHA-256 in lowercase hex");
    this.array(
      o.files,
      `${at}/files`,
      (x, p) => {
        const f = this.object(x, p, ["path", "region", "owner"]);
        if (f === null) return;
        this.string(f.path, `${p}/path`);
        this.oneOf(f.region, `${p}/region`, OWNERSHIP_REGIONS);
        this.nullable(f.owner, `${p}/owner`, (id, q) => this.id(id, q));
      },
      { sortedBy: (x) => (isRecord(x) && typeof x.path === "string" ? x.path : "") },
    );
    this.integer(o.withheld, `${at}/withheld`);
  }
}

function pointerToken(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}

function identity(envelope: ExportEnvelope, options: ReadExportOptions): ExportProblem[] {
  const problems: ExportProblem[] = [];
  if (options.repository !== undefined && envelope.repository !== options.repository) {
    problems.push({
      category: "identity-mismatch",
      pointer: "/repository",
      message: `The export is from repository ${envelope.repository}, and the connection is for ${options.repository}.`,
    });
  }
  if (options.product !== undefined && !envelope.products.includes(options.product)) {
    problems.push({
      category: "identity-mismatch",
      pointer: "/products",
      message: `The export does not contain product ${options.product}, which the connection is for.`,
    });
  }
  return problems;
}

/** Every report names the snapshot it was computed at, and it must be the envelope's: no partial snapshots mixed in. */
function snapshots(envelope: ExportEnvelope): ExportProblem[] {
  const problems: ExportProblem[] = [];
  const commit = envelope.source.commit;
  for (const name of EXPORT_REPORTS) {
    const report = envelope.reports[name];
    if (report === undefined) continue;
    if (report.graphHash !== envelope.graphHash) {
      problems.push({
        category: "mixed-snapshot",
        pointer: `/reports/${name}/graphHash`,
        message: `The ${name} report was computed at graph ${report.graphHash.slice(0, 12)}, not the export's ${envelope.graphHash.slice(0, 12)}.`,
      });
    }
    if ("commit" in report && report.commit !== commit) {
      problems.push({
        category: "mixed-snapshot",
        pointer: `/reports/${name}/commit`,
        message: `The ${name} report was computed at commit ${report.commit ?? "null"}, not the export's ${commit ?? "null"}.`,
      });
    }
  }
  return problems;
}

/** What the envelope says it withheld must not be in it. */
function forbidden(envelope: ExportEnvelope): ExportProblem[] {
  const withheld = new Set<string>(envelope.withholding.visibilities);
  const problems: ExportProblem[] = [];
  envelope.artifacts.forEach((artifact, i) => {
    if (withheld.has(artifact.visibility)) {
      problems.push({
        category: "forbidden-content",
        pointer: `/artifacts/${i}/visibility`,
        message: `Artifact ${artifact.id} is ${artifact.visibility}, a visibility the export says it withholds.`,
      });
    }
  });
  return problems;
}

function consistency(envelope: ExportEnvelope): ExportProblem[] {
  const problems: ExportProblem[] = [];
  const fail = (pointer: string, message: string) =>
    problems.push({ category: "inconsistent-report", pointer, message });
  const types = new Map(envelope.artifacts.map((a) => [a.id, a.type]));
  const { validation, withholding } = envelope;

  if (validation.status !== (validation.errors > 0 ? "fail" : "pass")) {
    fail("/validation/status", `The status is ${validation.status} with ${validation.errors} errors.`);
  }
  const listedErrors = validation.diagnostics.filter((d) => d.severity === "error").length;
  if (
    validation.diagnostics.length + withholding.diagnostics !== validation.errors + validation.warnings ||
    listedErrors > validation.errors ||
    validation.diagnostics.length - listedErrors > validation.warnings
  ) {
    fail(
      "/validation/diagnostics",
      "The diagnostics listed and withheld do not add up to the error and warning counts.",
    );
  }
  envelope.products.forEach((id, i) => {
    if (types.get(id) !== "product") fail(`/products/${i}`, `${id} is not a product artifact in the export.`);
  });

  const evidence = envelope.reports.evidence;
  if (evidence !== undefined) {
    const at = (r: { commit: string; graphHash: string }) =>
      r.graphHash === envelope.graphHash && (envelope.source.commit === null || r.commit === envelope.source.commit);
    const statusOf = new Map(evidence.verifications.map((v) => [v.id, v.status]));
    for (const artifact of envelope.artifacts) {
      if (artifact.type === "verification" && !statusOf.has(artifact.id)) {
        fail("/reports/evidence/verifications", `Verification ${artifact.id} is exported but has no evidence entry.`);
      }
    }
    evidence.verifications.forEach((v, i) => {
      const p = `/reports/evidence/verifications/${i}`;
      if (types.get(v.id) !== "verification") fail(`${p}/id`, `${v.id} is not a verification artifact in the export.`);
      if (v.latest !== null && v.latest.verificationId !== v.id) {
        fail(`${p}/latest/verificationId`, `The latest record of ${v.id} is a run of ${v.latest.verificationId}.`);
      }
      if (v.status.startsWith("current-") || v.status === "skip" || v.status === "error") {
        const result = v.status.replace("current-", "");
        if (v.latest === null || !at(v.latest) || v.latest.result !== result) {
          fail(
            `${p}/status`,
            `${v.id} is ${v.status}, but its latest record is not a ${result} at the export's snapshot.`,
          );
        }
      } else if (v.status === "stale") {
        if (v.latest === null || at(v.latest))
          fail(`${p}/status`, `${v.id} is stale, but has no record from another snapshot.`);
      } else if (v.status === "missing" && (v.latest !== null || v.runs !== 0)) {
        fail(`${p}/status`, `${v.id} is missing, but has run records.`);
      }
    });
    evidence.claims.forEach((claim, i) => {
      const p = `/reports/evidence/claims/${i}`;
      if (types.get(claim.id) !== claim.type)
        fail(`${p}/id`, `${claim.id} is not a ${claim.type} artifact in the export.`);
      if (claim.linked !== claim.verifications.length + claim.withheld > 0) {
        fail(
          `${p}/linked`,
          `${claim.id} says linked is ${claim.linked} with ${claim.verifications.length + claim.withheld} verifications.`,
        );
      }
      if (claim.verified && (!claim.linked || claim.verifications.some((id) => statusOf.get(id) !== "current-pass"))) {
        fail(
          `${p}/verified`,
          `${claim.id} is marked verified, but not every verification naming it is a current pass.`,
        );
      }
    });
  }

  const knowledge = envelope.reports.knowledge;
  if (knowledge !== undefined) {
    knowledge.artifacts.forEach((entry, i) => {
      const p = `/reports/knowledge/artifacts/${i}`;
      if (types.get(entry.id) !== "knowledge")
        fail(`${p}/id`, `${entry.id} is not a knowledge artifact in the export.`);
      if (
        entry.status === "current" &&
        (entry.changed.length > 0 || entry.missing.length > 0 || entry.reviewer === null || entry.reviewedAt === null)
      ) {
        fail(
          `${p}/status`,
          `${entry.id} is current, but a source changed or is unpinned, or no reviewer or time is named.`,
        );
      }
    });
  }

  const impact = envelope.reports.impact;
  if (impact !== undefined) {
    impact.starts.forEach((entry, i) => {
      const p = `/reports/impact/starts/${i}`;
      if (!types.has(entry.start)) fail(`${p}/start`, `${entry.start} is not an artifact in the export.`);
      for (const group of ["direct", "candidates", "context"] as const) {
        entry[group].forEach((hit, j) => {
          const last = hit.path[hit.path.length - 1];
          if (!types.has(hit.id) || last?.id !== hit.id || hit.path.some((step) => !types.has(step.id))) {
            fail(
              `${p}/${group}/${j}`,
              `The ${group} hit ${hit.id} names an artifact the export lacks, or its path does not end at it.`,
            );
          } else if ((group === "candidates") !== hit.path.length > 1) {
            fail(
              `${p}/${group}/${j}`,
              `A ${group} hit has a path of ${hit.path.length} step${hit.path.length === 1 ? "" : "s"}.`,
            );
          }
        });
      }
    });
  }

  const ownership = envelope.reports.ownership;
  if (ownership !== undefined) {
    ownership.files.forEach((file, i) => {
      const p = `/reports/ownership/files/${i}`;
      const slice = file.region === "slice" || file.region === "test";
      if (
        (file.region === "slice" && file.owner === null) ||
        (slice && file.owner !== null && types.get(file.owner) !== "slice")
      ) {
        fail(`${p}/owner`, `${file.path} is in a slice region, but its owner is not a slice in the export.`);
      }
      if (!slice && file.region !== "resource" && file.owner !== null) {
        fail(`${p}/owner`, `${file.path} is in the ${file.region} region, which has no owner.`);
      }
    });
  }
  return problems;
}
