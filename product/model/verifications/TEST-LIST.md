---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/verification/0.2
  id: TEST-LIST
  type: verification
  title: List matches by the selector, agrees with its export, and refuses what it cannot read
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-LIST]
  verification:
    method: automated
    locator: packages/cli/test/list.test.ts
    selector: BEH-LIST
---

# List matches by the selector, agrees with its export, and refuses what it cannot read

## Procedure

`pnpm test` runs these tests with node:test. The CLI runs `list` on the worked example with field options, repeated and comma-separated values, `--has` with each quantifier, `--count-by`, `--where`, `--from` an export written by `graph`, a restricted rule, a failing validation and every invocation error; the core units read and normalize selectors, select over a graph and over its export, and count. What a selector matches is held by `tests/list.json`, which `pnpm run conformance` and core's own conformance test run. The selector is the behavior's ID, which each test's title carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/cli/test/list.test.ts`: every test, each titled "BEH-LIST: …"
- `packages/core/test/select.test.ts`: the tests titled "BEH-LIST: …"

## Expected result

Every test whose title carries `BEH-LIST` passes. Fields combine with AND and values with OR; JSON output is the `intentset/list/0.1` result and the same bytes twice; the export gives the tree's answer; a withheld link leaves a record undetermined and `--check` exits 1 on it; a failed validation still exits 0 and says so; an invocation error exits 2 before the tree is read; and `list` writes nothing.
