---
markset: 0
---

# A small set of specifications, one shared product model

{.lead}
Intentset separates product meaning from implementation architecture and platform choices. Adopt the Core model on its own, or connect it to traceable vertical slices.

::::grid{cols=3}
- :::card
  ## {{spec.core.title}}

  {{spec.core.meta}}

  The product model: what a repository records about a product, from its purpose and outcomes down to each behavior and rule, how those records link to verification, evidence and the explanations readers are given, and how each moves from draft to released.

  [[Read Core](core/)]{.button}
  :::
- :::card
  ## {{spec.vsa.title}}

  {{spec.vsa.meta}}

  How code is organized around what the product does: each behavior has one owning slice of the codebase, a slice exposes a declared public surface and depends only on what it declares, and verification shows it delivers what it claims.

  [[Read Traceable VSA](vsa/)]{.button}
  :::
- :::card
  ## {{spec.profile-typescript-amplify-gen2.title}}

  {{spec.profile-typescript-amplify-gen2.meta}}

  Traceable VSA in a TypeScript and AWS Amplify Gen 2 repository: where slices live, which imports `intentset architecture check` refuses, how a slice owns its backend resources, and areas for a backend too large for one CloudFormation stack.

  [[Read the reference profile](profile-typescript-amplify-gen2/)]{.button}
  :::
::::

## Publishing and export

::::grid{cols=2}
- :::card
  ### {{spec.publication.title}}

  {{spec.publication.meta}}

  How reviewed explanations become documentation and in-app help for one audience and release: what a request must name, what it may include and what stays withheld, the provenance each document keeps, and when an explanation needs review again.

  [[Read the publication profile](publication/)]{.button}
  :::
- :::card
  ### {{spec.export.title}}

  {{spec.export.meta}}

  The JSON a repository hands to other tools: the graph with its outcomes and measures, optional evidence, knowledge, impact and ownership reports, what is withheld, and what a consumer must check before importing it. Valid and deliberately invalid envelopes for testing a consumer ship with the conformance suite.

  [[Read the export contract](export/)]{.button}
  :::
::::

## What conformance means

A conformance report names its scope, snapshot, specification version, checks, and exceptions. Linked evidence is not the same as passing evidence, and passing tests do not prove every documented promise correct.

The cases every check is held to are published as data, for implementations that are not this one. [See the conformance suite](../conformance/).

> [!NOTE]
> All five documents are drafts, each with a dated revision. Core §1 says what a change to them means, and the changelog records every one. The TypeScript reference implementation implements them, and its conformance suite is published for other implementations. The reference toolchain is at {{version}} on npm.
