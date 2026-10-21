---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-ARCH-LAYER-PACKAGES
  type: behavior
  title: A layer imports only the packages its policy allows, and only presentation renders
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-ARCHITECTURE
  links:
    governedBy: [RULE-READ-ONLY-CHECKS, RULE-DETERMINISTIC]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# A layer imports only the packages its policy allows, and only presentation renders

## Behavior

`intentset architecture check` matches each package a slice file imports, by its specifier as written, against the patterns `forbiddenPackages` gives the file's layer, and reads each slice file for JSX (profile §3). By default the policy, model and external layers may not import the UI frameworks.

## Preconditions

A slice that declares its layers, or uses the reference layout's `client/`, `domain/policies/` and `domain/models/` folders; `forbiddenPackages` in `.intentset/architecture.yaml` to extend or replace the default.

## Outcomes

Success: a package the layer's policy does not name, and JSX in the presentation layer, composition, shared code or a test, pass. Failure: a forbidden package is TS007, naming the layer and the pattern it matched; JSX in the application, policy, model or external layer is TS008 at the first element; a `forbiddenPackages` that is not a mapping of layers to valid patterns is CFG001, and the default stays.

## Sources

- `spec/profile-typescript-amplify-gen2-0.2.md` §3.
