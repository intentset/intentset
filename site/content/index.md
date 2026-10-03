---
markset: 0
---

::::::columns{.hero ratio="5:4"}
{.eyebrow}
Product truth as code · v0.1 draft

# Keep product intent connected to what you ship.

{.lead}
Intentset connects what a product is meant to do with the slices that implement it, the checks that verify it, and the knowledge you share with customers.

Start with readable files in your repository. Build a product model that people and agents can follow.

[[Read the draft specification](specifications/index.html)]{.button .primary} [[Explore an example](#example)]{.button}

> [!NOTE]
> The specifications are ready for review. The reference toolchain is being designed.

::col

:::::card{.model}
{.eyebrow}
Readable files → connected model

:::steps
1. [Intent]{.badge} Prepare learning in advance
2. [Observable behavior]{.badge .info} Schedule an assessment
3. [Rule]{.badge} Future release time
4. [Slice]{.badge} Assessment scheduling
5. [Verification]{.badge} Named checks + evidence
6. [Knowledge]{.badge} Reviewed guidance
:::

{.small .muted}
Illustrative connections · not a live coverage report
:::::
::::::

***

{.eyebrow}
The problem

{#how}
## Faster code needs a clearer product model.

{.lead}
A ticket explains why a change started. A test checks a result. A document describes a promise. Keeping them connected as the product changes is the hard part.

Intentset gives those connections a durable place in the repository—centered on observable product behavior.

***

{.eyebrow}
A worked model

{#example}
## One behavior. A connected view.

:::::card[Example: Schedule an assessment]{.example}
::::columns{ratio="2:3"}
A teacher chooses when a published assessment becomes available to a class.

[[Read the worked example](example/index.html)]{.button}

::col

- **Intent:** Help teachers prepare learning in advance.
- **Behavior:** Schedule an assessment for a future time.
- **Rule:** The assessment must be published and the teacher must be allowed to assign it.
- **Implementation:** One accountable slice, with explicit contracts and backend ownership.
- **Verification:** Named checks, with evidence tied to a particular snapshot.
- **Knowledge:** Reviewed guidance for the right audience and release.
::::

> [!NOTE]
> Illustrative model. These links describe the proposed structure, not a live verification report.
:::::

***

## Start broad. Inspect the details when you need them.

::::grid{cols=3}
- :::card[For product teams]
  Review capabilities and behaviors without reading every implementation detail. See where a promise is still unclear, unimplemented, or missing evidence.
  :::
- :::card[For engineers]
  Find the slice that owns a behavior, the contracts it exposes, and the rules a change must preserve.
  :::
- :::card[For people building with agents]
  Give an agent a bounded set of product context before it edits code. Review the resulting behavior, implementation, tests, and knowledge together.
  :::
::::

***

{.eyebrow}
Repository first

## Open files. Explicit meaning.

::::columns
Write in Markdown with YAML frontmatter. Give behaviors stable IDs. Link the rules, slices, checks, and explanations that belong together.

The repository stays authoritative. Graphs and review pages are views of those files.

[Explore the Core specification](specifications/core/index.html)

::col

```markdown
---
markset: 0
intentset:
  spec: "0.1"
  profile: intentset/behavior/0.1
  id: BEH-ASMT-SCHEDULE
  type: behavior
  title: Schedule an assessment
  # Further required metadata omitted
---

# Schedule an assessment

A promise people can read.
A connection tools can follow.
```
::::

***

{.eyebrow}
The document layer

## Rich documents, with Markset.

{.lead}
Intentset defines what the product model means. Markset provides the document layer for reading and sharing it.

Intentset profiles add metadata and document conventions without adding product-specific rendering syntax. The planned publisher turns reviewed product knowledge into portable Markset documents for people, support teams, and customer-facing answers.

[See how Markset fits](markset/index.html)

***

## Adopt one useful connection at a time.

:::steps{.adopt}
1. **Describe a behavior.** Choose one promise your product makes.
2. **Name its owner.** Connect it to the slice that delivers it.
3. **Attach verification.** Identify what is checked and which evidence is current.
4. **Publish with context.** Review the explanation for its audience and release.
:::

{.muted}
Keep your existing workflow. Expand the model as its value becomes clear.

***

:::card{.status}
{.eyebrow}
Project status

## Specifications first. A reference toolchain next.

The v0.1 package defines the product model, traceable vertical slices, and a TypeScript + AWS Amplify Gen 2 reference profile.

Validation, change-impact reports, a Product Atlas, and agent context are on the implementation roadmap. They are not yet presented as finished tools.

[Read the specifications](specifications/index.html) · [View the roadmap](roadmap/index.html)
:::

***

:::card{.closing}
## Help make product intent easier to maintain.

{.lead}
Review the draft. Walk through the example. Try the model against one real capability and bring back what does not fit.

[[Read the draft specification](specifications/index.html)]{.button .primary} [[Start with one behavior](start/index.html)]{.button}
:::
