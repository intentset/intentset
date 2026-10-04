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

From a checkout of this repository:

```sh
npm install
npm run intentset -- init --repository you/repo --example --root <dir>   # <dir> an empty directory
npm run intentset -- validate --root <dir>
npm run intentset -- impact BEH-ASMT-SCHEDULE --root <dir>
```

Commands: `init`, `validate` (levels L1 to L4), `graph`, `impact`, `context`, `architecture check`,
`evidence import`, `review`, `publish`, `serve` (the Atlas), and `mcp` (a read-only context server).

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
`npx -p @intentset/cli -p typescript@7 intentset …`.

## Develop

```sh
npm test            # unit tests, fixtures, site and browser checks
npm run conformance # the suite against this implementation, per section
npm run typecheck
npm run lint
npm run site        # build intentset.org into dist/
```

`CLAUDE.md` holds the design invariants and working rules; `docs/implementation-plan.md` the plan;
`docs/decisions/` the ADRs; `docs/pilot-findings.md` what the first pilot asked of the specification.

## Licence

MIT, for the code, the specifications, the schemas and the fixtures alike.
