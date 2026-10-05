# Intentset

Intentset keeps product intent, observable behavior, implementation ownership, verification and published knowledge
connected, as readable Markdown files with YAML frontmatter in a repository. The graph, reports, Atlas and published
knowledge are derived views; the files are authoritative. This repository is the v0.1 specifications, the conformance
suite, the reference implementation in TypeScript, and the intentset.org site.

**`spec/` is the source of truth**: `core-0.1.md`, `vsa-0.1.md`, `profile-typescript-amplify-gen2-0.1.md`,
`export.md` (the export contract other tools pin, `intentset/export/0.3`), `publication.md`, `frontmatter.schema.json`, `conformance.schema.json`, `export.schema.json`, `evidence.schema.json` (run records). Read the Core spec before implementing
anything. When code and spec disagree, the spec wins, or the spec changes first in the same commit. Each spec opens with
frontmatter (`title`, `id`, `status`, `revision`, `implementation`) that the site renders; Core §1 is the change policy.
`docs/requirements/` is the kickoff handoff as delivered and is not updated (`markset/` in it is the half delivered to
Markset, moved here from Markset's `docs/expansion-requirements/` 2026-10-05); `docs/implementation-plan.md` is the plan;
`docs/decisions/` holds the ADRs; `CHANGELOG.md` the release history.

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

- Family conventions: reef's [`docs/conventions.md`](https://github.com/Coral-Reef-Ventures/reef/blob/main/docs/conventions.md)
  (commits, releasing and the first-publish trap, CHANGELOG, ADRs, README, this file's shape, tooling tests, the site
  baseline). Departures: none yet; one is written here with its reason.
- **Fixtures before code.** A check ships with its cases in `tests/<section>.json`: one passing case, one failing case
  per condition in the spec's sentence, one boundary case. Catalog IDs (C01, V02, E03, P04) prefix the case name.
- **Spec, fixtures and implementation change in the same commit.**
- Diagnostics are specified behavior: code, severity, origin, artifact, path, location when known, field as a JSON
  pointer, message, remediation. Sorted by `compareDiagnostics`. Every code is defined in a spec, and one no check
  reports is called a review assertion there (`test/codes.test.ts` holds both). A change that invalidates an existing
  case, in any section and against any spec, is breaking: it moves `intentset.spec` (Core §1) and says so in the
  CHANGELOG. Relaxing a case so that nothing which conformed stops conforming is not.
- Determinism: same inputs, same bytes. Canonical JSON for anything hashed. Sort everything you iterate.
- Don't add dependencies without asking. Approved so far: `@markset-lang/parser` and `@markset-lang/render-html` at
  exactly 0.4.1 (adapter, publisher, atlas, site), `@modelcontextprotocol/sdk` (mcp only), `typescript` as a peer of
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
MARKSET_VERSION = "0.4.1"
MARKSET_GUIDE_URL = "https://markset.org/guide.md"   // the agent guide and every syntax remediation point at it
marksetCarrier(path, source): DocumentInput      // same shape as plainCarrier; a test asserts they agree on every example
```

## Conventions

- Diagnostic codes: `CORE001`–`CORE009`, `CFG001`–`CFG002` and `EVID001`–`EVID003` (Core §11; an outcome with no
  measure is CORE009 draft, CORE003 active), `VSA001`–`VSA013` and `REG001` (VSA §2, §5, §9), `TS001`–`TS006` and
  `AMP001`–`AMP013` (profile §2, §4, §9), `PUB001`–`PUB004` (publication §4). Three digits always.
  Markset's diagnostics (origin `syntax`) keep Markset's own AREA_NAME codes (`DIRECTIVE_UNKNOWN_NAME`); the export
  schema, the conformance schema and `readExport` key the code's shape on the origin, and a host never renames either.
- A release bumps every manifest, each spec's `implementation`, and adds its `CHANGELOG.md` entry: one bold sentence,
  then whether the specs, the suite or the export moved (tests hold all three). A spec's `revision` is the date its
  text last changed.
- Package layout: `packages/<name>/src/index.ts` is the public surface; `test/*.test.ts` with `node --test`;
  `tsconfig.build.json` extends `../../tsconfig.build.base.json`.
- Site output uses Markset's `ms-` classes and `site/site.css` layered over `markset.css`. No script inside `<main>`.

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
site/                 intentset.org: build.ts (pages, rails, sitemap, 404, /guide.md, /llms.txt, schemas under /spec/),
                      content/*.md, site.css over markset.css, serve.ts for site:watch
test/                 tooling.test.ts (the repository's shape), codes.test.ts (spec, suite and code agree on codes),
                      harness.test.ts, consumer/smoke.ts (install the packed or published packages and use them)
docs/                 implementation-plan.md, decisions/, requirements/ (frozen handoff), pilot-findings.md, consumers.md
CHANGELOG.md          every release, newest first; README.md, SECURITY.md, LICENSE
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
- The site's browser checks run Playwright (Chromium) at 390px and 1440px, over a small HTTP server rather than
  file URLs, so the 404 page (linked from the root, served by Pages at any missing address) is checked as served.
- **Everything that parses Markset also runs under micromark's development build**, as Markset does: `pnpm test` ends
  with `test:development`, `conformance:development` runs beside `conformance` in CI and the release, and the smoke
  test runs its consumer a second time with `--conditions=development`. Vite, Vitest and Next resolve that asserting
  build by default, and Markset 0.3.3 passed every production run and threw on any link under it.

## The site

- **The bar is five sections by what a reader came to do** (2026-10-05, after markset.org's): Start, Tools,
  Reference, Examples, Roadmap. Home is the wordmark; About is in the footer's row. `RAILS` in `site/build.ts` lists
  each section's pages, shown beside every page in it: Start (start, How it works, the agent guide), Tools (all
  tools, the command), Reference (the specifications, the Markset page, conformance), Examples (the worked example,
  the pilot). No URL moved when the bar changed. `site/test/rail.test.ts` requires every page to be named by the bar,
  a rail or the footer's row (a record by the example index) and within three links of home: a new page goes in a
  rail.
- `{{version}}` in a content page is the root `package.json` version; a test fails on a typed `at 0.x` or
  `version 0.x`. `{{usage}}` is the CLI's `USAGE`, so the command page cannot drift from `--help`.
- Beside the pages: `/guide.md` is `agentGuide()` from `@intentset/cli` with a placeholder scope (also rendered at
  `/guide/`), `/llms.txt` points agents at it and at markset.org/guide.md, every `spec/*.schema.json` is copied to
  `/spec/` where its `$id` points, and `sitemap.xml`, `robots.txt` and `404.html` come from the page list.
  `/conformance/` is generated from `tests/`.
- **Colours.** The accent is coralreefventures.com's Intentset token (`--crv-intentset-text`,
  `light-dark(#2c6a54, #7cc3a8)`), so the product reads in the same green on both sites. The neutrals are
  Intentset's own green-tinted ground and ink, **deliberately**: markset.org keeps its cool white and
  coralreefventures.com its cream, decided 2026-10-05. Do not "fix" them to match.
- The footer links the sibling site, markset.org, once, as markset.org's links this one.

## Status

Release history is in `CHANGELOG.md` and the reasons in `docs/decisions/`; milestones are
`docs/implementation-plan.md` §5. What an agent needs to know of what exists:

- M0 to M5 are done: specs, core, architecture, verification, publisher, help, Atlas, the MCP server and the CLI with
  every command. Ten packages are on npm, released from CI on a `v*` tag; a new package's first publish is by hand
  (family conventions). intentset.org deploys from GitHub Actions.
- `site/content` is the site copy's source of truth. The IA document in `docs/requirements/` stays frozen as the
  handoff; `site/test/content.test.ts` lists what may differ from it.
- The Streamlane pilot's specification questions are decided (`docs/pilot-findings.md`).
- The export is 0.3. Before 1.0 a changed export envelope is a minor bump of the packages; Streamlane and Driftline
  read exports and move their pins when they update.
- A Markset diagnostic in an export is carried under origin `syntax` with Markset's own code (0.6.1, a defect fix
  inside export 0.3); cases about what Markset reports carry `carrier: "markset"`. The tests, the suite and the
  installed packages also run under micromark's development build.
- One breaking revision was made inside Core 0.1 (2026-10-04, CORE003 for an active outcome with no measure); the
  next such change, to any spec, moves `intentset.spec` to `0.2`.
- The site is organized by task, as markset.org is (2026-10-05): see "The site" above.
- Open: nothing.

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
