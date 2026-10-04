# ADR 0011: Tips live on knowledge records, and a publication writes a help file for the product

**Status:** accepted, 2026-10-04

## Context

A product's own interface is where most people meet its documentation: a tooltip on a control, a line under a field,
a "what can I do here" panel. Those words go stale faster than any other documentation, because they are typed into
the interface and nothing ties them to the behavior they describe. Intentset already had everything that would keep
them true except a place to put them: knowledge records written for an audience, availability by product, release,
role, edition and flag, review pins that mark a record `needs-review` when a source changes, and a publisher that
denies by default. Driftline, which will watch adoption, wants to show help to a person at the behavior they have
not reached, and needs the same binding between a control and a behavior that help needs.

Two places could hold the sentence. The behavior record is the wrong one: Streamlane's behaviors are `internal`,
written for engineering and product, and read like it ("the writer has kept its blocked fields"), and Core §9 says
published text is curated for its audience, never copied engineering prose. A per-behavior knowledge record is the
right visibility but the wrong grain: the pilot explains four behaviors in one record whose Guidance is three
paragraphs, which is a panel, not a hover.

## Decision

- **`tips` on knowledge** (Core §9): a mapping from an ID in `links.explains` to one sentence of plain text, at most
  160 characters on one line. It is reviewed, projected and published with the record, so what gates a tip is what
  gates its document. A key the record does not explain is CORE003; a malformed tip, or `tips` on any other type, is
  CORE001. Optional, because a display behavior with eight surfaces does not want a tooltip explaining the badge.
- **`help.json`** (publication §5): beside the published documents, every tip of every document the run published,
  keyed by explained ID, with the index of published documents and the projection it was made for. Written whenever
  the request is accepted, so a runtime can rely on it. The key is the explained artifact's ID whatever that
  artifact's visibility: a product that binds a control to the ID has already written it where the same reader can
  see it, and the file carries nothing else of the artifact, never its title, path, status or prose. Two documents
  tipping one ID: the lower knowledge ID wins, deterministically rather than diagnosed.
- **`@intentset/help`**, a tenth package with no dependencies that runs in a browser: `readHelp` refuses a file with
  any problem whole, `tipFor` and `helpForPage` answer for one control or one page, and `bindTips` puts each tip on
  every element carrying `data-behavior="BEH-..."` and reports the IDs that have no tip, which is the coverage a
  product has yet to write. The binder takes any root with `querySelectorAll`, so it is tested without a DOM.
- **Not in the export.** Adding `tips` to exported artifacts would make every 0.2 envelope invalid under a closed
  0.2 schema, which is a 0.3 change (ADR 0008). A consumer that wants coverage reads `help.json` for now.

## Consequences

- The agent guide (`.intentset/agents.md`) shows the field, so the agents that write knowledge write tips. The
  pilot's four behaviors in Streamlane get theirs in the same change.
- A product serves each person the `help.json` published for their entitlement, as it would serve them the documents.
  Nothing in the runtime decides who may see what; that was decided at publication.
- Timing is not here. When a person sees a tip, beyond hover, is Driftline's: it knows who is stalled at which rung.
  The same `data-behavior` attribute is the usage event it meters, so instrumenting for help instruments for adoption.
- The conformance schema gains `published.mustContain`, since a help case has to say what the output holds, not only
  what it must not.
