---
markset: 0
---

# Where Intentset is going

{.lead}
Intentset is in draft. You can use it today on a real capability, and what people find doing that decides what version 1.0 keeps.

## Where it stands

The [specifications](../specifications/) are v0.2 drafts. The reference toolchain is at {{version}} on npm, with a conformance suite for other implementations. Everything [How it works](../how-it-works/) describes is in that release: validation, architecture checks, evidence, impact, the Atlas, reviewed publication with tips for the product's own interface, agent context, the export, and the guide and drift check that let agents keep the model.

The Core model does not depend on a language or platform. The architecture check reads TypeScript, and its one reference profile is TypeScript with AWS Amplify Gen 2.

Drafts can still change, and each change is recorded with its reason in the repository. The export carries its contract version, so a tool that reads it can refuse a version it does not support rather than misread it.

## Toward 1.0

1.0 is the version you can build on without expecting breaking changes. Real codebases decide what it keeps:

- **Streamlane**, a work management product, where the model is a required check on every pull request, and [what it has caught](../pilot/) has already changed the specifications and the toolchain. Its model holds 1,282 records, and its unit tests' evidence is imported on every commit.
- **Driftline**, modelled before any of its code existed, so the model comes before the code. It reads Streamlane's export and its usage evidence back.
- **Intentset itself**, which models its own packages and is checked by the toolchain it builds. A maintainer approved that model on 2026-10-15, and every behavior in it has a current passing run.
- **Outside adopters**, on codebases we did not write. The first began adding Intentset to its own repository in October 2026, and its pilot is under way. What it has found so far changed the architecture check in {{version}}.

## Next

Nothing is announced beyond the current release. What comes next is decided by what adopters find, and is listed here when it is planned.

The latest release, {{version}}, makes the architecture check judge what an import takes rather than the file it names, so interface code cannot reach the backend through a slice's public surface. It keeps interface frameworks out of business rules, models and the code that calls the backend, and it holds a baseline of known violations to shrinking: an entry whose violation is gone fails, and a review lists every entry a change added. The release before added the Atlas's map of every record and its links, which [Lantern, the worked example](../example/atlas/map/), shows.

## Not planned

- **A hosted service.** Intentset needs no server and no database; the repository stays the source of truth.
- **Deciding the product is correct.** Intentset reports what is linked, owned and verified now. People judge whether a check is adequate.
- **Replacing your issue tracker.** Tickets describe changes; records describe the behavior that persists after them.
- **All or nothing.** The Core model stands on its own, and ownership, evidence and publication are added when they help.

## Shape it

The most useful feedback is a capability that is hard to model, a boundary that is hard to enforce, or an explanation that is hard to publish safely. Try the model against one capability and bring back what did not fit.

[[Start with one capability](../start/)]{.button .primary} [[Contribute on GitHub]({{repo}})]{.button}
