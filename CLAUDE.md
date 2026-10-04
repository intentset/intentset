# Intentset

Intentset keeps product intent, observable behavior, implementation ownership, verification and published knowledge
connected, as readable Markdown files with YAML frontmatter in a repository. The graph, reports, Atlas and published
knowledge are derived views; the files are authoritative. This repository is the v0.1 specifications, the conformance
suite, the reference implementation in TypeScript, and the intentset.org site.

**`spec/` is the source of truth**: `core-0.1.md`, `vsa-0.1.md`, `profile-typescript-amplify-gen2-0.1.md`,
`export.md` (the export contract other tools pin, `intentset/export/0.3`), `publication.md`, `frontmatter.schema.json`, `conformance.schema.json`, `export.schema.json`, `evidence.schema.json` (run records). Read the Core spec before implementing
anything. When code and spec disagree, the spec wins, or the spec changes first in the same commit.
`docs/requirements/` is the kickoff handoff as delivered and is not updated; `docs/implementation-plan.md` is the plan;
`docs/decisions/` holds the ADRs.

## Design invariants

1. **One carrier, one record per artifact.** Markdown with YAML frontmatter under `intentset:`. Tools never merge
   duplicate records and never rewrite files. Unknown keys inside `intentset` are errors except under `extensions`;
   unknown top-level keys are preserved and never interpreted.
2. **Authored forward edges only.** Relationships are written once in the Core §5 direction; every inverse is
   derived and marked derived. A reverse edge in a file is a mistake, not a convenience.
3. **Definitions are not evidence.** A verification record says how a claim is checked. Only a `pass` at the assessed
   commit and graph hash is current; stale, skip, error, fail and missing never count as pass, and link coverage and
   current-pass coverage are always reported separately.
4. **Publication fails closed.** Deny by default, intersect every availability dimension, exclude draft and retired,
   never leak an excluded source's title or path. Documentation metadata never grants runtime access.
5. **Profiles are metadata, not syntax.** No `:::behavior`, no new Markset directive, ever. Markset owns the document
   grammar; Intentset owns meaning. Markset diagnostics (origin `syntax`) and Intentset diagnostics (every other
   origin) are never mixed into one list without the origin field.
6. **Checks report what they could not check.** `unresolved` is never `pass`. A waiver produces "with exceptions",
   never unqualified conformance. Every count names its snapshot, denominator and whether it measures links or evidence.
7. **No code execution, no network, no mutation** in `validate`, `graph`, `architecture check`, `impact`, `review`.
   Publication and serving are separate explicit commands.
8. **`@intentset/core` has no dependencies.** Everything Markset is in `@intentset/markset-adapter` and nowhere else.
   `@intentset/conformance-suite` has no dependencies either: it is what another implementation is checked against.

## Working rules

- **Fixtures before code.** A check ships with its cases in `tests/<section>.json`: one passing case, one failing case
  per condition in the spec's sentence, one boundary case. Catalog IDs (C01, V02, E03, P04) prefix the case name.
- **Spec, fixtures and implementation change in the same commit.**
- Diagnostics are specified behavior: code, severity, origin, artifact, path, location when known, field as a JSON
  pointer, message, remediation. Sorted by `compareDiagnostics`. Codes are stable within v0.1.
- Determinism: same inputs, same bytes. Canonical JSON for anything hashed. Sort everything you iterate.
- Don't add dependencies without asking. Approved so far: `@markset-lang/parser` and `@markset-lang/render-html` at
  exactly 0.3.4 (adapter, publisher, atlas, site), `@modelcontextprotocol/sdk` (mcp only), `typescript` as a peer of
  architecture, Playwright and Biome as dev dependencies. `pnpm install` is run by whoever owns the root; agents working
  in parallel do not run it.
- Nothing from the Streamlane pilot enters this repository. Its records live in the Streamlane repository.
- The example product is Lantern, invented. Nothing in this repository names a real product.

## Core API (the contract every package builds against)

```ts
// @intentset/core
parseYaml(text): { value: Record<string, unknown>; error: null } | { value: null; error: { message; line } }  // strict, ADR 0001
plainCarrier(path, source): DocumentInput                     // plain-Markdown fallback, ADR 0003
readArtifact(input: DocumentInput): { artifact: Artifact | null; diagnostics: Diagnostic[] }   // CORE001, origin "profile"
readRegistries(text, path): { registries: Registries; diagnostics: Diagnostic[] }
readConfig(text, path): { config: Config; diagnostics: Diagnostic[] }   // Config = { repository, scope[], registries|null, ignore[] }
validate(inputs: DocumentInput[], registries: Registries, options?: { level }): ValidationResult   // the whole L1 pipeline
impact(graph: Graph, id: string): ImpactReport
impactReport(graph, starts?): ImpactReportSection           // reports.impact: every artifact's impact, hits as ID + path
exportGraph(result: ValidationResult, registries, meta): ExportEnvelope   // meta.reports, meta.includeRestricted (spec/export.md)
readExport(text | bytes | value, { repository?, product?, maxBytes? }): { ok, envelope, supplied } | { ok: false, category, problems }
// the consumer's checks of spec/export.md §5; shape checks mirror export.schema.json (a mutant test holds them equal)
// report builders live with their checks: evidenceReport (verification), knowledgeReport (publisher), ownershipReport (architecture)
graphHash(graph): string; canonicalJson(value): string; sha256Hex(input): string
sortDiagnostics, compareDiagnostics, hasErrors, and every type in types.ts
```

```ts
// @intentset/publisher
publish(graph, registries, request, { snapshot, publishedAt, renderHtml? }): { documents, index, help, diagnostics, ok }
// help is spec/publication.md §5: every published document's tips by explained ID, or null when the request was refused

// @intentset/help  (no dependencies; a browser runtime)
readHelp(text | bytes | value): { ok, help, problems }      // refuses a file with any problem, whole
tipFor(help, id); helpForPage(help, ids)                    // one control, or one page: tips, their articles, what has no tip
bindTips(root, help, { attribute?, render? }): { bound, missing }   // data-behavior="BEH-..." by default; title + data-help-knowledge
```

```ts
// @intentset/markset-adapter
MARKSET_VERSION = "0.3.4"
marksetCarrier(path, source): DocumentInput      // same shape as plainCarrier; a test asserts they agree on every example
```

## Conventions

- Diagnostic codes: `CORE001`–`CORE009` (Core §11; an outcome with no measure is CORE009 draft, CORE003 active), `VSA001`–`VSA012`, `TS001`–`TS006`, `AMP001`–`AMP006` (VSA §2,
  profile §2, §4), `EVID00n` for evidence, `PUB00n` for publication, `CFG00n` for configuration. Three digits always.
- Package layout: `packages/<name>/src/index.ts` is the public surface; `test/*.test.ts` with `node --test`;
  `tsconfig.build.json` extends `../../tsconfig.build.base.json`.
- Site output uses Markset's `ms-` classes and `site/site.css` layered over `markset.css`. No script inside `<main>`.
- Commit messages are one plain sentence saying what changed and why, as in Markset.

## Layout

```
spec/                 normative documents and schemas
tests/                conformance fixtures, one JSON file per section (core, export, vsa, evidence, publication)
tests/consumer/       export consumer fixtures and manifest.json (spec/export.md §6), built by `pnpm run fixtures:consumer`
                      from packages/conformance/src/consumer.ts; a test fails when the committed copy differs
examples/scheduling/  the worked example, the fixtures' baseline and the site's example
packages/
  core/               carrier reader, types, graph, validator, impact, export. No dependencies.
  markset-adapter/    the one Markset import
  architecture/       M2: claims, import graph, layers, resources, exceptions, baseline
  verification/       M3: run records, freshness, reporter adapters
  publisher/          M4: projection and generated Markset, and the help file (publication §5)
  help/               reads help.json and binds tips to the controls of a product's interface. No dependencies, runs in
                      a browser; the binder takes any root with querySelectorAll, so it is tested without a DOM
  atlas/              M4: static review pages over an export
  cli/                `intentset`
  conformance/        private harness
  conformance-suite/  published cases, consumer fixtures and schemas as data
  mcp/                M5: read-only context server
site/                 intentset.org
docs/                 implementation-plan.md, decisions/, requirements/ (frozen handoff)
```

## Toolchain

- Node ≥ 22.18, TypeScript run directly by type stripping: erasable syntax only, explicit `.ts` import extensions.
- pnpm workspaces (`pnpm-workspace.yaml`; pnpm pinned by `packageManager`). `pnpm test` (node --test),
  `pnpm run conformance`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run format`, `pnpm run site`,
  `pnpm run site:watch`, `pnpm run build` (publishing only, to `dist/`). Moved from npm on 2026-10-04 with the lockfile
  imported, so no version changed. Siblings keep `^<version>` ranges, linked by `linkWorkspacePackages`. A file may
  import only what its own package declares: the root links every workspace package for the tests, and
  `markset-adapter` declares `@types/mdast`, which its declarations import. The release publishes with
  `pnpm --filter <name> publish --provenance`, pnpm's own trusted publishing; the smoke test packs with pnpm and
  installs into a pnpm project. `init` writes the agent guide with `pnpm exec` in a pnpm repository, `npx` otherwise.
- Every published manifest lists the `intentset-source` export condition first, pointing at `src`, so this repository
  runs TypeScript while an installed consumer gets `dist`.
- Biome config is `biome.jsonc`, deliberately not `.json`.
- The site's browser checks run Playwright (Chromium) at 390px and 1440px.

## Status

See `docs/implementation-plan.md` §5 for milestones. Update the list below as milestones land.

- [x] M0 scaffold, specs in `spec/`, example in `examples/`, ADRs 0001–0006, the site
- [x] M1 core: strict carrier reader, typed graph, validator (CORE001–CORE006, CORE009), impact, export, `contextFor`;
      `tests/core.json`, `tests/export.json`
- [x] M2 architecture: claims, import graph from TypeScript 7's scanner (ADR 0007), regions, layers, exceptions,
      baseline, monorepo resolution; `tests/vsa.json`
- [x] M3 verification: run records, freshness, coverage, Vitest and node TAP adapters; `tests/evidence.json`
- [x] M4 publisher (`spec/publication.md`, `tests/publication.json`) and Atlas
- [x] M5 read-only MCP server; the CLI with every command; packed-install smoke test; release workflow
- [x] Streamlane pilot (Streamlane ADR 0033, branch `intentset-pilot`); findings in `docs/pilot-findings.md`
- [x] Published 0.1.0, 2026-10-03: all nine packages by hand, trusted publishers configured, so the next release goes
      from CI on a `v*` tag. The registry smoke test passes. intentset.org deploys from GitHub Actions with HTTPS
      enforced. The site's copy was revised the same day where it said the toolchain was unbuilt; `site/content` is
      the copy's source of truth now, and the IA document stays frozen as the handoff.
- [x] The pilot's four specification questions, decided 2026-10-03 (`docs/pilot-findings.md`): `entrypoints` per
      package, out-of-scope importers as warnings, evidence kept out of the commit it assesses, draft gaps as warnings.
- [x] The site, 2026-10-03: How it works is a page of its own (`site/content/how-it-works.md`, with a contents rail)
      rather than an anchor on the home page, which now keeps to the outcome and six benefits; the home page's file
      format and Markset sections moved there, headings and all. The header carries markset.org's color-scheme control,
      whose one script is the only one on a page and sits outside `<main>`; the footer carries the network figure from
      coralreefventures.com with Intentset's nodes in green.
- [x] Export 0.2 for consumers, 2026-10-03 (ADR 0008, `spec/export.md`): typed evidence, knowledge, impact and
      ownership reports (`intentset graph --report`), restricted artifacts withheld and counted unless
      `--include-restricted`, `readExport` in core, 16 consumer cases in `tests/consumer/`, shipped in the suite.
      The prerequisite for Streamlane's integration and for Driftline, which maps errors to slices through ownership.
- [x] Published 0.2.0 from CI, 2026-10-04: the first tagged run stopped with ENEEDAUTH at `@intentset/core` because
      some packages had no trusted publisher configured; once they were, a rerun published all nine with provenance and
      the registry smoke test passed. The README's `npx -p @intentset/cli -p typescript@7` route was checked against
      Streamlane with its own TypeScript 5.9.3 installed.
- [x] Draft slices plan their paths, 2026-10-03 (VSA §3): while a slice is draft, a missing entrypoint (VSA002) and a
      claim matching no file (VSA009) are warnings, so a product modelled before it is coded (Driftline) keeps L2
      green. Checked on a clone of the Driftline repository from `intentset init` through an L3 export.
- [x] Areas, 2026-10-04 (profile §9, ADR 0009): a backend past CloudFormation's limits splits into areas, each its own
      Amplify backend behind one AppSync Merged API. `areas`, `sharedBackend` and `schemaBridge` in
      `.intentset/architecture.yaml`; AMP007 to AMP011 checked from source (`packages/architecture/src/areas.ts`,
      schema members read by `extractSchema` from scanner tokens), AMP012 and AMP013 review-required. Checked clean
      against a four-area production application's tree; Streamlane will need the same split.
- [x] The site caught up with 0.3, 2026-10-04: the status copy names 0.3 rather than 0.1, How it works covers draft
      slices, areas and the export, the publication profile has a page under /specifications/ beside the export
      contract, and About and the footer name Driftline. The same day the roadmap was rewritten for readers (where it
      stands, toward 1.0, not planned, shape it) and the page rendering the handoff's implementation roadmap was
      removed: both were a plan of the owner's work, and no use to a reader. Release history belongs in release notes.
- [x] Agents keep the model current, 2026-10-04 (ADR 0010, Core §10): `init` writes `.intentset/agents.md`
      (`packages/cli/src/agents.ts`, `init --agents` for the guide alone), `context <path>` resolves a file to its
      slice, and `review` lists slices whose code changed while none of their describing records did
      (`packages/cli/src/slices.ts`), acknowledged by an `Intentset-Unchanged` commit trailer, failing with
      `--fail-on-drift`.
- [x] The site says why and how, 2026-10-04: the home page leads with agentic development (the hero, the problem, the
      loop of six steps, questions by role, architecture, the pilot), Start is two paths in which an agent models one
      capability or the model comes first, How it works gains "Written by agents, reviewed by people", and
      `site/content/pilot.md` is the first pilot as a case study, from `docs/pilot-findings.md`. Home and Start join the
      roadmap as rewritten rather than held to the handoff's copy.
- [x] Tips and the help file, 2026-10-04 (ADR 0011, Core §9, publication §5): `tips` on knowledge records, one
      sentence per explained ID, reviewed and published with the record; `intentset publish` writes `help.json` beside
      the documents; `@intentset/help` is the tenth package, the runtime a product binds tips with. Eleven core and four
      publication cases, and `published.mustContain` in the conformance schema. **A tenth package has never been
      published**, so the next release needs it published by hand once and its trusted publisher configured before CI
      can carry it (the Markset lesson, twice). Driftline's in-app guidance builds on this; the timing of a tip beyond
      hover is Driftline's, not Intentset's.
- [x] Success measures, 2026-10-04 (ADR 0012, Core §2, §5, §6, §8): `measure` is the thirteenth type, `parent` an
      outcome, with a `measure` block (metric, baseline or `unknown`, target, window, `source` from the new
      `evidenceSources` registry, optional direction) and a Method section. An outcome past draft needs one (CORE003;
      CORE009 while draft). Verification is not success: Core §6 says so, §8 names the outcome evidence record a later
      version or Driftline will supply, and nothing reads one yet. **Export is 0.3**: the type, the registry, and
      `measure` and `tips` on every artifact, which ADR 0011 had deferred to this bump; the consumer fixtures carry a
      rejected 0.2 envelope, and Streamlane's reader moves its pin when it next updates. The Lantern example has two
      measures under OUT-PREPARE, so every count that said thirteen says fifteen and the baseline graph hash changed.
      Not yet released: the next tag is 0.5.0, and `@intentset/help` still needs its first publish by hand before CI
      can carry it.
- [ ] The Markset adapter drops FRONTMATTER_UNPARSEABLE until Markset releases the indentless-sequence fix
      (Markset commit 3601c8c) and the pin moves past 0.3.4; a test removes the workaround with the bump.

Run evidence is never committed: a pass counts only at the commit and graph hash it ran against, so a committed record
is stale on arrival. Keep `.intentset/evidence/` out of git (CI artifacts, or an external store).

<!-- BEGIN AWS Agent Toolkit rules -->
# AWS Guidance for the new AWS experience

This user has signed up for the new AWS experience. This experience lets you sign into AWS using a social provider and requires the following additional context.

Where this guidance conflicts with the project's own instructions, the project's instructions take precedence.

## Context

### Terminology:

- Say "project" instead of "account" — a project contains an AWS account and settings for sharing with other collaborators
- Say "team member" instead of "IAM user" — users are invited by email, not created or federated in IAM
- Say "AWS Settings" when referring to management tasks at [settings.aws.com](https://settings.aws.com/) (project management, billing, team members, spend limits). Users view their actual AWS resources in the AWS Management Console.
- Say "selected Region" when referring to the user's Region — not "home Region"
- The user has a managed IAM experience. This includes a managed service control policies (SCP) and resource control policies (RCP) that govern the use of AWS. They will still need to use IAM to create policies to let services work with each other. If there are questions about the SCPs or RCPs, go to the documentation at https://docs.aws.amazon.com/accounts/latest/reference/scps-and-rcps-for-projects.html

### Constraints:

- All projects share a single AWS Region determined by the user's contact address. Resources cannot be created in other Regions
- When developing:
  - MUST create all Regional resources in the project's assigned Region
  - You CAN create AWS WAF and Cloudwatch Logs resources in us-east-1 when there are global resources (like a global WAF instance) that require a connection to dependencies in us-east-1. You should not use these for any other reason, because resources in the selected Region will provide lower cost (due to no cross-Region traffic), increased availability (due to no cross-Region traffic), and easier manageability (due to not needing to look in another Region). When you need to do an inventory of resources, you need to look in both the selected Region and us-east-1 for Cloudwatch Logs or WAF resources.
  - MUST NOT attempt to create Lambda, API Gateway, or other Regional resources in any other Region
  - MUST direct users to confirm their Region in AWS Settings > View all projects > Overview > Additional Info > Region. If the user cannot confirm their Region, check in ~/.aws/config
  - MUST NOT use Lambda@Edge — excluded from both Lambda and CloudFront
  - MUST NOT use CloudFormation StackSets — no multi-account or multi-Region deployments
  - MUST NOT attempt cross-Region actions — no cross-Region replication for DynamoDB/S3/RDS, no multi-Region KMS keys
  - MUST NOT use Route 53 cross-Region routing — geolocation, latency-based, and failover routing policies are not available
  - CloudFront is a global service and its actions ARE allowed in `us-east-1`. A user can create a CloudFront distribution pointing to their project-region Lambda function URL or API Gateway. However, Lambda and API Gateway themselves MUST NOT be created in `us-east-1` — they must be in the project Region.
  - Reduced availability in `eu-north-1` specifically: Amazon Rekognition, Amazon Textract, Amazon Personalize, AWS App Runner are not available in that Region.
- IAM permissions for human access are managed by AWS. Don't assign roles to team members unless absolutely necessary
- The user may have a spend limit if they are on the paid plan. The limit that pauses their project if it's exceeded. If resources suddenly become inaccessible, ask if they have a spend limit configured. Only project owners can modify a spend limit.
- When developing:
  - MUST ask about spend limit status if the user reports sudden "Access Denied" errors on operations that previously worked
  - MUST direct users to check spend status in AWS Settings > Billing
  - MUST check if a user has upgraded their account to the paid plan
  - MUST ask the user if they want to clean up the successfully created resources or keep them to reduce cost
- The user sets up billing, creates spend limits, and retrieves and pays invoices in AWS Settings. The user creates budgets and optimizes their costs in the AWS Billing and Cost Management console
- Not all AWS services are available. If a service isn't working, do the following:
  1. Run the command `aws freetier get-account-plan-state`
  2. If accountPlanType": "FREE", check the [Free Tier supported services list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#supported-services-free-tier) next,
  3. If accountPlanType": "PAID", check the [Paid Tier supported services list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#supported-services-paid-plan).
  4. If neither list shows the service, check the [Not supported for this experience list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#unsupported-services). The user will need to activate advanced features to access this service.
- Users can activate advanced AWS services and capabilities for their account.
- Before starting a task, check whether a relevant AWS skill is available. Load the skill with retrieve_skill and prefer its guidance over general knowledge.

### Help level

- help_level (required): LOW, MEDIUM, or HIGH. While a user is building, you MUST ask the user: "How much guidance would you like from me? Low (I only flag security risks), medium (I ask a couple of clarifying questions if something seems off), or high (I explain what I'm doing, suggest alternatives, and flag best practices)."

You CAN update this rule file to save a user's help_level.

Constraints for each level:

**LOW:**

- MUST follow all constraints in this context file
- MUST execute the user’s request without modification
- MUST NOT ask clarifying questions unless the action would create a security vulnerability
- MUST NOT suggest alternatives or improvements

**MEDIUM:**

- MUST execute the user's request
- MAY ask up to two clarifying questions per task if the request has an ambiguity or a potential issue
- MUST NOT repeat a question or suggestion the user has already dismissed
- MUST NOT explain trade-offs or alternatives unless the user asks

**HIGH:**

- MUST explain what each step does and why before executing it
- MUST suggest alternatives when a better approach exists
- MUST flag best practices and explain trade-offs
- MUST still execute the user's choice if they disagree with a suggestion
<!-- END AWS Agent Toolkit rules -->
