// Run by test/consumer/smoke.ts inside an empty project that installed the
// packages as a consumer would. Plain JavaScript on purpose: a consumer's node
// does not strip types from node_modules, so this is what dist has to serve.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkArchitecture, ownershipReport } from "@intentset/architecture";
import { buildAtlas } from "@intentset/atlas";
import { examplesPath, loadConsumerFixtures, loadSuite } from "@intentset/conformance-suite";
import {
  exportGraph,
  graphHash,
  impactReport,
  plainCarrier,
  readExport,
  readRegistries,
  validate,
} from "@intentset/core";
import { marksetCarrier } from "@intentset/markset-adapter";
import { createIntentsetServer } from "@intentset/mcp";
import { knowledgeReport, publish } from "@intentset/publisher";
import { checkEvidence, evidenceReport, readRunRecords } from "@intentset/verification";

const dir = join(examplesPath, "scheduling");
const names = readdirSync(dir)
  .filter((name) => name.endsWith(".md"))
  .sort();
const read = (name) => readFileSync(join(dir, name), "utf8");
const registries = readRegistries(read("registries.yaml"), "registries.yaml").registries;

// core and the adapter agree, and the example validates clean.
const plain = names.map((name) => plainCarrier(name, read(name)));
assert.deepEqual(
  names.map((name) => marksetCarrier(name, read(name))),
  plain,
);
const result = validate(plain, registries, { level: "L1" });
assert.equal(result.ok, true);
assert.equal(result.graph.artifacts.size, 13);
const hash = graphHash(result.graph);

// architecture runs over a tree; the example's claims name planned files, so it reports them.
const architecture = checkArchitecture(
  result.graph,
  registries,
  { files: new Map() },
  { level: "L2", today: "2026-10-02" },
);
assert.ok(architecture.diagnostics.some((d) => d.code === "VSA009"));

// verification classifies an empty evidence set as missing, never as passing.
const records = readRunRecords([], "evidence.json").records;
const evidence = checkEvidence(result.graph, records, { commit: null, graphHash: hash, scope: null }, { level: "L1" });
assert.ok(Object.values(evidence.classification.verifications).every((v) => v.status === "missing"));

// publisher: the example's knowledge is draft, so a customer projection publishes nothing.
const published = publish(
  result.graph,
  registries,
  {
    visibility: "customer",
    audience: "teacher",
    product: "PRD-LANTERN",
    release: "pilot-1",
    role: "teacher",
    edition: "standard",
    flags: [],
  },
  { snapshot: { commit: null, graphHash: hash }, publishedAt: "2026-01-01T00:00:00Z" },
);
assert.deepEqual(published.index.published, []);

// atlas renders, with no script anywhere.
const atlas = buildAtlas({
  graph: result.graph,
  registries,
  diagnostics: result.diagnostics,
  snapshot: { commit: null, graphHash: hash, scope: ["**/*.md"], level: "L1" },
});
assert.ok(atlas.has("index.html"));
for (const html of atlas.values()) assert.ok(!html.includes("<script"));

// mcp builds a server in each mode.
assert.ok(
  createIntentsetServer({ mode: "engineering", graph: result.graph, snapshot: { commit: null, graphHash: hash } }),
);
assert.ok(createIntentsetServer({ mode: "customer", publication: published }));

// the suite ships its cases.
const suite = loadSuite();
for (const section of ["core", "evidence", "export", "publication", "vsa"])
  assert.ok(suite[section]?.length > 0, section);

// an export with every report, read back as a consumer must, and every consumer fixture judged as its manifest says.
const envelope = exportGraph(result, registries, {
  repository: "example/scheduling",
  commit: null,
  reports: {
    evidence: evidenceReport(evidence, 0),
    knowledge: knowledgeReport(result.graph),
    impact: impactReport(result.graph),
    ownership: ownershipReport(architecture, { commit: null, graphHash: hash }),
  },
});
const exported = readExport(JSON.stringify(envelope), { repository: "example/scheduling", product: "PRD-LANTERN" });
assert.ok(exported.ok, JSON.stringify(exported.problems));
assert.deepEqual(exported.supplied, ["evidence", "knowledge", "impact", "ownership"]);
const fixtures = loadConsumerFixtures();
assert.ok(fixtures.cases.length >= 10);
for (const c of fixtures.cases) {
  const outcome = readExport(fixtures.read(c.file), c.connection);
  assert.equal(outcome.ok, c.expect.accept, c.name);
  if (!c.expect.accept) assert.equal(outcome.category, c.expect.category, c.name);
}

// the bin: init with the example, then validate, in a fresh directory.
const work = mkdtempSync(join(tmpdir(), "intentset-bin-"));
try {
  const bin = join(process.cwd(), "node_modules", ".bin", "intentset");
  execFileSync(bin, ["init", "--repository", "example/consumer", "--example"], { cwd: work, stdio: "pipe" });
  const out = execFileSync(bin, ["validate"], { cwd: work, encoding: "utf8" });
  assert.match(out, /13 artifacts, 0 errors, 0 warnings/);
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log("consumer: every package installed, imported and used");
