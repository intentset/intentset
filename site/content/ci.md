---
markset: 0
---

# Add Intentset to your CI

{.lead}
Run the checks on every pull request, so a change cannot merge while its code and its records disagree. This page assumes you have [set up Intentset](../) and connected your tests.

## The job

After your dependencies install, the job checks the records, runs the tests with a report, imports the results, checks that each promise has a current pass, and reviews the change against main. As a GitHub Actions workflow, in `.github/workflows/intentset.yml`:

```yaml
name: intentset
on: pull_request
jobs:
  intentset:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # review compares with origin/main, so it needs the history
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npx intentset validate --level L2
      - run: npx vitest run --reporter=json --outputFile=reports/vitest.json
      - run: >-
          npx intentset evidence import --from vitest reports/vitest.json
          --out .intentset/evidence/ci.json --product <PRD-ID> --release v1
      - run: npx intentset validate --level L3
      - run: npx intentset review --base origin/main --fail-on-drift
```

Replace `<PRD-ID>` with your product record's ID, which `npx intentset list --type product` prints, and `v1` with a release label from your registries. With Playwright or node:test, change the test step and `--from` as on [the setup page](../), step 5.

What each step does:

- **`validate --level L2`** checks that the records are complete and link up, and that each slice's code stays out of other slices' internals.
- **The tests and `evidence import`** turn the test report into run records for this commit. They stay in CI and are never committed.
- **`validate --level L3`** checks that each promise's tests have a current pass.
- **`review --fail-on-drift`** fails when code changed and the records that describe it did not, unless a commit says no behavior changed. [What CI checks](../../how-it-works/#what-ci-checks) shows a failure and the two ways through.

Each command exits with a non-zero code when its check fails, so the job fails with it.

## Make it required

A check that fails without blocking the merge is only a warning. In your repository's branch protection or ruleset for main, require the `intentset` job to pass before a pull request can merge.

## On another CI system

Any CI that runs Node works. It needs:

- Node 22.18 or later.
- The full git history, with main as `origin/main`. A checkout of the branch alone does not have it, and review stops with exit code 2: `intentset review: --base origin/main names no commit.` Fetch main before the review with `git fetch origin main:refs/remotes/origin/main`.
- Not a shallow clone. With too little history, review can find nothing to compare, and pass.
- The same commands, in the same order.

## Code that already breaks the boundaries

If the architecture check finds violations already in the code, write them down as a baseline, commit the file, and give it to both commands. A baseline may shrink and may not grow:

```sh
npx intentset architecture check --mode migration --write-baseline .intentset/baseline.json
npx intentset validate --level L2 --mode migration --baseline .intentset/baseline.json
npx intentset review --base origin/main --fail-on-drift \
  --baseline .intentset/baseline.json --fail-on-baseline-growth
```

The first writes the file and still exits with code 1, because the violations are still there. From then on a new violation fails `validate`, and one added to the baseline fails `review`.

[[Model the whole product with many agents](../../adopt/)]{.button .primary} [[Every command and option](../../tools/cli/)]{.button}
