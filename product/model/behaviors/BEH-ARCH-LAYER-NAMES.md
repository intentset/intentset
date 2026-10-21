---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-ARCH-LAYER-NAMES
  type: behavior
  title: A name is judged by the layer of the file that defines it
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-ARCHITECTURE
  links:
    governedBy: [RULE-READ-ONLY-CHECKS, RULE-DETERMINISTIC, RULE-UNRESOLVED-NOT-PASS]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# A name is judged by the layer of the file that defines it

## Behavior

`intentset architecture check` follows each name a layered file imports through every file that passes it on (an entrypoint, a barrel, another slice's entrypoint) to the file that declares it, and applies the layer matrix to that file's layer, in the importer's slice or in the slice that owns it (VSA §5, profile §3).

## Preconditions

A slice that declares its layers, and imports written with ES module syntax.

## Outcomes

Success: a name defined in a layer the importer may import passes, however it was reached. Failure: a name defined in a layer the importer may not import is VSA006, naming the name, the file that defines it, its layer and the files it passed through. A name that cannot be followed, through a CommonJS module or a cycle of re-exports, is listed as not checked, never passed.

## Sources

- `spec/vsa-0.2.md` §5 and `spec/profile-typescript-amplify-gen2-0.2.md` §3.
