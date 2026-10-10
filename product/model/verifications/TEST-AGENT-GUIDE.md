---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-AGENT-GUIDE
  type: verification
  title: Init and guide write the agent guide and overwrite nothing
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-AGENT-GUIDE]
  verification:
    method: automated
    locator: packages/cli/test/cli.test.ts
    selector: BEH-AGENT-GUIDE
---

# Init and guide write the agent guide and overwrite nothing

## Procedure

`pnpm test` runs these tests with node:test. Run against the built CLI in a temporary directory, the tests run `init`, `init --agents` and `guide` and read what each wrote. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/cli/test/cli.test.ts`: the test "init writes a config and empty registries, and validate passes on the empty scope"
- `packages/cli/test/cli.test.ts`: the test "init refuses to overwrite, and writes nothing when it refuses"
- `packages/cli/test/cli.test.ts`: the test "init --agents writes only the guide, for the scope the config names, and never over an existing one"
- `packages/cli/test/cli.test.ts`: the test "guide prints the guide init --agents writes, for the config's scope, and writes nothing"

## Expected result

Every test whose title carries `BEH-AGENT-GUIDE` passes. Init writes the configuration, the empty registries and the guide, and the empty scope validates; `--agents` writes only the guide, for the scope the configuration names; `guide` prints the same text and writes nothing; and when any file already exists, init names it, writes nothing and exits non-zero.
