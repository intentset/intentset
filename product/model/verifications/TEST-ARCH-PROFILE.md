---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/verification/0.3
  id: TEST-ARCH-PROFILE
  type: verification
  title: A repository's own profile says its layers, their roles and which rule sets run
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-ARCH-PROFILE]
  verification:
    method: automated
    locator: packages/architecture/test/units.test.ts
    selector: BEH-ARCH-PROFILE
---

# A repository's own profile says its layers, their roles and which rule sets run

## Procedure

`pnpm test` runs these tests with node:test. They hold the reference profile, read from its profile file, equal to the configuration the check always had; the plain TypeScript profile to the same data without the Amplify rule set and its backend; the one order of the shipped profile, the profile file, the architecture configuration and the caller; a profile with an error left unapplied as a whole; a language with no reader refused; the layer functions reading the roles from the profile; and the example in `docs/writing-a-profile.md` read without a diagnostic. The conformance cases of tests/vsa.json whose names start with PROFILE cover the same through the whole check, one per condition of the contract, and are not tagged here. The selector is the behavior's ID, which the title of the group the tests are in carries.

- `packages/architecture/test/units.test.ts`: the group "BEH-ARCH-PROFILE: profiles (profile contract, ADR 0030)"

## Expected result

Every test whose title carries `BEH-ARCH-PROFILE` passes.
