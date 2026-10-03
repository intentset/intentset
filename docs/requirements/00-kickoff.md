# Intentset kickoff scope and acceptance

## Outcome

Build the open framework and its public website from the supplied v0.1 drafts. Preserve the distinction between product semantics, implementation ownership, test definitions, run evidence, and published knowledge.

## Workstreams

| ID | Requirement | Acceptance |
|---|---|---|
| INT-001 | Implement safe Markdown/frontmatter parsing and typed graph validation | Valid examples parse; duplicate IDs, bad endpoint types, unsafe YAML, and cycles fail deterministically |
| INT-002 | Implement slice ownership and boundary checks | Unique accountable owners; no hidden deep imports; source claims resolve; exceptions are reported |
| INT-003 | Separate verification definitions from run evidence | Missing, stale, skipped, and failed evidence never becomes current pass |
| INT-004 | Own the Intentset Markset profiles and publication projection | Profile schema and graph validation remain Intentset concerns; unauthorized content is excluded before rendering |
| INT-005 | Export a versioned read-only graph/report contract for integrations | Stable artifact IDs, source snapshot, validation status, evidence status, and provenance are available without exposing raw restricted content |
| INT-006 | Build the public site from the supplied IA/copy/wireframes | Desktop/mobile navigation works; draft/tool maturity is accurate; no invented install links |
| INT-007 | Preserve independence from Streamlane | Core graph and CLI workflows work without a Streamlane account or service |

## First implementation increment

Follow M0–M1 of the roadmap: resolve license and upstream Markset compatibility, select a real pilot, implement parser/schema/graph checks, and expose deterministic JSON. The example is not a deployed application or a passing test suite.

## Cross-repo responsibilities

Intentset owns semantic profiles, graph relationships, publication authorization, availability filtering, and evidence freshness. Markset owns document parsing/rendering and any generic profile hook. Streamlane consumes versioned exports and connects work items to artifacts. Implement the shared integration contract before allowing either integration to claim compatibility.

## Website handoff

Use `site/06-intentset-information-architecture-and-copy.md` as editorial source and `wireframes/intentset.html` as responsive layout reference. Supporting HTML pages are review artifacts. Verify at 390px and desktop widths, keyboard navigation, link destinations, and absence of horizontal overflow before shipping. Confirm the real repository, license, domain, and package availability before replacing draft CTAs.

## Non-goals for the first increment

Hosted collaboration, bidirectional issue synchronization, automatic declaration of product truth, mandatory architecture refactoring, and an AWS deployment are not required for the first parser/graph milestone. Do not treat draft requirements as evidence of completed implementation.
