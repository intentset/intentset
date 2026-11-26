---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/verification/0.3
  id: TEST-MIGRATE
  type: verification
  title: Migrate rewrites what the move requires and refuses a dirty tree
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 6
  links:
    verifies: [BEH-MIGRATE]
  verification:
    method: automated
    locator: packages/cli/test/cli.test.ts
    selector: BEH-MIGRATE
---

# Migrate rewrites what the move requires and refuses a dirty tree

## Procedure

`pnpm test` runs these tests with node:test. Each makes a temporary git repository from the scheduling example, sets its records back to `0.2` or `0.1` (its knowledge's review under the extension), runs `migrate`, and reads what changed. The selector is the behavior's ID, which each test's title carries; `pnpm run model:evidence` reruns the tests and turns the result into run records.

- `packages/cli/test/cli.test.ts`: the tests "migrate --to 0.3 rewrites spec and profile from 0.2 (and from 0.1) in every record, moves the knowledge's review, and says how many"
- `packages/cli/test/cli.test.ts`: the tests "migrate --to 0.3 from 0.2 (and from 0.1) rewrites implemented and released to approved, with delivery built where the type carries it and states none", over a capability, a behavior and a slice that state no delivery, a rule that states one, an outcome, an intent and a decision, which never carry it, and a deprecated rule; "migrate counts a null or empty delivery as not stated and writes built on that line", over a behavior at `delivery: null`, a capability at an empty `delivery:` with a comment, above its status, and a slice at `delivery: ~`
- `packages/cli/test/cli.test.ts`: the test "migrate reads past a comment line inside the intentset mapping, at column 0 or indented", with a column-0 comment before `status`, another before `type`, an indented one before `status` and a column-0 one before `spec`
- `packages/cli/test/cli.test.ts`: the test "migrate reads a quoted or spaced key as YAML does, keeping a stated delivery and writing built after a quoted type", over a rule with a double-quoted `delivery` key, a capability with a space before the colon of `delivery`, and a behavior with a double-quoted `type` and a single-quoted, spaced `status`
- `packages/cli/test/cli.test.ts`: the test "migrate names a record whose status it could not rewrite, does not count it as moved, and exits 1", over a status written as a double-quoted escape; and "migrate names a record whose rewrite would lose the delivery its status claimed, and exits 1", over a released behavior whose type is a double-quoted escape
- `packages/cli/test/cli.test.ts`: the tests "migrate --to 0.3 from 0.2 (and from 0.1) moves a knowledge review to review, naming file-v1 where it named no hash, so a current review stays current", over a whole-file review with a comment inside it and another extension beside it, the sources left at `0.3` so their bytes hold; "migrate keeps a content-v1 review content-v1 and drops extensions left empty"; and "migrate names a record whose review it could not move, and exits 1", over the extension's key written as a double-quoted escape; "migrate leaves the review extension on a record that is not knowledge, names it, and exits 1", over a behavior carrying it; and the tests "migrate names a knowledge record whose review extension holds an extra key (a pin key that is not an ID, an empty pin, an empty snapshot) 0.3 rejects, and exits 1", and "migrate leaves a self and a gates (an empty self and a null gates, a gates with lines nested under it, a gates holding a list at its own indent) a 0.2 review extension held out of review and names them, so a review current before the move is current after it"
- `packages/cli/test/cli.test.ts`: the tests "migrate --to 0.3 from 0.2 (and from 0.1) re-pins each content-v1 pin that matched its source, so a review current before the move is current after it with no manual step", over the example with its knowledge pinned at the earlier version, which after the move equals the example byte for byte and is current at L4; "migrate re-pins a whole-file review as file-v1, each pin the hash of its source's file as moved"; "migrate leaves a pin that did not match before the move as written, so a stale review stays stale", over a rule changed after the review, which L4 then names; "migrate leaves a 0.2 review that named hash: file-v1, a kind its reader did not know, stale after the move", whose whole-file pins are left and which L4 names; "migrate leaves a knowledge record that declares neither version byte for byte, its matched pins included", over knowledge at `0.4` whose review pins the sources at `0.2`; "migrate re-pins a knowledge record already at 0.3 whose sources the same run moves"; "migrate names a matched pin it cannot reach, leaves it as written, re-pins the others, and exits 1", over a pin key written as an escape; "migrate names the review pins it could not compare when the knowledge (or a source it pins) does not read at 0.3, and a run after the key goes re-pins them", over a `__proto__` key in the knowledge and in a behavior it pins, each naming the pins, exiting 1, and then, discarded, fixed and migrated again, current at L4; and "migrate keeps current a review of the repository's own model, its records moved from 0.2 in the same run", over a copy of `product/model` at `0.2` with two articles added, one pinning content and one whole files, each current at L4 after the move while every model record returns to its bytes
- `packages/cli/test/cli.test.ts`: the test "a move from 0.2, which did not read a review's self, never re-pins one, matched or not", over `repinReviews` given a knowledge record at `0.2` and as moved (ADR 0027)
- `packages/cli/test/cli.test.ts`: the test "migrate refuses a tree with uncommitted changes, and a target it does not know, and writes nothing"

## Expected result

Every test whose title carries `BEH-MIGRATE` passes. A record whose status `0.3` still lists, and that holds no review, differs from before in exactly the `spec` and `profile` lines; a review moves to `review` with `file-v1` where it named no hash, is current after the move as before, and leaves `extensions` only where another key is in it; each pin that matched its source before the move holds the same kind of hash of the source as moved and one that did not is left as written, so a current review stays current and a stale one stale; one at `implemented` or `released` is `approved`, with `delivery: built` on the next line only where its type carries delivery and it stated none (a null or empty `delivery` line is rewritten in place, so one key remains), and validates with no CORE001 or CORE010; a comment line inside the mapping changes none of that; the count printed is the number of records moved, a quoted or spaced key is read as the bare one is, a record still declaring a removed status or left without the delivery its status claimed, a record other than knowledge carrying the review extension, which keeps it, and a review holding what `0.3` rejects are named and not counted, a second run moves none, and a refused run leaves every file as it was.
