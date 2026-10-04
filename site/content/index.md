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

[[See how it works](how-it-works/index.html)]{.button .primary} [[Read the draft specification](specifications/index.html)]{.button}

> [!NOTE]
> The specifications are ready for review. The reference toolchain, version 0.3, is published to try them against.

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

## Faster code needs a clearer product model.

{.lead}
A ticket explains why a change started. A test checks a result. A document describes a promise. Keeping them connected as the product changes is the hard part.

Intentset gives those connections a durable place in the repository—centered on observable product behavior.

***

{.eyebrow}
What you get

## Six questions your repository can answer.

::::grid{cols=3}
- :::card[What does the product promise?]
  Every observable behavior is written down once, with its rules, examples and failure cases, in words a product reviewer can check without reading code.
  :::
- :::card[Who owns it in the code?]
  Each behavior has one accountable slice, and an architecture check keeps other code out of that slice's internals.
  :::
- :::card[Is it verified right now?]
  A pass counts only on the commit under review. Linked checks and current passes are reported apart, so coverage never looks better than it is.
  :::
- :::card[What does this change touch?]
  Before a change merges, see the behaviors, owners, checks and customer explanations it could reach, and the path to each.
  :::
- :::card[What should an agent read first?]
  Hand an agent the bounded context around the code it is about to change: the promises, rules, contracts and decisions, and nothing beyond them.
  :::
- :::card[What may we tell customers?]
  Publish reviewed explanations for one audience and one release. Drafts, internal notes and unreleased work stay out by default.
  :::
::::

[See how it works](how-it-works/index.html), step by step, from the first file to a published explanation.

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

## Specifications in review. A toolchain to try them with.

The v0.1 specifications define the product model, traceable vertical slices, a TypeScript + AWS Amplify Gen 2 reference profile and reviewed publication. An export contract fixes what other tools read from a model.

The reference toolchain is at 0.3 on npm. 0.1 brought validation, architecture checks, change-impact reports, a Product Atlas, reviewed publication and agent context. 0.2 added the export other tools import, and 0.3 added areas, for Amplify backends too large for one CloudFormation stack. They are early releases, to try against one real capability.

[Read the specifications](specifications/index.html) · [View the roadmap](roadmap/index.html)
:::

***

:::card{.closing}
## Help make product intent easier to maintain.

{.lead}
Review the draft. Walk through the example. Try the model against one real capability and bring back what does not fit.

[[Read the draft specification](specifications/index.html)]{.button .primary} [[Start with one behavior](start/index.html)]{.button}
:::
