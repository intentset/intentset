---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-ARCH-PROFILE
  type: behavior
  title: A repository's own profile says its layers, their roles and which rule sets run
  status: draft
  delivery: built
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

# A repository's own profile says its layers, their roles and which rule sets run

## Behavior

`intentset architecture check` reads `.intentset/profile.yaml` when a repository has one. The file is data: an ID, the shipped profile it extends or a whole profile, the layers by the team's own names, which of them play the seam, pure and rendering roles, the layer matrix, the folders that stand for a layer, the package policy and the rule sets that run. The check resolves its configuration in one order, each later source replacing a key whole: the shipped profile, the profile file, `.intentset/architecture.yaml`, then what the caller hands in. A rule reads a role from the profile and never recognizes a layer by its name, and the Amplify checks run only where the profile names the `amplify` rule set. Intentset ships the plain TypeScript profile and the reference profile, which is the plain one with the Amplify rule set, written in the same format and read by the same reader.

## Preconditions

A repository checked at L2 or above. With no profile file, the reference profile applies and the check is what it was.

## Outcomes

Success: the tree is checked against the repository's profile. Failure: a profile file that is wrong in any way is CFG001 for each thing wrong, and is never applied in part: the reference profile checks the tree and the errors fail the check. A profile whose language the release does not read is such an error, naming the languages it reads, and no pass is reported. The check loads and runs no code a profile names.

## Sources

- `spec/profile-contract.md` and ADR 0030.
