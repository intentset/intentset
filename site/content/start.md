---
markset: 0
---

# Start with one capability.

{.lead}
You do not need to reorganize your repository or write records by hand. Set up the toolchain, have an agent model one capability from what the repository already holds, and review what it wrote.

## 1. Set it up

:::tabs
### npm
```sh
npm install --save-dev @intentset/cli
npx intentset init
```

### pnpm
```sh
pnpm add --save-dev @intentset/cli
pnpm exec intentset init
```
:::

`init` writes a configuration, empty registries, and `.intentset/agents.md`, [the guide](../guide/index.html) your agents follow. Point them at it with one line: `@.intentset/agents.md` in CLAUDE.md, or `Before changing code, read .intentset/agents.md and follow it.` in AGENTS.md. Then name your teams, audiences, releases and evidence sources in `.intentset/registries.yaml`. On a TypeScript earlier than 7, use the form in the note at the end of this page rather than installing.

## 2. Have an agent model one capability

Choose a capability your product already has, small enough to review in one sitting, and ask your agent to write it down:

```text
Read .intentset/agents.md. Model the <capability> capability from its code, tests and
decision records: its behaviors, their rules and scenarios, the slice that owns the code,
and a verification record for each test that checks it. Leave every record a draft.
Run intentset validate and fix what it reports.
```

## 3. Review what it wrote

Read the behaviors as a product reviewer would. Is each one a promise you recognize, including how it fails? Is anything missing? Then look at what the model shows: rules with no test, behaviors checked only by hand, code no slice owns. Those gaps were already there; now they are listed. Approve the records you agree with.

## 4. Keep it current

Add two checks to CI, so every change keeps the model true:

:::tabs
### npm
```sh
npx intentset validate --level L2
npx intentset review --base origin/main --fail-on-drift
```

### pnpm
```sh
pnpm exec intentset validate --level L2
pnpm exec intentset review --base origin/main --fail-on-drift
```
:::

From then on, the agent that changes the code updates the records in the same commit, or says in the commit that no behavior changed. Add capabilities one at a time, as the value becomes clear.

## Starting a new product?

Write the model first. A product manager and an agent draft the behaviors, and a slice for the code that will deliver them, before any of it exists. While the slice is a draft, the paths it plans are warnings, so the model passes from the first commit. The agent then builds against what was approved.

[[Read about the first pilot](../pilot/index.html)]{.button .primary} [[Open the worked example](../example/index.html)]{.button}

> [!NOTE]
> The reference toolchain is an early release, at {{version}}. The architecture check needs TypeScript 7; in a repository on an earlier TypeScript, run the toolchain without installing it, as `npx -p @intentset/cli -p typescript@7 intentset`, or with pnpm as `pnpm dlx --package=@intentset/cli --package=typescript@7 intentset`.
