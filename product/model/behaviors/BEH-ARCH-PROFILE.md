---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/behavior/0.4
  id: BEH-ARCH-PROFILE
  type: behavior
  title: A repository's own profile says its layers, their roles and which rule sets run
  status: draft
  delivery: built
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 3
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

# A repository's own profile says its layers, their roles and which rule sets run

## Behavior

`intentset architecture check` reads `.intentset/profile.yaml` when a repository has one. The file is data: an ID, the shipped profile it extends or a whole profile, the layers by the team's own names, which of them play the seam, pure and rendering roles, the layer matrix, the folders that stand for a layer, the package policy, the packages that reach outside, the layout and the rule sets that run. It holds what is true of a stack: a key that is a fact about one repository (`scope`, `areas`, `routerFiles`, `responseParserModules`, `schemaBridge`, `sharedBackend`, `conditions`) stays in `.intentset/architecture.yaml`. The check resolves its configuration in one order, each later source replacing a key whole: the shipped profile, the profile file, `.intentset/architecture.yaml`, then what the caller hands in. A rule reads a role from the profile and never recognizes a layer by its name, and the Amplify checks run only where the profile names the `amplify` rule set. Intentset ships the plain TypeScript profile and the reference profile, which is the plain one with the Amplify rule set, written in the same format and read by the same reader.

## Preconditions

A repository checked at L2 or above. With no profile file, the reference profile applies and the check is what it was.

## Outcomes

Success: the tree is checked against the repository's profile. Failure: a profile file that is wrong in any way is CFG001 for each thing wrong, and stops the check: the file is never applied in part, no other profile stands in for it, and the result holds the profile's errors and nothing else. A repository-specific key in the file is such an error, and so is a language the release does not read, which names the languages it reads; a caller that hands such a language in is refused with the same error, and the check stops the same way. The check loads and runs no code a profile names.

## Sources

- `spec/profile-contract.md` and ADR 0030.
