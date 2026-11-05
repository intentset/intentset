# Intentset

**Keep control of what your agents build.** Agents write code faster than anyone can read it. Intentset keeps what
your product promises, which code delivers each promise and how it is checked, in readable Markdown records in your
repository that your agents update with every change. People review the product rather than the diff, and steer it
where it needs to go. [How it works](https://intentset.org/how-it-works/) · [Why now](https://coralreefventures.com/articles/code-outruns-review/)

Three repositories at one education company have adopted it, each from a different place:

- [Before scale](https://coralreefventures.com/articles/intentset-before-scale/): a 265,000-line app wrote its
  promises down before agents took on most of its work, took its architecture baseline from 97 violations to zero in a
  day, then merged 186 pull requests in twelve days; writing it down found security gaps code review had not.
- [In a million lines](https://coralreefventures.com/articles/intentset-in-a-million-lines/): a five-area platform
  of 560,000 lines and 26,000 tests is writing itself down one area at a time; the first twelve days found more than
  500 gaps, and one modeled behavior led to four authorization fixes in four days.
- [Before launch](https://coralreefventures.com/articles/intentset-before-launch/): a month-old, 18,000-line product
  wrote its 41 behaviors and bound every one to the test that proves it, in one pull request, before anyone depended
  on it.

## Try it in five minutes

From a repository that has never seen Intentset to its first passing check, the same steps as
[intentset.org/start](https://intentset.org/start/). Install, then let `init` write the configuration, the registries
and the guide your agents follow:

```sh
npm install --save-dev @intentset/cli
npx intentset init
```

Point your agents at the guide with one line, `@.intentset/agents.md` in CLAUDE.md or `Before changing code, read
.intentset/agents.md and follow it.` in AGENTS.md. Name what records may refer to in `.intentset/registries.yaml`; one
of each is enough to start, and a behavior needs a release, a role and an edition to name:

```yaml
owners:
- team-shop
audiences:
- engineering
- product
releases:
- v1
roles:
- shopper
editions:
- standard
flags: []
evidenceSources: []
resources: []
```

Then ask your agent to write one capability down:

```text
Read .intentset/agents.md. Model the <capability> capability from its code, tests and
decision records, as draft records under product/: the product, the intent and the
outcome the capability serves, the capability, its behaviors with their rules and
scenarios, the slice that owns the code, and an automated verification record for each
test that checks it, with the test file as its locator and the test's title as its
selector. Use only the names .intentset/registries.yaml holds. Leave every record a
draft. Run intentset validate and fix what it reports until it reports no error.
```

Check what it wrote, bind the tests to this commit, and read the model with its evidence:

```sh
npx intentset validate --level L2
npx vitest run --reporter=json --outputFile=reports/vitest.json
npx intentset evidence import --from vitest reports/vitest.json \
  --out .intentset/evidence/local.json --product <PRD-ID> --release v1
npx intentset validate --level L3
```

The last line says `verified: 1 of 1 behavior`: a promise, the code that owns it, and a test that passed on this
commit. Add `reports/` and `.intentset/evidence/` to `.gitignore`. With pnpm, `pnpm add --save-dev @intentset/cli`,
then `pnpm exec intentset` wherever `npx intentset` appears; the architecture check needs TypeScript 7, and the note
at the end of [the Start page](https://intentset.org/start/) says when that needs a different command. To see one
record of each type first, `npx intentset init --example --root <an empty directory>` writes the worked example there.

**Status: v0.2 draft.** The specifications are ready for review, and the reference implementation is on npm as
`@intentset/*`, early releases to try against one real capability. [`CHANGELOG.md`](CHANGELOG.md) says what each
release changed, and whether the specifications, the conformance suite or the export contract moved.

Ten packages are published under the `@intentset` scope: `core`, `markset-adapter`, `architecture`, `verification`, `publisher`, `help`, `atlas`, `mcp`, `conformance-suite` and `cli`.

- Specifications: [`spec/core-0.2.md`](spec/core-0.2.md), [`spec/vsa-0.2.md`](spec/vsa-0.2.md),
  [`spec/profile-typescript-amplify-gen2-0.2.md`](spec/profile-typescript-amplify-gen2-0.2.md),
  [`spec/publication.md`](spec/publication.md), and the export contract other tools read,
  [`spec/export.md`](spec/export.md)
- Worked example: [`examples/scheduling/`](examples/scheduling/), an invented product
- Conformance suite: [`tests/`](tests/), one JSON file per area, schema in
  [`spec/conformance.schema.json`](spec/conformance.schema.json); export consumer fixtures in
  [`tests/consumer/`](tests/consumer/)
- Site: intentset.org, built from [`site/`](site/)

## Try it from a checkout

From a checkout of this repository, which uses pnpm (pinned in `package.json`; `corepack enable` provides it):

```sh
pnpm install
pnpm run intentset init --repository you/repo --example --root <dir>   # <dir> an empty directory
pnpm run intentset validate --root <dir>
pnpm run intentset impact BEH-ASMT-SCHEDULE --root <dir>
```

Commands: `init`, `validate` (levels L1 to L4), `graph`, `migrate` (records to the next specification version), `impact`, `context`, `architecture check`,
`evidence import`, `review`, `publish`, `serve` (the Atlas), `mcp` (a read-only context server), and `guide` (the
agent guide, printed).

## Keep the model current with agents

The records are written and updated by the coding agents that change the code, in the same commit, and reviewed by
people. `init` writes `.intentset/agents.md`, the guide an agent follows (`init --agents` writes it alone in a
repository already set up); point agents at it with `@.intentset/agents.md` in CLAUDE.md or a line in AGENTS.md.
`intentset guide` prints the same guide without writing anything. The records are Markset documents, and Markset's
own guide to its syntax is https://markset.org/guide.md.

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

`CLAUDE.md` holds the design invariants and working rules; `CHANGELOG.md` the release history; `docs/implementation-plan.md` the plan;
`docs/decisions/` the ADRs; `docs/pilot-findings.md` what the first pilot asked of the specification.

## Licence

MIT, for the code, the specifications, the schemas and the fixtures alike.
