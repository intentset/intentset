---
markset: true
---

# Set up Intentset

{.lead}
From a repository that has never seen Intentset to its first passing check in about five minutes: install the tool, have your agent write down one feature from the code it already has, and connect the tests that check it. Then [add it to your CI](ci/), so every change keeps the records true. Nothing here needs an account.

The timings are from a fresh TypeScript repository with one feature and three tests. The same steps are in the [README](https://github.com/intentset/intentset#try-it-in-five-minutes).

> [!NOTE] Before you start
> - Node 22.18 or later.
> - A git repository with JavaScript or TypeScript code and its tests.
> - A coding agent that can run commands in the repository.
> - Test reports from Vitest, Playwright or node:test (its TAP reporter) for step 5. Jest reports do not import.
> - TypeScript 7 for the checks that read your code, from step 4's second command on. npm installs it for you. If your repository gives the tool an older one, as pnpm can, the command says what to run instead.
> - Step 5's `<PRD-ID>` is the ID of the product record the agent writes in step 3. `npx intentset list --type product` prints it.
> - A word you don't know is in [the glossary](../glossary/).

## 1. Install it (one minute)

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

`init` writes three files: `.intentset/config.yaml`, the scope the model covers (`product/**/*.md`); `.intentset/registries.yaml`, the names records may use, empty; and `.intentset/agents.md`, [the guide](../guide/) your agents follow. Point them at it with one line: `@.intentset/agents.md` in CLAUDE.md, or `Before changing code, read .intentset/agents.md and follow it.` in AGENTS.md.

## 2. Name what records may refer to (one minute)

Every record names an owner and its audiences, and a behavior says which releases, roles and editions it applies to, so each of those lists needs at least one entry before the first record validates. Replace the empty lists in `.intentset/registries.yaml` with your own names; one of each is enough to start:

```yaml
owners:
- team-shop          # who owns records: a team or a person
audiences:
- engineering
- product
releases:
- v1                 # a release label a behavior is available in
roles:
- shopper            # a role your product's users have; a product with none still names one
editions:
- standard           # an edition your product ships in; likewise
flags: []
evidenceSources: []  # where a measure's reading comes from; later
resources: []        # resources slices share, such as a data layer; later
```

## 3. Have an agent write one capability down (two minutes)

Choose a capability your product already has, small enough to review in one sitting, and ask your agent to write it down:

```text
Read .intentset/agents.md. Model the <capability> capability from its code, tests and
decision records, as draft records under product/: the product, the intent and the
outcome the capability serves, the capability, its behaviors with their rules and
scenarios, the slice that owns the code, and an automated verification record for each
test that checks it, with the test file as its locator and the test's title as its
selector. Use only the names .intentset/registries.yaml holds. Leave every record a
draft. Run intentset validate and fix what it reports until it reports no error.
```

What comes back is eight or so files under `product/`, one record each. The first capability brings three records above it, because a capability sits under an outcome, an outcome under an intent, and an intent under the product; from the second capability on, the agent adds only what is new.

The record that binds a test is the verification. Its frontmatter names the test file and a selector, and the import in step 5 matches every test whose title holds the selector as whole words, so a `describe`'s name binds all of its tests:

```yaml
  verification:
    method: automated
    locator: src/cart.test.ts
    selector: cart total
```

## 4. Check it (under a minute)

```sh
npx intentset validate
npx intentset validate --level L2
```

The first is the model: every record well-formed, every link resolved, every name in a registry. The second adds the architecture: the files each slice claims, and the imports between slices. Each error says what to add and the field it belongs in, so an agent fixes them in one pass. One warning stays until you write a measure for the outcome (CORE009, which lists the fields a measure needs); it is a warning because the outcome is a draft.

## 5. Bind the tests (one minute)

Run your tests with a JSON report, import the report as run records bound to this commit, and ask for the model with its evidence:

```sh
npx vitest run --reporter=json --outputFile=reports/vitest.json
npx intentset evidence import --from vitest reports/vitest.json \
  --out .intentset/evidence/local.json --product <PRD-ID> --release v1
npx intentset validate --level L3
```

The import says which verification each test matched (`TEST-CART-TOTAL  pass  3 tests matched cart total: 3 pass`), and the report at L3 says `verified: 1 of 1 behavior, 1 of 1 rule`. That is the first passing check: a promise, the code that owns it, and a test that passed on this commit. Playwright and node-tap reports import the same way (`--from playwright`, `--from node-tap`). Add `reports/` and `.intentset/evidence/` to `.gitignore`: a run record describes one run and is never committed.

## 6. Review what it wrote

Read the behaviors as a product reviewer would. Is each one a promise you recognize, including how it fails? Is anything missing? Then look at what the model shows: rules with no test, behaviors checked only by hand, code no slice owns. Those gaps were already there; now they are listed. Approve the records you agree with; an agent never does.

## 7. Add it to your CI

Run the same checks on every pull request, so a change cannot merge while its code and its records disagree. [Add Intentset to your CI](ci/) has the whole job, how to make it required, and what to do about code that already breaks the boundaries. From then on, the agent that changes the code updates the records in the same commit, or says in the commit that no behavior changed.

## Approve and look around

- **Approve what you have read.** `npx intentset approve <ID>... --by <name>` writes each draft's approval, with that name and the date. It refuses a tree with uncommitted changes and commits nothing, so the approval is a diff for the pull request's reviewer. An agent never runs it on its own account.
- **Look at the model.** `npx intentset serve` shows the records as the Atlas, the review pages, at http://127.0.0.1:3000/, rebuilt when a file changes.
- **See what needs a run.** `npx intentset evidence stale` lists the automated checks with no current pass.

## Starting a new product?

Write the model first. Whoever decides what the product does drafts the behaviors with an agent, and a slice for the code that will deliver them, before any of it exists, each with `delivery: planned`. While the slice is a draft, the paths it plans are warnings, so the model passes from the first commit. The agent then builds against what was approved, and the change that builds a record's work marks it `delivery: built`.

[[Add Intentset to your CI](ci/)]{.button .primary} [[Every command and option](../tools/cli/)]{.button}
