---
markset: 0
intentset:
  spec: '0.4'
  profile: intentset/verification/0.4
  id: TEST-SURFACES
  type: verification
  title: Surfaces are read in order, every malformed form is refused, and the export carries them
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-SURFACES]
  verification:
    method: automated
    locator: packages/core/test/surfaces.test.ts
    selector: BEH-SURFACES
---

# Surfaces are read in order, every malformed form is refused, and the export carries them

## Procedure

`pnpm test` runs these tests with node:test. The selector is the behavior's ID, which each test's title carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records.

- `packages/core/test/surfaces.test.ts`: surfaces read in code-unit key order with each list in declared order; `{}` needs no availability; the surface ID rules, digits only, `__proto__` and the six refused characters included; each malformed form as CORE001 at its field, a missing availability among them, and the remediation for `surfaces` written beside `slice`; CORE003 for a lead that does not resolve or is not knowledge; CORE005 for retired knowledge, naming the successor; CORE013 on each of two slices, a retired one not counting; `__proto__` refused at any depth, as CORE010; the content hash moved by a change to surfaces; the export's order, withholding and emptied key; `readExport` refusing a slice without `surfaces` or with a bad key.
- `test/surfaces.test.ts`: a change to `surfaces` alone moves the slice's content hash and not its binding fields, so no subject moves.
- The surface cases of `tests/core.json` and `tests/export.json`, which `pnpm run conformance` runs.

## Expected result

Every test passes, and every case gives its expected validity, diagnostics and output.
