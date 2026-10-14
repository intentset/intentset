---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/verification/0.2
  id: TEST-EVIDENCE-CURRENT
  type: verification
  title: Only a pass whose binding holds counts
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 2
  links:
    verifies: [BEH-EVIDENCE-CURRENT]
  verification:
    method: automated
    locator: packages/verification/test/classify.test.ts
    selector: BEH-EVIDENCE-CURRENT
---

# Only a pass whose binding holds counts

## Procedure

`pnpm test` runs these tests with node:test. The classification and coverage units are run over hand-built run records at, and away from, the assessed commit and graph hash and the subject's hash; the subject hash is run over a hand-built graph, one part at a time; the architecture package's resolution of claims, resources and imports is run over a small tree; the CLI tests import a report, change what the check is about and what it is not, and validate at L3. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/cli/test/checks.test.ts`: the test "evidence import binds a Vitest report to the commit, and L3 reads it as a current pass"
- `packages/cli/test/checks.test.ts`: the test "at L3 an approved behavior without a current pass is CORE007"
- `packages/verification/test/check.test.ts`: the group "coverage"
- `packages/verification/test/classify.test.ts`: the group "classifyEvidence"
- `packages/verification/test/classify.test.ts`: the group "subject binding"
- `packages/verification/test/subject.test.ts`: the group "the subject hash"
- `packages/verification/test/binding.test.ts`: the groups "which binding is in force" and "subjectsFor"
- `packages/architecture/test/subject-source.test.ts`: the group "subjectSource"
- `packages/cli/test/checks.test.ts`: the tests whose titles carry `BEH-EVIDENCE-CURRENT` and name a binding, global inputs or EVID004 or EVID005
- `tests/evidence.json`: the S cases, run by the conformance suite

## Expected result

Every test whose title carries `BEH-EVIDENCE-CURRENT` passes. Under commit binding only a pass at both the commit and the graph hash is current, and under subject binding a pass with the subject's hash, whatever the commit; a change to a file a claim, a dependency, the test, a helper, an exercised slice, a used resource or a global input names, or to a verified record or a slice's binding field, makes a subject record stale and names the part, while a prose edit to a slice, an unrelated record or an unrelated commit does not; a commit record under subject binding and a subject record under commit binding are stale with a note; a stale failure is stale, a failure at the snapshot stays visible after an older pass, and a record still carrying `@current` is unresolved, never current; link coverage and current-pass coverage are counted apart, with snapshot and denominator, and never as a percentage; at L3 an approved behavior without a current pass is CORE007; with no slice claims the verdict is by commit and EVID004 says so, and EVID005 lists what changed outside every subject.
