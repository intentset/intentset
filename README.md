# Intentset

Keep product intent connected to what you ship. Intentset connects what a product is meant to do with the slices
that implement it, the checks that verify it, and the knowledge you share with customers, as readable Markdown files
in your repository. The graph, reports, Atlas and published knowledge are views of those files.

**Status: v0.1 draft.** The specifications are ready for review, and the reference implementation is on npm as
`@intentset/*` 0.1.0, early releases to try against one real capability.

- Specifications: [`spec/core-0.1.md`](spec/core-0.1.md), [`spec/vsa-0.1.md`](spec/vsa-0.1.md),
  [`spec/profile-typescript-amplify-gen2-0.1.md`](spec/profile-typescript-amplify-gen2-0.1.md),
  [`spec/publication.md`](spec/publication.md)
- Worked example: [`examples/scheduling/`](examples/scheduling/), an invented product
- Conformance suite: [`tests/`](tests/), one JSON file per area, schema in
  [`spec/conformance.schema.json`](spec/conformance.schema.json)
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
