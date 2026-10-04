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
\`${run} init --agents\`.

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

Write each link once, on the record that points: a behavior is \`governedBy\` its rules, a scenario \`illustrates\`
a behavior, a slice \`implements\` behaviors, a verification \`verifies\` what it checks. Never write the reverse.

## When behavior does not change

A refactor changes code and no behavior. Say so in the commit message with a trailer naming each slice:

\`\`\`text
${UNCHANGED_TRAILER}: SLICE-...
\`\`\`

\`intentset review\` lists every slice whose code changed while its records did not, and this trailer is how a
commit answers it. Use it only when no behavior changed: a reviewer reads it as your claim.

## Never

- Set a status to approved, implemented or released, or publish knowledge. People approve, and validation passing
  is not approval.
- Change an ID or reuse a retired one. Moving or renaming a file keeps its ID; splitting a behavior retires the old
  one with \`replacedBy\`.
- Name an owner, audience, release, role, edition, flag or evidence source that is not in
  \`.intentset/registries.yaml\`. Ask instead.
- Treat a passing check as the outcome achieved. Verification says the behavior was built as described; a measure
  says whether building it produced the outcome, and only evidence read in its window answers that.
- Commit run evidence (\`.intentset/evidence/\`) or an export. They describe one commit and are stale once it lands.
- Edit generated output: an export, the Atlas, published pages.

## Before you finish

\`\`\`sh
${run} validate
${run} architecture check     # when .intentset/architecture.yaml exists
${run} review --base main
\`\`\`

Fix every error. Resolve each slice \`review\` lists under "Code changed, records unchanged", by updating its records
or with the trailer. The architecture check needs TypeScript 7; on an earlier TypeScript, run the toolchain as
\`${isolated}\`.

## Record format

A record is Markdown with YAML frontmatter under \`intentset:\`, and its level-one heading repeats its title. An
existing record of the same type in this repository is the best template; a new behavior looks like this, one
recognizable promise including how it fails:

\`\`\`markdown
---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-AREA-NAME
  type: behavior
  title: The promise in a few words, such as Schedule an assessment
  status: draft
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

# The promise in a few words, such as Schedule an assessment

## Behavior
Who acts, and what the system does.

## Preconditions
What must be true first.

## Outcomes
Success: what happens. Failure: what is rejected, and what is left unchanged.
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

The specifications are at https://intentset.org/specifications/.
`;
}
