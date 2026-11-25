# ADR 0024: A diagnostic code names one kind of thing to fix

**Status:** accepted, 2026-11-25 (issue #129). Proposed 2026-11-24. Part of the move to
`0.3`, with ADR 0023, ADR 0025 and ADR 0026.

## Context

Diagnostic codes are specified behavior (Core §11), and a consumer filters on them: a CI gate, the export's reader,
the Atlas. Two codes gathered conditions as fields were added, because a new shape check took the nearest existing
code:

- **CORE001**, "invalid carrier, schema, or required section", reports a file with no frontmatter, YAML that does not
  parse, a missing or unknown field, a missing required section, and every shape error in `delivery`, `approval`,
  `formalizes` and `tips`.
- **CORE003**, "unresolved, wrong-type or missing required relationship", reports a link to an ID that does not exist,
  a link to the wrong type, a repeated ID, an approved outcome with no measure, an approved rule nothing governs, and
  a `tips` key that is not in `links.explains`.

A consumer cannot tell "this file cannot be read" from "this tip is 161 characters" without parsing the message, and
messages are not specified. The suite states a case's diagnostics as codes alone, so it cannot tell them apart
either: 116 cases in `tests/core.json` expect CORE001 and 25 expect CORE003.

## Decision

**Split each of the two by what the author has to do, and leave the larger share of each under its existing code, so
the fewest cases change.**

| Code | Condition | Was |
|---|---|---|
| CORE001 | A field under `intentset` is missing, unknown or the wrong shape | CORE001, unchanged for these |
| CORE010 | The carrier cannot be read: no frontmatter, YAML that does not parse, a duplicate key | CORE001 |
| CORE011 | A section the record's type requires is missing | CORE001 |
| CORE003 | A link names an ID that does not resolve, the wrong type, itself, or the same ID twice | CORE003, unchanged for these |
| CORE012 | A record past draft lacks a relationship it must have | CORE003 |

- CORE012 is the error whose draft form is already its own code, the CORE009 warning: an approved outcome with no
  measure, a rule nothing governs, a scenario that illustrates nothing, a verification that verifies nothing,
  knowledge that explains nothing, a product slice that implements nothing.
- A `tips` key outside `links.explains` stays CORE003: it is a reference that does not resolve.
- New codes continue the numbering. No existing code is renumbered or reused.
- The `field` pointer every diagnostic already carries says which field, so shape errors need no finer code.

## Rejected

- **A code per field or per condition.** Dozens of codes, each with cases, for a distinction `field` already makes.
- **A `reason` member beside the code.** It changes the diagnostic's shape, and so the export, as much as new codes
  do, and consumers that filter on `code` gain nothing.
- **Leave the codes and specify the messages.** It makes prose a contract, in every implementation.
- **Renumber the CORE range in order.** Every case and every adopter's gate would change for tidiness.

## Consequences

- **Breaking**: an existing case's `diagnostics` changes, so this moves `intentset.spec` to `0.3` (Core §1).
- Cases that change code: the 14 parse rejections catalogued as C06 and the other unreadable-carrier cases go to
  CORE010; the missing-section cases go to CORE011; six relationship cases go to CORE012. The exact count of the first
  two groups is taken when the fixtures are rewritten, since the suite does not record which condition a CORE001 case
  is about. The remaining shape and link cases, the majority of both codes, do not change.
- Core §11's table, `test/codes.test.ts`, the conformance page generated from `tests/`, and the Conventions line that
  lists the code ranges change with it.
- An adopter's gate that names CORE001 or CORE003 to mean "any of these" must name the new codes too. The CHANGELOG
  entry says so in those words.
