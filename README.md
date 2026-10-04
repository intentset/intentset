# Intentset

Keep product intent connected to what you ship. Intentset connects what a product is meant to do with the slices
that implement it, the checks that verify it, and the knowledge you share with customers, as readable Markdown files
in your repository. The graph, reports, Atlas and published knowledge are views of those files.

**Status: v0.1 draft.** The specifications are ready for review, and the reference implementation is on npm as
`@intentset/*`, early releases to try against one real capability.

- Specifications: [`spec/core-0.1.md`](spec/core-0.1.md), [`spec/vsa-0.1.md`](spec/vsa-0.1.md),
  [`spec/profile-typescript-amplify-gen2-0.1.md`](spec/profile-typescript-amplify-gen2-0.1.md),
  [`spec/publication.md`](spec/publication.md), and the export contract other tools read,
  [`spec/export.md`](spec/export.md)
- Worked example: [`examples/scheduling/`](examples/scheduling/), an invented product
- Conformance suite: [`tests/`](tests/), one JSON file per area, schema in
  [`spec/conformance.schema.json`](spec/conformance.schema.json); export consumer fixtures in
  [`tests/consumer/`](tests/consumer/)
- Site: intentset.org, built from [`site/`](site/)

## Try it

```sh
npm install --save-dev @intentset/cli
npx intentset init --repository you/repo --example
npx intentset validate
npx intentset impact BEH-ASMT-SCHEDULE
```

With pnpm, `pnpm add --save-dev @intentset/cli`, then `pnpm exec intentset` wherever `npx intentset` appears.

From a checkout of this repository, which uses pnpm (pinned in `package.json`; `corepack enable` provides it):

```sh
pnpm install
pnpm run intentset init --repository you/repo --example --root <dir>   # <dir> an empty directory
pnpm run intentset validate --root <dir>
pnpm run intentset impact BEH-ASMT-SCHEDULE --root <dir>
```

Commands: `init`, `validate` (levels L1 to L4), `graph`, `impact`, `context`, `architecture check`,
`evidence import`, `review`, `publish`, `serve` (the Atlas), and `mcp` (a read-only context server).

## Keep the model current with agents

The records are written and updated by the coding agents that change the code, in the same commit, and reviewed by
people. `init` writes `.intentset/agents.md`, the guide an agent follows (`init --agents` writes it alone in a
repository already set up); point agents at it with `@.intentset/agents.md` in CLAUDE.md or a line in AGENTS.md.

- `intentset context <file>` gives an agent the slice that owns the file it is about to edit, with its behaviors,
  rules, scenarios, contracts, decisions and checks.
- `intentset review --base main` lists each slice whose code changed while none of its records did. A refactor says
  so with an `Intentset-Unchanged: <slice ID>` commit trailer; `--fail-on-drift` makes anything else fail CI.

## Read a model from another tool

`intentset graph` writes the export another tool imports: the graph, and on request evidence, knowledge, impact and
ownership reports, with restricted artifacts withheld ([`spec/export.md`](spec/export.md)). In CI, after the tests:

```sh
npx intentset evidence import --from vitest reports/vitest.json --out .intentset/evidence/ci.json \
  --product PRD-X --release <label>
npx intentset graph --level L3 --release PRD-X:<label> --report all --out intentset-export.json
```

A consumer reads it with `readExport` from `@intentset/core`, which has no dependencies, and tests itself against
the valid and deliberately invalid envelopes in `@intentset/conformance-suite/consumer/`. The architecture check
needs TypeScript 7; a repository on an earlier TypeScript runs it as
`npx -p @intentset/cli -p typescript@7 intentset …`, or with pnpm as
`pnpm dlx --package=@intentset/cli --package=typescript@7 intentset …`. With pnpm and the CLI installed, the CI
commands above are `pnpm exec intentset …`.

## Show help inside the product

A knowledge record may carry `tips`, one sentence per behavior it explains. `intentset publish` writes them to
`help.json` beside the published documents, and `@intentset/help` puts each on the control that names its behavior:

```ts
import { bindTips, readHelp } from "@intentset/help";

const read = readHelp(await (await fetch("/help/help.json")).text());
if (read.ok) bindTips(document, read.help); // every element with data-behavior="BEH-..." gets its tip as a title
```

The file was published for one audience, release, role, edition and set of flags, so a product serves each person
the one published for their entitlement. `bindTips` reports the behaviors on the page that have no tip yet.

## Develop

```sh
pnpm test             # unit tests, fixtures, site and browser checks
pnpm run conformance  # the suite against this implementation, per section
pnpm run typecheck
pnpm run lint
pnpm run site         # build intentset.org into dist/
```

`CLAUDE.md` holds the design invariants and working rules; `docs/implementation-plan.md` the plan;
`docs/decisions/` the ADRs; `docs/pilot-findings.md` what the first pilot asked of the specification.

## Licence

MIT, for the code, the specifications, the schemas and the fixtures alike.
