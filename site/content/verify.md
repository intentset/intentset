---
markset: 0
---

{.eyebrow}
Once one capability works

# Make agents' work safe to accept

{.lead}
An agent that says it is done is worth exactly what the checks behind that word are worth, and nobody can read every line twenty agents write. This page is the checks that let a change carry its own proof, so a reviewer can trust it without reading the diff.

Most of it is general practice, and none of it asks you to change a control you already have. Where Intentset has a part, the section says so.

## Each kind of check catches what the others miss

A unit test cannot see a page that scrolls sideways on a phone. A screenshot cannot see a rule that refuses the wrong person. A green build cannot see a test that was quietly loosened. Use all of the checks below; none of them depends on a person reading the diff.

## Every claim has a test

A behavior ships with the test that checks it, and a verification record names that test. Coverage is then counted in promises, not lines: a rule with no test is listed as a gap, whatever a line counter says.

- Run a new test once against the code without the change, and see it fail. A test that passes either way checks nothing.

`intentset validate --level L3` shows, side by side, which promises have a test linked and which have a current pass.

## The agent drives the product, not just the source

An agent that opens the page and clicks the button knows it works; one that reads the source only thinks so. Give each agent its own disposable copy of the product and a browser it can drive, such as Playwright, and write one end-to-end test per flow a behavior describes, including how it fails.

Run the tests a change can reach on each pull request, and the whole suite after each batch of merges. In a product with a user interface, browser tests are part of the proof, not an extra.

`intentset evidence import --from playwright` turns the browser run's report into run records.

## Every screen is checked in every form it takes

- **Both color schemes,** because a color that reads on one ground disappears on the other.
- **A phone and a desktop,** at least 390px and 1440px.
- **Screenshots the agent reads,** attached to the pull request.
- **Checks that need no eyes,** on every pull request: nothing scrolls sideways, every control can be tapped and reached by keyboard, and all text clears WCAG AA contrast.

## The product's rules have tests of their own

The changes that do the most damage often touch no feature, such as a log line that starts carrying an email address. Write a test for each rule the product keeps, so the rule fails a build rather than an audit.

`intentset validate --level L2` adds the architecture check: an import that reaches past another slice's entrypoint fails. In an older codebase, run it against a baseline so only a new violation fails.

## One gate, the same everywhere

- **The same commands locally and in CI,** each a script CI calls by name, so an agent can run the gate before it opens a pull request.
- **Required checks on main,** taking changes only through a pull request.
- **One required job that needs all the others,** so adding a job never means editing the branch rule.
- **Checks of the live product on a schedule, in a workflow of their own,** so they never fail someone's unrelated pull request.
- **The drift check.** `intentset review --base origin/main --fail-on-drift` refuses a change that touched a slice's code and none of its records, unless a commit says no behavior changed.

Whether a green pull request then merges on its own, or goes to a reviewer, is your process.

## Some checks run after it ships

Run a smoke test after every deploy, and a scheduled check of each claim about the live product, such as a page that must stay behind sign-in.

Run records tie a pass to what it checked. `intentset evidence import` turns a Vitest, Playwright or node:test report into run records. A pass counts while what its check is about is unchanged, and goes stale when that changes; a release gate can ask for the stricter rule, a pass on the commit under review. `intentset evidence stale` lists the checks with no current pass, and can print the arguments that make the test runner run only those.

## Failures stay rare enough to be read

Every check above is worth nothing once failures are normal.

- **No flaky tests.** A test that fails only sometimes is fixed or removed the day it is found.
- **No loosened test to make a build pass.** A changed expectation is a change in the pull request, with its reason in the commit. An agent never skips a test or widens an assertion to get to green.
- **A reviewer that is not the author.** A second agent reads the change cold.

## What a reviewer reads

A pull request now carries its proof: the records it changed, the tests that check them, screenshots, a green gate and a second reviewer's findings. A person reads the records and glances at the pictures.

## Have your agent set it up

Point your agent at this page:

```text
Read https://intentset.org/verify/. I want every change in this repository to
carry its own proof. Compare what is here with that page, inside the controls we
already have: <your rules on merging, deploying and approval>. Write the plan
first: each check we have, each we lack, what you would add and in what order.
Stop there until I have read it.
```

[[Every command and option](../tools/cli/)]{.button .primary} [[Model the whole product with many agents](../adopt/)]{.button}
