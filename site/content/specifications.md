---
markset: true
---

# The specifications

{.lead}
Eight documents define what Intentset records and checks. Start with Core. Add the others when you want what each one gives you.

## The model, and the code around it

:::card
### {{spec.core.title}}

**Start here.** Core defines the records: what your repository says about the product, from why it is changing down to each behavior and rule, and how those records link to the tests that check them and the help that explains them. It stands on its own: you can adopt it without the other seven.

[[Read Core](core/)]{.button}
:::

:::card
### {{spec.vsa.title}}

**Know which promises a change can affect.** Core says what the product promises; this says which code keeps each promise. Each behavior has one owning slice of the code, and a slice exposes a declared public surface and depends only on what it declares. That is what lets Intentset connect code to records:

- **The drift check works through slices.** A slice names the files it owns, so when one changes, the review knows which records describe it and fails if none of them changed.
- **An agent gets the right context.** `intentset context <file>` hands an agent the slice that owns a file, with its behaviors and rules, before it edits.
- **Changes stay where they belong.** The architecture check fails an import that reaches into another slice's private code, so one slice's code cannot quietly come to depend on another's internals.

[[Read Traceable VSA](vsa/)]{.button}
:::

:::card
### {{spec.profile-contract.title}}

**Turn the architecture rules into checks for your stack.** Traceable VSA is written for any language, so its rules about imports and layers need a profile before a tool can check them in your code. A profile is a file your team writes: your layers by your own names, which may import which, and where things live. It holds no code, so the check runs nothing of yours or anyone else's.

[[Read the profile contract](profile-contract/)]{.button}
:::

:::card
### {{spec.profile-typescript-amplify-gen2.title}}

**The profile Intentset uses when you write none.** It is for TypeScript and AWS Amplify Gen 2: where slices live, how imports resolve, the layer matrix, and the stack's own ways of breaking a boundary, such as type-only and dynamic imports, path aliases, or interface code inside business logic. `intentset architecture check` reads TypeScript today; another language needs a release that reads it.

[[Read the reference profile](profile-typescript-amplify-gen2/)]{.button}
:::

:::card
### {{spec.profile-typescript-nextjs.title}}

**For a Next.js application.** Four rules on top of the portable ones: code marked for the browser never imports server-only code, route files and middleware wire slices and reach no database themselves, and the packages you list as reaching outside are imported only on the server.

[[Read the Next.js profile](profile-typescript-nextjs/)]{.button}
:::

## Getting the records to people and other tools

:::card
### {{spec.publication.title}}

**Help that cannot go out of date unnoticed.** How reviewed explanations become customer documentation and in-app tips for one reader, in every audience and role they hold, and one release. Publication leaves out anything that reader may not see, and holds back any explanation whose sources changed since a person reviewed it, so a help article is not published again after a rule it explains has changed until someone has checked it.

[[Read the publication profile](publication/)]{.button}
:::

:::card
### {{spec.export.title}}

**Let other tools use your model.** One JSON file, written by `intentset graph` in CI, that a dashboard, a planning tool or a usage tool can read without parsing your repository. Restricted records are left out and counted, and the contract says what a reader must check before trusting the file.

[[Read the export contract](export/)]{.button}
:::

:::card
### {{spec.list.title}}

**Ask your records a question.** How `intentset list` answers which records match, such as every draft behavior that describes code already built. It gives the same answer from the repository or from its export, and says a result is undetermined, rather than guessing, when a record it depends on is withheld.

[[Read the list contract](list/)]{.button}
:::

## What conformance means

A conformance report names its scope, snapshot, specification version, checks and exceptions. Linked evidence is not the same as passing evidence, and passing tests do not prove every documented promise correct.

The cases every check is held to are published as data, for implementations that are not this one. [See the conformance suite](../conformance/).
