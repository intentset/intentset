---
markset: 0
---

# Start with one capability

{.lead}
From a repository that has never seen Intentset to its first passing check in five minutes: install the toolchain, have an agent write one capability down from the code it already holds, and bind the tests that check it. Every command here is copyable, and nothing on this page needs anyone to ask.

The steps are the same in the [README](https://github.com/intentset/intentset#try-it-in-five-minutes). The timings are from a fresh TypeScript repository with one feature and three tests; the install is the only step that waits on the network.

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

What comes back is eight or so files under `product/`, one record each. The first capability brings three records above it, because a capability sits under an outcome, an outcome under an intent, and an intent under the product; from the second capability on, the agent adds only what is new. To see one record of each type before the agent writes yours, run `npx intentset init --example --root <an empty directory>`, which writes Lantern, the [worked example](../example/), there.

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

## 7. Keep it current

Add the checks to CI, so every change keeps the model true:

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

After the tests, import their report as in step 5 and validate at L3, so each run records which promises passed on which commit. From then on, the agent that changes the code updates the records in the same commit, or says in the commit that no behavior changed. Add capabilities one at a time, as the value becomes clear; [Run the adoption](../adopt/) is for the rest of the product.

## Starting a new product?

Write the model first. A product manager and an agent draft the behaviors, and a slice for the code that will deliver them, before any of it exists, each with `delivery: planned`. While the slice is a draft, the paths it plans are warnings, so the model passes from the first commit. The agent then builds against what was approved, and the change that builds a record's work marks it `delivery: built`.

[[Read the adoption log](../pilot/)]{.button .primary} [[Open Lantern, a worked example](../example/atlas/map/)]{.button}

> [!NOTE]
> The reference toolchain is an early release, at {{version}}. The architecture check needs TypeScript 7, which the CLI names as a peer dependency: npm installs it beside the CLI and leaves your repository's own TypeScript alone, while pnpm gives the CLI the TypeScript your repository has, so on one earlier than 7 the checks that read source (the architecture check, validate at L2 and above, review) cannot run; init and validate at L1 still do. There, run the toolchain without installing it, as `pnpm dlx --package=@intentset/cli --package=typescript@7 intentset`, or with npm as `npx -p @intentset/cli -p typescript@7 intentset`.
