# ADR 0020: A record says on what basis it was approved, and which outside requirement it formalizes

**Status:** accepted, 2026-11-14

## Context

`status: approved` records intent (Core §7), and it reads the same however the record came to be approved. A tool
that runs an approval workflow is moving from a person approving every drafted record to a person approving the intent
of a work tracker's item once, with the records derived from that item approved on that basis. After the move a
reader of the model cannot tell a behavior a person read from one that was derived from something a person approved,
or from one an agent alone vouched for. Intentset's value is that the model can show how it knows what it says, and
here it could not.

Two more things were missing for the same flow:

- Every relationship points at another record (Core §5). A behavior derived from an acceptance criterion had no
  standard place to name the criterion; Core §5 sent external URLs to `extensions`, which no tool reads the same way.
- A verification record has a `status` like any other, so a workflow that asks a person to approve each record asks
  for an approval of every test definition too, although what a person cares about is the claim it checks.

Intentset holds no workflow policy and must not start: it never says who may approve, or when a person is required.

## Decision

### 1. `approval`: the basis of a record's approval (Core §7)

```yaml
intentset:
  approval:
    at: "2026-11-14"            # required: a date or a date and time, a quoted string as reviewedAt is
    basis: derived              # required: direct | derived | attested
    by: ana.reyes               # the person: required for direct and derived, not written for attested
    source:                     # required for derived, not written otherwise
      ref: https://tracker.example/LAN-12    # a URL or a tool's item key
      revision: "7"             # at least one of revision and digest
      digest: sha256:9f2c41d0
    attestedBy: drafting-agent  # the agent: required for attested, optional for derived, not written for direct
```

- `direct`: a person read this record. `derived`: it is approved because a named source that a person approved
  covers it. `attested`: an agent attested it, and no person approved it or a source of it.
- **`by` always names a person and `attestedBy` always names an agent.** The proposal had `by` on every basis, but an
  attested approval has no person by definition, so `by` there would have named the agent and a reader would have had
  to read `basis` before it could say who approved. With the two kept apart, "which records did a person approve" is
  the records with `by`.
- **`source` is forbidden outside `derived`, not ignored.** A field a validator ignores is a mistake nobody is told
  about; a direct approval that names a source is probably a derived one.
- **Optional, on any type, and not required on an approved record.** A record without it says nothing about how it
  was approved, so every record written before this decision means what it meant.
- **Shape only, CORE001.** A validator checks the keys, their types and the table above. It never resolves `ref`,
  never decides who may approve, whether a basis is acceptable or whether a person is required, and does not compare
  `approval` with `status`: whether a draft may carry one, and what basis a team accepts, is that team's workflow.
- **No new diagnostic code.** Every constraint of the frontmatter schema is CORE001 with a JSON pointer (ADR 0002),
  as `delivery`, `tips` and `measure` are, and a test holds `readArtifact` equal to the schema on validity. A tool
  that wants to tell an approval problem from another reads the diagnostic's `field`, which begins
  `/intentset/approval` or `/intentset/formalizes`.
- **Beside `reviewedBy`, `reviewedAt` and the `intentset.org/review` extension, and meaning something else.** Those
  three are a knowledge review: an article was read against the sources it pins (publication §3), and publication
  refuses knowledge without them. `approval` is about the record's own promise, on any type, and nothing refuses a
  record for lacking it. A reviewed knowledge article may carry both, and neither is read as the other.
- **Left out of the content hash** (`content-v1`, ADR 0018), as `status` and the review fields are, so writing or
  changing an approval never makes a knowledge pin need review. `sourceHash` is the whole file as before.

### 2. `formalizes`: the outside requirement a record formalizes (Core §5)

```yaml
intentset:
  formalizes:
    - source: https://tracker.example/LAN-12   # a URL or a tool's item key
      anchor: criterion-3                      # optional: the part of the source that is meant
```

- **On a behavior, rule or scenario**: the claims, the same three types a verification verifies. Those are the
  records that state a requirement; a capability groups them and a slice delivers them. Another type is CORE001.
  Widening the list later invalidates nothing.
- A list of at least one entry; `source` and `anchor` are non-empty strings; an entry has no other key; two entries
  with the same source and anchor are a duplicate. All CORE001.
- **Never resolved.** It is not a relationship: no edge, no inverse, nothing derived, and a validator never fetches
  a source or judges whether it exists (design invariant 7). The reference is as true as whoever wrote it.
- **Outside the content hash.** This is the one place the decision departs from the proposal's lean, which was to hash
  it as links are hashed. The content hash covers what a guide explains (ADR 0018). A link changes that: a behavior
  governed by one rule fewer is a different promise. `formalizes` does not: it says where the promise came from, and
  a guide explaining the behavior is exactly as right after the reference is added, corrected or renumbered. If the
  requirement itself changes, the record's text has to change to follow it, and that moves the hash. Hashing it would
  bring back what ADR 0018 removed: a tool that backfills the reference onto existing records, or renumbers its
  criteria, would send every reviewed guide to review with nothing to read.

### 3. A verification's standing is left to tools, and Core says what it does not read

What depends on a verification record's own `status` was checked in the reference implementation:

| Where | What it reads |
|---|---|
| Evidence (Core §8) | Only `retired`: a retired verification is set aside. A draft's runs count as any other's. |
| CORE007 and coverage | The status of the claim. Evidence is required for a claim past draft; the verification's status is not consulted. |
| Core §5 attachment | A verification that verifies nothing is CORE009 as a draft and CORE003 past draft, as for every type. |
| `evidence stale`, `evidence import` | Only `retired`. |
| Publication | Nothing: a verification is never published. |
| `review`, `context`, `impact`, the Atlas | Nothing: the status is shown, not judged. |

So Core already attaches no approval meaning to a verification's status, and the conformance suite already holds it:
"E01 current pass at L3 verifies every claim the review links" passes with a draft verification of approved claims.
**Core §8 now says so**, and says that a tool MAY treat a verification's standing as that of the claims it verifies
and need not ask for an approval of the verification itself. Nothing else was implemented: no core rule, no profile
option and no derived field. A verification may carry `approval` like any record, and nothing asks it to.

### Versions

No existing conformance case changes its `valid` or `diagnostics`, so `intentset.spec` stays `0.2`: unknown keys under
`intentset` were errors, so two new known keys relax nothing that conformed. An artifact's members in the export are
closed, so the export moves to `intentset/export/0.6`, which adds `approval` (the block, or null) and `formalizes`
(the entries, or an empty list) to every artifact and nothing else. `intentset context`, with `--json` and without,
and the MCP server's context tools carry both, and the Atlas shows both on a record's page.

## Options rejected

- **More statuses** (`approved-derived`, `attested`). Status is one ordered axis that publication, ownership and
  evidence read; a basis is not a step on it, and every reader of status would have had to learn the new values.
- **The basis in `extensions`.** A namespaced extension is preserved and never interpreted, so no two tools would
  write the same shape, and the content hash would count it.
- **Reuse `reviewedBy` and `reviewedAt`.** They are a knowledge review, and publication requires them of knowledge. A
  behavior approved on a derived basis would look like a reviewed record to anything that reads them.
- **`by` on every basis.** See above: an attested approval would name an agent where the other two name a person.
- **Require `approval` on an approved record, or check it against `status`.** That is workflow policy, and every
  repository approved before this decision would fail.
- **New diagnostic codes for the two fields.** Shape problems in frontmatter are CORE001 everywhere else, and the
  `field` pointer already says which field.
- **Resolve `ref` and `formalizes`, even optionally.** Validation uses no network, and a tracker's answer depends on
  who asks and when, so the same inputs would stop giving the same bytes.
- **`formalizes` as a link kind.** Links name records in the same snapshot and derive inverses; an outside reference
  can do neither.
- **`formalizes` inside the content hash.** See above.
- **A core rule that a verification takes the status of what it verifies**, or a derived "effective standing" in the
  export and the context. A verification may verify several claims whose statuses differ, so a single standing needs
  a rule for choosing among them (the least advanced, the most, the behavior's), and that rule is a workflow's. The
  export and the context already carry each verification's `verifies` and every claim's status, so a tool computes the
  standing its workflow means.
- **A profile or configuration option for the same.** Nothing in Core would read it: no check depends on a
  verification's approval, so the option would configure nothing.

## Consequences

- A tool that approves by derivation writes `approval` with `basis: derived` and the source's revision or digest, and
  a reader of the model, the export or the context can tell the three bases apart. A null or absent `approval` is "not
  stated", never "not approved".
- A reader of an earlier release rejects a record that carries either field as an unknown key, so a repository moves
  its tools before it writes them. A reader of the export moves its pin to 0.6.
- Writing `approval` or `formalizes` changes the file, so the record's `sourceHash` moves as it does for any edit:
  the graph hash moves, a whole-file review pin needs review, and under subject binding a run record of a verification
  whose subject includes the record reads stale until it is run or imported again, exactly as approving the record
  already does. Only the content hash is unmoved.
- `list` has no selector field for either yet. A selector field is closed (ADR 0016), so one is added when a consumer
  needs it, without changing the list result.
- Intentset still says nothing about who may approve. A basis is a statement the repository makes, and trusting it is
  the reader's decision.
