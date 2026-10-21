---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/verification/0.2
  id: TEST-ARCH-BASELINE-IDENTITY
  type: verification
  title: A baseline entry holds what a finding is about, one imported name at a time
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-ARCH-BASELINE-IDENTITY]
  verification:
    method: automated
    locator: packages/architecture/test/units.test.ts
    selector: BEH-ARCH-BASELINE-IDENTITY
---

# A baseline entry holds what a finding is about, one imported name at a time

## Procedure

`pnpm test` runs these tests with node:test. They show that a reworded message with a field keeps its keys (#20), that an import is one key per name with type-only names apart, that a baselined import taking another name is an error naming it while a dropped name retires its entry, that an entry written before 0.9 still matches, that an old entry written again reads as a rewrite rather than growth, and, through the whole check, that a swapped import is a new error and a stale entry. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries.

- `packages/architecture/test/units.test.ts`: the group "an entry holds what a finding is about, one imported name at a time"

## Expected result

Every test whose title carries `BEH-ARCH-BASELINE-IDENTITY` passes.
