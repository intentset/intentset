---
markset: 0
---

# A small set of specifications. A shared product model.

{.lead}
Intentset separates product meaning from implementation architecture and platform choices. Adopt the Core model on its own, or connect it to traceable vertical slices.

::::grid{cols=3}
- :::card
  ## Core Specification v0.1

  Identity, artifact types, relationships, lifecycle, evidence, Markset profiles, and audience-safe knowledge publication.

  [[Read Core](core/index.html)]{.button}
  :::
- :::card
  ## Traceable Vertical Slice Architecture v0.1

  Behavior ownership, public contracts, dependencies, implementation claims, and verification boundaries.

  [[Read Traceable VSA](vsa/index.html)]{.button}
  :::
- :::card
  ## TypeScript + AWS Amplify Gen 2 Reference Profile v0.1

  A concrete mapping for slice folders, import boundaries, backend seams, and logically owned cloud resources, with areas for a backend too large for one CloudFormation stack.

  [[Read the reference profile](profile-typescript-amplify-gen2/index.html)]{.button}
  :::
::::

## Publishing and export

::::grid{cols=2}
- :::card
  ### Publication Profile v0.1

  The fields that carry a published document's provenance, the review record that decides when an explanation needs review again, and the publisher's diagnostics.

  [[Read the publication profile](publication/index.html)]{.button}
  :::
- :::card
  ### Export Contract v0.2

  The JSON a repository hands to other tools: the graph, optional evidence, knowledge, impact and ownership reports, what is withheld, and what a consumer must check before importing it. Valid and deliberately invalid envelopes for testing a consumer ship with the conformance suite.

  [[Read the export contract](export/index.html)]{.button}
  :::
::::

## What conformance means

A conformance report names its scope, snapshot, specification version, checks, and exceptions. Linked evidence is not the same as passing evidence, and passing tests do not prove every documented promise correct.

> [!NOTE]
> All five documents are initial drafts. The TypeScript reference implementation implements them, and its conformance suite is published for other implementations. The reference toolchain is at 0.3 on npm.
