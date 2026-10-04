# Consumers of the export: where each need is met

Streamlane and Driftline read Intentset models through the export (`spec/export.md`). This note maps what each one
needs to the field, report or fixture that supplies it, so implementation in either repository starts from the
contract rather than from this one's code. The rules a consumer follows are spec/export.md §5; what is below is
where to find things.

## Producing the export in CI

```sh
# after the tests, with a JSON reporter writing reports/vitest.json
npx intentset evidence import --from vitest reports/vitest.json --out .intentset/evidence/ci.json \
  --product <PRD-ID> --release <label>
npx intentset graph --level L3 --release <PRD-ID>:<label> --report all --out intentset-export.json
```

Upload `intentset-export.json` as a CI artifact; never commit it or the run records, which are stale at the next
commit. At L2 (no run records) `--report all` gives knowledge, impact and ownership; evidence is then not supplied,
which a consumer shows as such. The architecture check needs TypeScript 7: a repository on 5.x runs the CLI as
`npx -p @intentset/cli -p typescript@7 intentset …`.

## Reading it

`readExport(text, { repository, product })` from `@intentset/core` (no dependencies) returns the envelope and the
reports supplied, or a rejection category. A consumer in another language makes the same checks; either way, run the
importer over `@intentset/conformance-suite/consumer/` (or `tests/consumer/` here) in the consumer's own tests.

## Streamlane

| Requirement | Met by |
|---|---|
| STL-001 connection with stable identity | `repository`, `products`; `identity-mismatch` cases |
| STL-002 versioned import, validate before promotion | `contract`, `readExport`; `unsupported-contract`, `malformed`, `not-json` cases; snapshot pair (`source.commit`, `graphHash`) for idempotent re-import (`full-regenerated.json`) |
| STL-003 link to stable artifact IDs | `artifacts[].id`, `type`, `status`, `visibility`; key by (connection, ID), never title or `path` |
| STL-004 traceability with provenance | owning slice: `derived.implements` on a behavior; rules: `links.governedBy`; checks: `derived.verifies`; run status and freshness: `reports.evidence.verifications[].status` and `latest`; per-claim: `reports.evidence.claims`; knowledge: `derived.explains` and `reports.knowledge` |
| STL-005 impact as review context | `reports.impact.starts[]`: `direct` apart from `candidates`, each step's `reason`, and `note` |
| STL-006 work state apart from product state | nothing flows back; the export is read-only by contract |
| STL-007 moves, retirement, stale snapshots | IDs survive path changes; `status: retired` with `links.replacedBy`; dangling links stay visible (§2) |
| STL-008 authorization before retrieval | restricted artifacts withheld by default (`withholding`), but per-reader authorization stays Streamlane's (§3, §5) |
| STL-009 refresh and stale states | rejection keeps the prior snapshot; `stale-evidence.json` for evidence; "not supplied" for absent reports (`minimal.json`) |
| STL-010 optional | nothing in the export assumes a connection exists |

Streamlane's own work: the read-model ADR (one table per record kind), Connection, Snapshot, artifact read model and
Import audit records, atomic promotion, work-item associations, the Product context panel, and per-reader
authorization.

## Driftline

| Need | Met by |
|---|---|
| Behaviors, their availability and flags | `artifacts[]` of type `behavior` with `availability` (products, releases, roles, editions, flags); `registries.flags` |
| A stack frame's file to a slice, its behaviors and its team | `reports.ownership.files[]` (`path` to `region` and `owner`), then the slice's `links.implements` and `owner` |
| Affected behaviors for an incident | the owning slice's `links.implements`, then `reports.impact` from each behavior for what depends on it |
| Outcomes and their measures | `artifacts[]` of type `outcome`; the Measure section is in `body` with `--include-bodies` |
| Beta explanations | knowledge artifacts and `reports.knowledge` (only `current` knowledge is fit to show users) |
| Its own model, written before its code | VSA §3: draft slices plan their paths as warnings, so L2 holds from the first commit |

Driftline's usage-evidence specification, keyed to Intentset IDs, is planned as an Intentset extension and is not
part of 0.2. Until it exists, Driftline-specific fields go in namespaced `extensions`, which the export carries as
authored.
