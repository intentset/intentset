# Consumers of the export: where each need is met

Streamlane and Driftline read Intentset models through the export (`spec/export.md`). This note maps what each one
needs to the field, report or fixture that supplies it, so implementation in either repository starts from the
contract rather than from this one's code. The rules a consumer follows are spec/export.md §5; what is below is
where to find things.

## Producing the export in CI

```sh
npm install --save-dev @intentset/cli   # only the CLI has the `intentset` binary
# after the tests, with a JSON reporter writing reports/vitest.json
npx intentset evidence import --from vitest reports/vitest.json --out .intentset/evidence/ci.json \
  --product <PRD-ID> --release <label>
npx intentset graph --level L3 --release <PRD-ID>:<label> --report all --out intentset-export.json
```

Upload `intentset-export.json` as a CI artifact; never commit it or the run records, which are stale at the next
commit. At L2 (no run records) `--report all` gives knowledge, impact and ownership; evidence is then not supplied,
which a consumer shows as such. The export states the repository's own verdict on evidence, by the binding it judges by, and carries that binding, each record's `binding` and `subjectHash` and each verification's `subject` (export §4.1), so a record made at an older commit reads current while the subject it checked is unchanged. A resource's files are in a subject only where the verification names the resource in `exercises` or an implementing slice owns it (`evidence.resources: exercised`, the default; `used` hashes every resource a slice lists), so a backend change does not make stale every check of every web slice that talks to it, and EVID006 says how many verifications are current though a resource they use changed: add `exercises` where a check depends on one. A slice reached only through `dependsOn` puts every file it claims in a subject; `evidence.dependencies: entrypoint` (opt-in; the default is `files`) counts it by its binding fields, entrypoint files and contract records instead, and EVID007 says how many verifications are current though a file of such a slice, outside its entrypoints, changed. The export is unchanged by this. With pnpm and the CLI installed, the commands are `pnpm exec intentset …`. The
architecture check needs TypeScript 7: a repository on 5.x runs the CLI as
`npx -p @intentset/cli -p typescript@7 intentset …`, or with pnpm as
`pnpm dlx --package=@intentset/cli --package=typescript@7 intentset …`.

## Running only what moved

Under subject binding a record is current while what it checked is unchanged, so a merge makes stale only the
verifications around what it touched. A slow suite, such as a browser run on every merge, can run just those:

```sh
args=$(npx intentset evidence stale --format playwright --release <PRD-ID>:<label>)
[ -z "$args" ] || eval "npx playwright test $args"
```

`--format playwright` prints `--grep '<selectors>'` and the locator files, so only those spec files load and only the
tests carrying a stale verification's selector run; `--format vitest` prints the files and `-t '<selectors>'`, and
`--format node-test` one `--test-name-pattern` per selector and the files. Import the run afterwards as usual and the
records are current again. The runner matches a pattern as a substring where Intentset matches the selector as a whole
token, so a few extra tests may run, never fewer. When nothing needs a run the command prints an empty line and says so
on stderr, so the capture is safe; guard it as above, because a runner given no arguments runs everything, or let the
nightly run be the full one. The arguments are quoted for a POSIX shell, so paste them or pass them through `eval`, as
above; an unquoted `$args` would hand the runner the quote characters. `--check` exits 1 while any automated verification needs a run, for a gate that asks
whether the evidence is current; `--format json` is the list for a script. A manual review is listed apart, because no
runner re-runs it. A change to a central slice moves nearly everything, and that merge needs the full suite; the
nightly run is the backstop for what the declarations missed (ADR 0013).

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
| STL-004 traceability with provenance | owning slice: `derived.implements` on a behavior; rules: `links.governedBy`; checks: `derived.verifies`; run status and freshness: `reports.evidence.verifications[].status`, `binding` and `latest`, and `reports.evidence.binding` and `bindingReason`; per-claim: `reports.evidence.claims`; knowledge: `derived.explains` and `reports.knowledge` |
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
| Outcomes and their measures | `artifacts[]` of type `outcome`, and of type `measure` with `parent` naming the outcome and `measure` carrying metric, baseline, target, window and source; `registries.evidenceSources` names where readings come from |
| Beta explanations | knowledge artifacts and `reports.knowledge` (only `current` knowledge is fit to show users) |
| Its own model, written before its code | VSA §3: draft slices plan their paths as warnings, so L2 holds from the first commit |

Driftline's usage-evidence specification, keyed to Intentset IDs, is planned as an Intentset extension and is not
part of 0.4; Core §8 names the shape an outcome evidence record will take (measure ID, window, observed value, source,
time, URI, target met). Until it exists, Driftline-specific fields go in namespaced `extensions`, which the export carries as
authored.

## Moving a pin: export 0.4 and specifications 0.2 (ADR 0014)

Both are breaking, they ship together as 0.7.0, and a consumer moves both pins at once.

| Where | What changes |
|---|---|
| The repository that produces the export (Streamlane's `model:export`, Intentset's own) | Move `@intentset/cli` to 0.7.0, and run `intentset migrate --to 0.2` once on a clean tree, committing what it rewrites: it changes `spec` and `profile` in each record the scope matches and nothing else. A 0.7.0 reader rejects a record that declares `0.1` (CORE001). |
| A reader of the export (`readExport`, Driftline's `modelFromExport`, Streamlane's importer) | Support `intentset/export/0.4` and drop 0.3, which a 0.4 reader rejects as `unsupported-contract`. Accept `reports.evidence.binding`, `bindingReason`, each verification's `binding` and `subject`, a run record's optional `binding` and `subjectHash`, and a verification artifact's `exercises`; take a status as the producer's verdict under that binding (export §4.1) and show the binding beside it. |
| A consumer's own tests | Run the importer over the fixtures again: `subject-current.json`, `subject-stale.json`, `commit-fallback.json`, `subject-hash-mismatch.json` and `unsupported-contract-0.3.json` are new, and every accepted envelope's `spec` is `0.2`. |

A record imported by commit binding stays what it was; under the default a repository with slices reads such a record as
stale until `intentset evidence import` writes it again (Core §8). What changes for a reader of the export is that
evidence the repository's gate accepts now reads current there too.
