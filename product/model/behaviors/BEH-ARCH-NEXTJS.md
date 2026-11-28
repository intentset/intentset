---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/behavior/0.4
  id: BEH-ARCH-NEXTJS
  type: behavior
  title: The Next.js rule set keeps server-only code and outside packages out of the browser, routes and middleware
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

# The Next.js rule set keeps server-only code and outside packages out of the browser, routes and middleware

## Behavior

`intentset architecture check` runs the `nextjs` rule set where the repository's profile names it, as the shipped profile `intentset/typescript-nextjs/1` does. It reads each file's directives, the string statements the file opens with, and judges four things. Client code, a file that opens with "use client" or that client code imports by a value import, imports no server-only file, one that imports the `server-only` package or matches a `serverOnly` pattern (NEXT001); a file that opens with "use server" holds server actions, which client code may import. A route file under the application router, which is composition, imports no package the profile lists in `outsidePackages` (NEXT002). Client code imports no such package, where VSA015 has not already reported the import (NEXT003). A middleware file imports no such package (NEXT004).

## Preconditions

A profile that names the `nextjs` rule set. NEXT002 to NEXT004 judge nothing until the profile or `.intentset/architecture.yaml` lists a package in `outsidePackages`.

## Outcomes

Success: each import a rule refuses is an error naming the file, what it imports and what to do. A file that says nothing, matches no pattern and is imported by no client code is not judged, and the summary says for how many files the boundary was not judged and names some, never that they passed. Failure: a `serverOnly` or `middlewareFiles` value that is not a list of path patterns is CFG001.

## Sources

- `spec/profile-typescript-nextjs-0.4.md`, `spec/profile-contract.md` §5 and ADR 0030.
