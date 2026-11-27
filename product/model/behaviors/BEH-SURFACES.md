---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-SURFACES
  type: behavior
  title: A slice says which knowledge leads each surface of the product, and validation checks it
  status: draft
  delivery: built
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-VALIDATE
  links:
    governedBy: [RULE-FAIL-CLOSED, RULE-DETERMINISTIC]
  formalizes:
    - source: https://github.com/intentset/intentset/issues/143
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# A slice says which knowledge leads each surface of the product, and validation checks it

## Behavior

Someone writes `surfaces` under a slice's `slice:` (VSA §3, ADR 0028): a map from a surface ID the product chooses, such as a route or an exposed module and its internal route, to `{ knowledge: [...] }`, the knowledge that leads that surface in the order a reader is shown it. Validation reads the map in code-unit key order and keeps each list in declared order. It checks every surface ID against VSA §3's rules (1 to 200 printable ASCII characters other than `"`, `'`, `<`, `>`, `\` and the backtick, never digits only, never `__proto__`), that an entry has `knowledge` and nothing else, and that the list is non-empty, unique and of IDs; that a slice declaring a surface declares `availability`; that each ID names knowledge; that a slice that is not retired names no retired knowledge; and that no surface ID is declared by two slices that are not retired. The YAML reader refuses a `__proto__` key in any mapping. The export carries each slice's `surfaces`, `{}` when it declares none, less withheld knowledge, and `readExport` requires it. `surfaces` is not a binding field: it moves no subject.

## Preconditions

A slice record, read by `intentset validate` or the core API.

## Outcomes

Success: the surfaces are read, carried in the export, and moved no subject hash. Failure: a malformed `surfaces`, a surface ID that breaks the rules, an entry with another member, an empty, repeated or non-ID list, or a surface without `availability` is CORE001; an ID that does not resolve or is not knowledge is CORE003; retired knowledge on a slice that is not retired is CORE005, naming the successor `replacedBy` gives; a surface ID two slices declare is CORE013 on each; a `__proto__` key is CORE010, where it was dropped silently before.
