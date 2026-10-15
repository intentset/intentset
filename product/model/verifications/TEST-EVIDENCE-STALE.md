---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/verification/0.2
  id: TEST-EVIDENCE-STALE
  type: verification
  title: Evidence stale selects what has no current pass and escapes it for each runner
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-EVIDENCE-STALE]
  verification:
    method: automated
    locator: packages/cli/test/checks.test.ts
    selector: BEH-EVIDENCE-STALE
---

# Evidence stale selects what has no current pass and escapes it for each runner

## Procedure

`pnpm test` runs these tests with node:test. In a temporary git repository with a subject-bound run imported, the CLI lists what needs a run before the run, after it, after a commit nothing claims, and after a commit to a claimed file, and the note names that file; `--check` exits 1 only while something needs a run; the JSON is the same bytes twice; and no file is written. The unit tests select from a classification (stale, missing, error, skip, current-fail, current pass, retired, manual) and escape selectors holding brackets, parentheses, `|`, quotes, backslashes, `/` and `$` for Playwright, Vitest and node:test, handing each through a POSIX shell. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries.

- `packages/cli/test/checks.test.ts`: the test "evidence stale lists what has no current pass, then what a change moved, and writes nothing"
- `packages/cli/test/checks.test.ts`: the test "a manual verification is listed apart and never needs a run, and usage errors exit 2"
- `packages/verification/test/stale.test.ts`: the group "staleReport"
- `packages/verification/test/stale.test.ts`: the group "runnerArguments"

## Expected result

Every test whose title carries `BEH-EVIDENCE-STALE` passes. A verification with no current pass is listed with its status, a stale subject record names the part that moved, a current pass is not listed, a manual review is listed apart and never fails `--check`, each runner's arguments select exactly the escaped selectors and the locator files, and nothing is written.
