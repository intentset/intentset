/**
 * The consumer fixtures (spec/export.md §6): envelopes a consumer of the
 * export must accept or reject, and what it must show for each, built from
 * the worked example so they cannot drift from what this implementation
 * produces. `npm run fixtures:consumer` writes them to tests/consumer/; a test
 * fails when the committed copy differs from what this module builds.
 *
 * The accepted envelopes are real exports of examples/scheduling over the VSA
 * baseline's source tree, with RULE-ASMT-AUTH made restricted so withholding
 * shows. Each rejected one is an accepted one with one deliberate defect, so
 * a consumer that rejects it can only be rejecting that defect.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkArchitecture, ownershipReport } from "@intentset/architecture";
import {
  type Diagnostic,
  EXPORT_CONTRACT,
  EXPORT_REPORTS,
  type ExportEnvelope,
  type ExportReportName,
  type ExportReports,
  exportGraph,
  graphHash,
  hasErrors,
  impactReport,
  type Level,
  LEVELS,
  parseYaml,
  plainCarrier,
  readRegistries,
  sha256Hex,
  sortDiagnostics,
  validate,
} from "@intentset/core";
import { knowledgeReport } from "@intentset/publisher";
import { checkEvidence, evidenceReport, readRunRecords } from "@intentset/verification";
import { FIXTURE_TODAY } from "./drivers.ts";
import { expandCase, REGISTRIES_PATH } from "./fixtures.ts";
import type { ConformanceCase } from "./types.ts";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

/** Where the fixtures are committed. */
export const CONSUMER_DIR = join(repoRoot, "tests", "consumer");
export const MANIFEST = "manifest.json";

/** The connection every case is read against unless it names its own. */
export const CONNECTION = { repository: "example/scheduling", product: "PRD-LANTERN" } as const;
export const COMMIT = "4f2c0b1d9e8a7f6b5c4d3e2f1a0b9c8d7e6f5a4b";
export const GENERATED_AT = "2026-10-03T12:00:00Z";
export const RELEASE = { product: "PRD-LANTERN", label: "pilot-1" } as const;
/** A snapshot that is not the fixtures': where stale and glued-on evidence comes from. TEST-ASMT-SCHEDULE is a manual review. */
const OTHER_COMMIT = "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b";
const OTHER_GRAPH = sha256Hex("another snapshot of example/scheduling");

export interface ConsumerCase {
  name: string;
  /** The envelope's file in tests/consumer/. */
  file: string;
  /** What the connection was made for: the identity the envelope must match. */
  connection: { repository: string; product: string };
  expect: AcceptExpectation | RejectExpectation;
  /** What a consumer must do with it, in a sentence or two. */
  notes: string;
}

export interface AcceptExpectation {
  accept: true;
  /** The snapshot identity: two envelopes with the same pair are one snapshot, imported once. */
  snapshot: { commit: string | null; graphHash: string };
  validation: "pass" | "fail";
  /** The report sections present; every other is "not supplied", never zero, none or pass. */
  supplied: ExportReportName[];
  withheldArtifacts: number;
  /** Each verification's evidence status, when the evidence report is supplied. */
  evidence?: Record<string, string>;
}

export interface RejectExpectation {
  accept: false;
  category: string;
}

// biome-ignore lint/suspicious/noExplicitAny: a defect is an edit into a shape the envelope's types forbid
type Json = Record<string, any>;

export interface ConsumerManifest {
  contract: typeof EXPORT_CONTRACT;
  cases: ConsumerCase[];
}

/** The VSA baseline case: the example with a real source tree under its claims. */
function vsaBaseline(): ConformanceCase {
  const cases = JSON.parse(readFileSync(join(repoRoot, "tests", "vsa.json"), "utf8")) as ConformanceCase[];
  const found = cases.find((c) => c.name.startsWith("VSA baseline"));
  if (found === undefined) throw new Error("tests/vsa.json has no VSA baseline case");
  return found;
}

interface BuildOptions {
  level: Level;
  /** Frontmatter patches on top of the restricted rule. */
  patch?: ConformanceCase["patch"];
  commit: string | null;
  /** Run records for the evidence check; `@snapshot` in commit or graphHash is this snapshot's. */
  records?: Record<string, unknown>[];
  reports: readonly ExportReportName[];
  includeRestricted?: boolean;
  generatedAt?: string;
}

/** One real export: validation, then each level's checks folded in as the CLI does, then the envelope. */
function build(options: BuildOptions): ExportEnvelope {
  const base = vsaBaseline();
  const expanded = expandCase(
    {
      ...base,
      level: options.level,
      patch: {
        "RULE-ASMT-AUTH.md": { frontmatter: { "intentset.visibility": "restricted" } },
        // The procedure is the record itself, which is in this tree at its own path.
        "TEST-ASMT-SCHEDULE.md": { frontmatter: { "intentset.verification.locator": "TEST-ASMT-SCHEDULE.md" } },
        ...options.patch,
      },
    },
    { examplesDir: join(repoRoot, "examples"), parseYaml },
  );
  const inputs = [...expanded.files]
    .filter(([path]) => path.endsWith(".md"))
    .map(([path, text]) => plainCarrier(path, text));
  const registries = readRegistries(expanded.registriesText, REGISTRIES_PATH).registries;
  const validated = validate(inputs, registries, { level: options.level });
  const graph = validated.graph;
  const hash = graphHash(graph);
  const snapshot = { commit: options.commit, graphHash: hash };
  const at = (floor: Level) => LEVELS.indexOf(options.level) >= LEVELS.indexOf(floor);
  const all: Diagnostic[] = [...validated.diagnostics];
  const reports: ExportReports = {};

  if (at("L2")) {
    const tree = new Map([...expanded.files, ...expanded.sources]);
    const architecture = checkArchitecture(
      graph,
      registries,
      { files: tree },
      { level: options.level, today: FIXTURE_TODAY },
    );
    all.push(...architecture.diagnostics);
    if (options.reports.includes("ownership")) reports.ownership = ownershipReport(architecture, snapshot);
  }
  if (at("L3")) {
    const bound = (options.records ?? []).map((record) => bind(record, snapshot));
    const read = readRunRecords(bound, "evidence.json");
    all.push(...read.diagnostics);
    const check = checkEvidence(
      graph,
      read.records,
      { ...snapshot, scope: { product: RELEASE.product, release: RELEASE.label } },
      { level: options.level, files: new Set([...expanded.files.keys(), ...expanded.sources.keys()]) },
    );
    all.push(...check.diagnostics);
    if (options.reports.includes("evidence")) reports.evidence = evidenceReport(check, read.records.length);
  }
  if (options.reports.includes("knowledge")) reports.knowledge = knowledgeReport(graph);
  if (options.reports.includes("impact")) reports.impact = impactReport(graph);

  const diagnostics = sortDiagnostics(all);
  return exportGraph({ graph, diagnostics, ok: !hasErrors(diagnostics) }, registries, {
    repository: CONNECTION.repository,
    commit: options.commit,
    ...(options.commit === null ? { commitUnavailable: "The fixture describes no commit." } : {}),
    scope: ["**/*.md"],
    level: options.level,
    release: RELEASE,
    generatedAt: options.generatedAt ?? GENERATED_AT,
    includeRestricted: options.includeRestricted === true,
    reports,
  });
}

function bind(record: Record<string, unknown>, snapshot: { commit: string | null; graphHash: string }) {
  return {
    ...record,
    commit: record.commit === "@snapshot" ? snapshot.commit : record.commit,
    graphHash: record.graphHash === "@snapshot" ? snapshot.graphHash : record.graphHash,
  };
}

function run(id: string, commit: string, hash: string, result: string, finishedAt: string): Record<string, unknown> {
  return {
    evidenceId: id,
    verificationId: "TEST-ASMT-SCHEDULE",
    commit,
    graphHash: hash,
    environment: "staging",
    scope: { product: RELEASE.product, release: RELEASE.label },
    tool: null,
    reviewer: "qa-lead@example.org",
    startedAt: finishedAt.replace(/:30Z$/, ":00Z"),
    finishedAt,
    result,
    uri: `https://reviews.example.org/${id}`,
    rationale:
      "Scheduled an assessment for tomorrow and one for yesterday; the second was refused with the stated reason.",
  };
}

const PASS_HERE = run("review-0002", "@snapshot", "@snapshot", "pass", "2026-10-03T11:40:30Z");
const PASS_EARLIER = run("review-0001", OTHER_COMMIT, OTHER_GRAPH, "pass", "2026-10-01T09:15:30Z");

/** Every fixture file by name, the manifest included, as the bytes to commit. */
export function buildConsumerFixtures(): Map<string, string> {
  const full = build({
    level: "L3",
    commit: COMMIT,
    records: [PASS_EARLIER, PASS_HERE],
    reports: EXPORT_REPORTS,
  });
  const regenerated = build({
    level: "L3",
    commit: COMMIT,
    records: [PASS_EARLIER, PASS_HERE],
    reports: EXPORT_REPORTS,
    generatedAt: "2026-10-03T18:05:00Z",
  });
  const minimal = build({ level: "L1", commit: null, reports: [] });
  const stale = build({ level: "L3", commit: COMMIT, records: [PASS_EARLIER], reports: ["evidence"] });
  const failing = build({
    level: "L1",
    commit: COMMIT,
    patch: { "BEH-ASMT-SCHEDULE.md": { frontmatter: { "intentset.parent": "CAP-MISSING" } } },
    reports: ["knowledge", "impact"],
  });
  const restricted = build({ level: "L1", commit: COMMIT, reports: ["knowledge"], includeRestricted: true });

  const files = new Map<string, unknown>();
  const cases: ConsumerCase[] = [];
  const accept = (name: string, file: string, envelope: ExportEnvelope, notes: string) => {
    files.set(file, envelope);
    const expectation: AcceptExpectation = {
      accept: true,
      snapshot: { commit: envelope.source.commit, graphHash: envelope.graphHash },
      validation: envelope.validation.status,
      supplied: EXPORT_REPORTS.filter((report) => envelope.reports[report] !== undefined),
      withheldArtifacts: envelope.withholding.artifacts,
    };
    if (envelope.reports.evidence !== undefined) {
      expectation.evidence = Object.fromEntries(envelope.reports.evidence.verifications.map((v) => [v.id, v.status]));
    }
    cases.push({ name, file, connection: { ...CONNECTION }, expect: expectation, notes });
  };
  const reject = (
    name: string,
    file: string,
    category: string,
    notes: string,
    connection: { repository: string; product: string } = { ...CONNECTION },
  ) => {
    cases.push({ name, file, connection, expect: { accept: false, category }, notes });
  };
  const mutate = (envelope: ExportEnvelope, change: (copy: Json) => void): unknown => {
    const copy = structuredClone(envelope) as unknown as Json;
    change(copy);
    return copy;
  };

  accept(
    "full: every report, one restricted artifact withheld",
    "full.json",
    full,
    "Import it as one snapshot. Show the evidence as current, RULE-ASMT-AUTH nowhere, and the withheld counts where lists were shortened.",
  );
  accept(
    "the same snapshot exported again later",
    "full-regenerated.json",
    regenerated,
    "Same commit and graph hash as full.json, later generatedAt: re-importing it must not duplicate a snapshot, an artifact or an association.",
  );
  accept(
    "minimal: no reports, no commit",
    "minimal.json",
    minimal,
    "Show evidence, knowledge, impact and ownership as not supplied, never as none, zero or passing, and say there is no commit and why.",
  );
  accept(
    "evidence from an earlier snapshot only",
    "stale-evidence.json",
    stale,
    "Show TEST-ASMT-SCHEDULE as stale for this snapshot, not as passing, though its latest run passed.",
  );
  accept(
    "a failing validation still exports",
    "failing-validation.json",
    failing,
    "Import it and label the snapshot as failing validation; the diagnostics say why. Evidence and ownership are not supplied.",
  );
  accept(
    "restricted artifacts included on request",
    "restricted-included.json",
    restricted,
    "Nothing is withheld. A consumer that accepts this must enforce restricted visibility itself before any search or display.",
  );

  const v01 = mutate(minimal, (e) => {
    e.contract = "intentset/export/0.1";
    delete e.withholding;
    delete e.reports;
    delete e.source.uncommitted;
    for (const artifact of e.artifacts) delete artifact.withheldLinks;
  });
  files.set("unsupported-contract-0.1.json", v01);
  reject(
    "the earlier contract version",
    "unsupported-contract-0.1.json",
    "unsupported-contract",
    "0.1 had untyped reports and exported restricted artifacts. Reject it with an understandable error and keep the prior snapshot.",
  );
  files.set(
    "unsupported-contract-future.json",
    mutate(full, (e) => {
      e.contract = "intentset/export/1.0";
    }),
  );
  reject(
    "a later contract version",
    "unsupported-contract-future.json",
    "unsupported-contract",
    "A version this consumer was not built for is rejected, however familiar the rest looks.",
  );
  const fullText = text(full);
  files.set("not-json.txt", fullText.slice(0, Math.floor(fullText.length / 2)));
  reject(
    "an export cut off in transit",
    "not-json.txt",
    "not-json",
    "Reject it; a partial import must not replace the prior snapshot.",
  );
  files.set(
    "malformed-artifact.json",
    mutate(full, (e) => {
      delete e.artifacts[2].title;
    }),
  );
  reject(
    "an artifact without a title",
    "malformed-artifact.json",
    "malformed",
    "Reject the whole envelope, not just that artifact.",
  );
  reject(
    "another repository's export",
    "full.json",
    "identity-mismatch",
    "The connection is for example/elsewhere; an export of example/scheduling must not be imported into it.",
    { repository: "example/elsewhere", product: CONNECTION.product },
  );
  reject(
    "a product the export does not contain",
    "full.json",
    "identity-mismatch",
    "The connection is for PRD-HARBOR, which this export does not contain.",
    { repository: CONNECTION.repository, product: "PRD-HARBOR" },
  );
  files.set(
    "mixed-snapshot.json",
    mutate(full, (e) => {
      e.reports.evidence.commit = OTHER_COMMIT;
      e.reports.evidence.graphHash = OTHER_GRAPH;
    }),
  );
  reject(
    "an evidence report from another snapshot",
    "mixed-snapshot.json",
    "mixed-snapshot",
    "The evidence report was computed at another commit and graph hash than the envelope: snapshots must not be mixed.",
  );
  files.set(
    "stale-pass-as-current.json",
    mutate(full, (e) => {
      const entry = e.reports.evidence.verifications.find((v: { id: string }) => v.id === "TEST-ASMT-SCHEDULE");
      entry.latest = { ...entry.latest, commit: OTHER_COMMIT, graphHash: OTHER_GRAPH };
    }),
  );
  reject(
    "a pass from an old graph hash labelled current",
    "stale-pass-as-current.json",
    "inconsistent-report",
    "A current-pass whose deciding run is from another snapshot contradicts itself; never show it as passing.",
  );
  files.set(
    "forbidden-restricted.json",
    mutate(restricted, (e) => {
      e.withholding.visibilities = ["restricted"];
    }),
  );
  reject(
    "a restricted artifact in an export that says restricted is withheld",
    "forbidden-restricted.json",
    "forbidden-content",
    "Reject it before anything is stored or indexed, so no title or path of the restricted artifact is disclosed.",
  );
  files.set(
    "inconsistent-validation.json",
    mutate(failing, (e) => {
      e.validation.status = "pass";
    }),
  );
  reject(
    "a passing status over errors",
    "inconsistent-validation.json",
    "inconsistent-report",
    "The status says pass and the counts say otherwise; a consumer must not show a green status it cannot trust.",
  );

  const manifest: ConsumerManifest = { contract: EXPORT_CONTRACT, cases };
  const out = new Map<string, string>([[MANIFEST, text(manifest)]]);
  for (const [name, value] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    out.set(name, typeof value === "string" ? value : text(value));
  }
  return out;
}

function text(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
