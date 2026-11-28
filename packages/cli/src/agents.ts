/**
 * The agent guide `intentset init` writes to `.intentset/agents.md`: what a
 * coding agent does, before and after it changes code, to keep the model
 * current (Core §10: load the owning slice first, update affected semantics
 * and checks in the same review, never self-approve). A repository points its
 * agents at it from AGENTS.md or CLAUDE.md.
 *
 * Generated rather than copied, so the commands, the required sections and
 * the trailer can never disagree with the toolchain that wrote it.
 */
import { ARTIFACT_TYPES, REQUIRED_SECTIONS } from "@intentset/core";
import { MARKSET_GUIDE_URL } from "@intentset/markset-adapter";
import { UNCHANGED_TRAILER } from "./git.ts";
import { TOOL } from "./output.ts";

export const AGENT_GUIDE_PATH = ".intentset/agents.md";

/** The lines a repository adds so its agents read the guide, by the file that takes each. */
export const AGENT_POINTERS: Array<[string, string]> = [
  ["CLAUDE.md", `@${AGENT_GUIDE_PATH}`],
  ["AGENTS.md", `Before changing code, read ${AGENT_GUIDE_PATH} and follow it.`],
];

/** How the guide runs the CLI: through the package manager the repository uses. */
export type PackageManager = "npm" | "pnpm";

/** pnpm when the repository says so (its lockfile, workspace file or packageManager field), npm otherwise. */
export function detectPackageManager(files: {
  has(path: string): boolean;
  packageJson: string | null;
}): PackageManager {
  if (files.has("pnpm-lock.yaml") || files.has("pnpm-workspace.yaml")) return "pnpm";
  try {
    const manager = (JSON.parse(files.packageJson ?? "{}") as { packageManager?: unknown }).packageManager;
    if (typeof manager === "string" && manager.startsWith("pnpm@")) return "pnpm";
  } catch {
    // An unreadable package.json says nothing about the package manager.
  }
  return "npm";
}

export function agentGuide(scope: readonly string[], manager: PackageManager = "npm"): string {
  const run = manager === "pnpm" ? "pnpm exec intentset" : "npx intentset";
  const markset = manager === "pnpm" ? "pnpm dlx @markset-lang/cli guide" : "npx @markset-lang/cli guide";
  const isolated =
    manager === "pnpm"
      ? "pnpm dlx --package=@intentset/cli --package=typescript@7 intentset ..."
      : "npx -p @intentset/cli -p typescript@7 intentset ...";
  const where = scope.map((pattern) => `\`${pattern}\``).join(", ");
  const sections = ARTIFACT_TYPES.map(
    (type) => `| ${type} | ${REQUIRED_SECTIONS[type].map((section) => `## ${section}`).join(", ")} |`,
  );
  return `# Keeping the product model current

This repository keeps an Intentset product model: one Markdown file per product intent, outcome, measure, capability,
behavior, rule, scenario, slice, contract, decision, verification and knowledge article, under ${where}. The records
say why the product is changing, what the change should produce and how that will be measured, what the product
promises, which code delivers it and how it is checked. You keep them true as part of every change, in the same commit as the
code, so that people can review what the product does without reading every line of what changed.

Written by \`intentset init\` (${TOOL.name} ${TOOL.version}). To refresh it, delete it and run
\`${run} init --agents\`; \`${run} guide\` prints it without writing a file.

## Before you change code

Load what the code you are about to change promises:

\`\`\`sh
${run} context <a file you will edit>
${run} context <an ID, such as BEH-...>
\`\`\`

The result is the owning slice, its behaviors, rules, scenarios, contracts, decisions and checks, with their paths.
Keep the change inside that slice, and reach other slices only through the contracts it consumes.

## When behavior changes

Update the records in the same change as the code.

- A changed promise: edit the behavior's Behavior, Preconditions and Outcomes, and the rules and scenarios it
  touches.
- A new promise: add a behavior record with \`status: draft\`, and add its ID to \`implements\` on the slice that
  delivers it. New rules, scenarios and verifications start as drafts too.
- New code that no slice claims: add a slice record with \`status: draft\`, its claims and its entrypoints. While a
  slice is a draft, the paths it plans may not exist yet.
- A changed check: a verification record names the test that checks a claim. Change the test and its record
  together, and add one for a behavior or rule that has none.
- Whether the work is built: a capability, behavior, rule, scenario, slice or contract says so in \`delivery\`.
  Write \`delivery: built\` on a record you wrote from code that exists, \`delivery: planned\` on one that proposes
  work, and change \`planned\` to \`built\` in the change that builds it. It states a fact about the code, not an
  approval, so you may set it; a draft that says \`built\` is still a draft until a person approves it.
- Where a promise came from: a behavior, rule or scenario that formalizes a requirement outside the model, such
  as a work item or one of its acceptance criteria, names it in \`formalizes\`, as a \`source\` (a URL or the
  tool's key for the item) and an optional \`anchor\` for the part that is meant. Validation checks its form and
  never opens it.
- Which articles lead a page, route or panel: \`surfaces\` on the slice that owns it (VSA §3), with
  \`availability\` on that slice. A surface ID is written into every eligible reader's help file once the slice is
  approved, so never put a name in it that some reader may not see, such as an internal record's ID or path.
  Quote a surface ID that contains \`:\` as a YAML key, such as \`"lantern-web:/assessments/schedule":\`.

Write each link once, on the record that points: a behavior is \`governedBy\` its rules, a scenario \`illustrates\`
a behavior, a slice \`implements\` behaviors, a verification \`verifies\` what it checks. Never write the reverse.

## When behavior does not change

A refactor changes code and no behavior. Say so in the commit message with a trailer naming each slice:

\`\`\`text
${UNCHANGED_TRAILER}: SLICE-...
\`\`\`

\`intentset review\` lists every slice whose code changed while its records did not, and this trailer is how a
commit answers it. Use it only when no behavior changed: a reviewer reads it as your claim. Git reads trailers only
from a message's last paragraph, so put it there, beside any other trailer such as \`Co-Authored-By\`; in a paragraph
of its own above them, it is not read.

## Never

- Set a status past \`draft\`, or publish knowledge. People approve, and validation passing is not approval;
  \`delivery\` is the fact you may write.
- Run \`intentset approve\` unless the person approving tells you to in so many words, or
  \`intentset approve --renew-review\` unless the person reviewing the knowledge does. Each writes that person's
  approval or review for them, so \`--by\` is the name they give, never your own.
- Write or change \`approval\`, the block that says who approved a record, when and on what basis, unless the
  approval workflow you are running tells you to and gives you every value. It records an approval that happened;
  writing it approves nothing, and one you made up is a false statement about a person.
- Write or change a knowledge record's review: \`reviewedBy\`, \`reviewedAt\` or \`review\` (its pins, \`self\` and
  \`gates\`), unless the review workflow you are running gives you every value. A hash copied from a tool's output
  into a pin claims a review nobody made, and \`intentset review\` lists it. \`intentset approve\`, run on a person's
  word, is what writes a review.
- Change an ID or reuse a retired one. Moving or renaming a file keeps its ID; splitting a behavior retires the old
  one with \`replacedBy\`.
- Name an owner, audience, release, role, edition, flag or evidence source that is not in
  \`.intentset/registries.yaml\`. Ask instead.
- Treat a passing check as the outcome achieved. Verification says the behavior was built as described; a measure
  says whether building it produced the outcome, and only evidence read in its window answers that.
- Commit run evidence (\`.intentset/evidence/\`) or an export. They describe one run and go stale as the code it checks changes.
- Edit generated output: an export, the Atlas, published pages.
- Change \`.intentset/profile.yaml\` or \`.intentset/architecture.yaml\` so that the architecture check passes. They
  are the team's architecture policy: fix the code, or ask a person whether the policy should change.

## Before you finish

\`\`\`sh
${run} validate
${run} architecture check     # when .intentset/architecture.yaml or .intentset/profile.yaml exists
${run} review --base main
\`\`\`

Fix every error. Resolve each slice \`review\` lists under "Code changed, records unchanged", by updating its records
or with the trailer. A repository's profile may turn on rule sets of its stack, and each error the check reports
carries its code and what to do. The architecture check needs TypeScript 7; on an earlier TypeScript, run the toolchain as
\`${isolated}\`.

## Record format

A record is a Markset document: Markdown with YAML frontmatter under \`intentset:\` beside \`markset: true\`, and its
level-one heading repeats its title. Plain Markdown is valid Markset. For the rest of Markset's syntax, the cards,
callouts, tables and other constructs a record may use and the codes \`validate\` reports for them, read Markset's
guide at ${MARKSET_GUIDE_URL}, or print it with \`${markset}\`.

An existing record of the same type in this repository is the best template; in a repository with none yet,
\`${run} init --example --root <an empty directory>\` writes a small example model there to read. A capability sits
under an outcome, an outcome under an intent, and an intent under the product, so the first capability brings those
three with it. A new behavior looks like this, one recognizable promise including how it fails:

\`\`\`markdown
---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/behavior/0.4
  id: BEH-AREA-NAME
  type: behavior
  title: The promise in a few words, such as Schedule a student assessment
  status: draft
  delivery: planned
  owner: <an owner from the registry>
  visibility: internal
  audiences: [engineering, product]
  parent: CAP-...
  links:
    governedBy: [RULE-...]
  availability:
    products: [PRD-...]
    releases: [<a release from the registry>]
    roles: [<a role>]
    editions: [<an edition>]
    flags: []
---

# The promise in a few words, such as Schedule a student assessment

## Behavior
Who acts, and what the system does.

## Preconditions
What must be true first.

## Outcomes
Success: what happens. Failure: what is rejected, and what is left unchanged.
\`\`\`

A slice record says which code delivers behaviors. Modeling code that already exists starts with one, written from
the code as it is: \`claims\` are the paths it owns, \`entrypoints\` the files other code may import, and
\`delivery: built\` says the code exists. All six keys under \`slice\` are required. Write \`layers: {}\` where the
code has no layers and \`usesResources: []\` where it uses no shared resource, and say so in Responsibility; never
invent a layer the code does not have, since a reviewer reads it as the design. A layer's name is one the
repository's profile lists: \`layers\` in \`.intentset/profile.yaml\` when the repository has that file, and
otherwise presentation, application, policy, model and external:

\`\`\`markdown
---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/slice/0.4
  id: SLICE-AREA-NAME
  type: slice
  title: The code's job in a few words, such as Assessment scheduling
  status: draft
  delivery: built
  owner: <an owner from the registry>
  visibility: internal
  audiences: [engineering, product]
  links:
    implements: [BEH-AREA-NAME]
  availability:
    products: [PRD-...]
    releases: [<a release from the registry>]
    roles: [<a role>]
    editions: [<an edition>]
    flags: []
  slice:
    kind: product
    domain: <the part of the business it serves, such as assessment>
    entrypoints: [src/area/name/index.ts]
    layers: {}
    claims:
      - kind: source
        path: src/area/name/**
    usesResources: []
---

# The code's job in a few words, such as Assessment scheduling

## Responsibility
What this code is accountable for. It has no layers and uses no shared resource.

## Public contract
What other code may call, through the entrypoints.

## Verification
The checks that cover it, by ID.
\`\`\`

A verification record binds a check to what it verifies. An automated one names the test file and a selector the
test's title holds as whole words (a \`describe\`'s name binds all of its tests), which is how \`evidence import\`
matches a run to it:

\`\`\`markdown
---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/verification/0.4
  id: TEST-AREA-NAME
  type: verification
  title: What the check proves, such as Unit test of scheduling an assessment
  status: draft
  owner: <an owner from the registry>
  visibility: internal
  audiences: [engineering]
  links:
    verifies: [BEH-AREA-NAME, RULE-AREA-LIMIT]
  verification:
    method: automated
    locator: src/area/name.test.ts
    selector: the test's title, or the describe's name
---

# What the check proves, such as Unit test of scheduling an assessment

## Procedure
The runner and the file, and the cases it covers, the failure cases included.

## Expected result
What a pass shows.
\`\`\`

A knowledge record explains behaviors, rules or capabilities to one audience, in that audience's words rather than
the behavior's. It may carry \`tips\`: one plain sentence per explained ID, at most 160 characters, which the
product shows beside the control that delivers that behavior once the knowledge is reviewed and published.

\`\`\`yaml
  links:
    explains: [BEH-AREA-NAME, RULE-AREA-LIMIT]
  tips:
    BEH-AREA-NAME: What this control does, in one sentence.
    RULE-AREA-LIMIT: The limit, and what happens at it.
\`\`\`

Above the behaviors sit the reasons for them. An intent says why the product is changing (its Rationale names the
problem or opportunity), an outcome says what observable change is expected, and a measure under the outcome says
how that change will be read: a metric, the baseline before the change or the literal \`unknown\`, a target, the
window in which it is read and the source the evidence comes from, which must be in the registry. An outcome past
draft needs at least one measure. Write a measure when you add an outcome, before the capabilities under it.

\`\`\`yaml
  id: MEAS-AREA-NAME
  type: measure
  parent: OUT-...
  measure:
    metric: median_time_to_intervention
    baseline: 5 days
    target: under 2 days
    window: 90 days after <a release from the registry>
    source: <an evidence source from the registry>
    direction: decrease
\`\`\`

Each type requires these level-two sections:

| Type | Required sections |
|---|---|
${sections.join("\n")}

The specifications are at [intentset.org/specifications](https://intentset.org/specifications/).
`;
}
