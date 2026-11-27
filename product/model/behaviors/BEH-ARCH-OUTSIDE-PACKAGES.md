---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/behavior/0.4
  id: BEH-ARCH-OUTSIDE-PACKAGES
  type: behavior
  title: A package that reaches outside is imported only from the seam, and never from a pure layer
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

# A package that reaches outside is imported only from the seam, and never from a pure layer

## Behavior

`intentset architecture check` reads `outsidePackages`, the patterns of the packages a profile, or `.intentset/architecture.yaml`, lists as reaching a backend or an outside service, and judges each import of one from a slice's file by the roles the profile gives its layers (VSA §5). The rule runs under every profile and reads no layer's name.

## Preconditions

A profile that lists at least one such package and gives a layer the seam role or the pure role. Both shipped profiles list none, so a repository that says nothing is checked as before.

## Outcomes

Success: an import from the seam layer passes. Failure: an import from a pure layer, or from any slice file outside the seam, is VSA015, an error naming the file, the package and the slice. A role the profile gives no layer judges nothing: with no seam named, only the pure layers are judged.

## Sources

- `spec/vsa-0.4.md` §2 and §5, `spec/profile-contract.md` §2 and §3, and ADR 0030.
