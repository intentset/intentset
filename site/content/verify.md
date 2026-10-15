---
markset: 0
---

{.eyebrow}
Start

# Prove the work

{.lead}
Writing the code is no longer the hard part. Knowing it is right is. An agent that says it is done is worth exactly what the checks behind that word are worth, and a person cannot read every line twenty agents write. This page is the checks that let a change carry its own proof: what each one catches, how to set it up so an agent runs it without being asked, and what a reviewer reads once they are in place.

[Run the adoption with many agents](../adopt/) says how to split the work and protect what an agent can reach. This page is the other half: what makes the work an agent hands back safe to accept.

None of it asks you to change a control you already have. Who approves a pull request, whether a green one merges on its own, how a release is cut: those stay your rules. What changes is how much of the work arrives at them already proved.

## Confidence comes in layers

No single check makes a change trustworthy. A unit test cannot see a page that scrolls sideways on a phone; a screenshot cannot see a rule that refuses the wrong person; a green build cannot see a test that was quietly loosened. Each layer below catches what the others miss, and none of them depends on a person reading the diff.

| The layer | What it catches |
|---|---|
| A test with every claim | A promise the code no longer keeps |
| The product, driven | A flow that works in a unit test and fails in the product |
| Every screen, in every form | A layout broken in dark mode, on a phone, or for a keyboard |
| Tests that hold the rules | A policy broken by a change that touched no feature |
| One gate, required | Work that skipped a check, or a check that never ran |
| Checks after it ships | A claim about the live product that stopped being true |
| A clean signal | A failure ignored because failures had become normal |

## A test with every claim

A behavior ships with the test that checks it, and a [verification record](../how-it-works/) names that test. A changed behavior ships with the changed test. The model then reports every claim nothing checks, so coverage is measured in promises, not lines: a rule with no test is a gap, listed, whatever percentage a line counter shows.

- **Test against the real thing where it is cheap.** Run the data layer's tests against a local copy of the database, sending it the same conditions production gets, rather than against a mock that agrees with whatever the code assumes.
- **Let the count only go up.** A gap closed stays closed, because the model lists it again the moment its test goes. An agent asked to "add tests" has a list to work through rather than a guess.
- **Test the test's failure.** A new test is run once against the code without the change and seen to fail. A test that passes either way checks nothing.

## Drive the product, not the source

An agent that reasons about a component's source will tell you the button works. An agent that opens the page, clicks the button and reads what happened knows. Give every agent its own disposable copy of the product, created from its branch, and a browser it can drive (Playwright is what Coral Reef Ventures uses), and make end-to-end tests the way a behavior with a surface is checked.

- **One test per flow a behavior describes,** walking it as a user would: sign in, do the thing, read the result from the page, including how it fails.
- **A stub where determinism matters, the real backend where only it can prove the claim.** A build served against stub backends checks layout and navigation fast and never flakes. A flow that crosses an authorization rule or a database condition runs against the agent's own deployed copy.
- **Run what the change reaches, then everything.** Each pull request runs the end-to-end tests its change can affect; the whole suite runs after each batch of merges. In one of Coral Reef Ventures' products, more than three quarters of the verifications are browser tests, so this layer is not an extra: it is most of the proof.

## Every screen, in every form it takes

A screen is a claim too, and it takes more forms than the one a developer looks at. Check each.

- **Both color schemes.** Every page in light and in dark, because a color that reads on one ground disappears on the other.
- **The widths people use.** At least a phone (390px) and a desktop (1440px), and the widths in between where a layout changes; 320px if you claim reflow.
- **Screenshots the agent reads.** The agent captures each changed screen in each scheme and width, looks at what it captured, and attaches the shots to the pull request as the record of what it saw. A reviewer opens a picture, not a branch.
- **Checks that need no eyes.** Some layout faults a test measures better than a person sees: nothing scrolls sideways or is clipped; every link and button is a large enough target to tap; the keyboard reaches every control in order, each with a visible focus ring; and every text element clears WCAG AA contrast, measured, in both schemes. These run on every pull request and never tire.
- **More than one engine where the page is critical.** A page every visitor passes through runs in Chromium, Firefox and WebKit.

## Tests that hold the rules

The changes that do the most damage often touch no feature. A log line that starts carrying an email address, a retention period that no longer matches what the privacy page promises, a page that loads a script from a new origin: none of them breaks a behavior test. Write a test for each rule the product keeps, so the rule fails a build rather than an audit.

- **What is never logged.** A test per function that its logs carry an event kind, ids and a status, and no request body, address or token.
- **What a document promises.** A test that holds the constants the privacy page quotes to the ones the code enforces, so one cannot change without the other.
- **The infrastructure, synthesized.** The backend's definition built in a test, reading no account, with the resources that must never be replaced pinned by name, so a rename that would replace a user directory or empty a table fails the build.
- **The page's own boundaries.** A content security policy on every page, and no origin a page calls that the policy does not name.
- **The architecture.** `intentset validate --level L2` reports an import that reaches past a slice's entrypoint or crosses a region the wrong way; in a repository with years of history, run it against a baseline so only a new violation fails.

## One gate, the same everywhere

A check that runs on a laptop and not in CI is a suggestion. A check that runs in CI and not on a laptop is a surprise. Make them one list.

- **The same commands, locally and in CI.** Lint, typecheck, the tests, the Intentset checks and the end-to-end suite, each a script in the repository that CI calls by name. A green local run then predicts a green pull request, and an agent can run the gate before it opens one.
- **Required checks on main.** A rule on the main branch that refuses a force-push or a deletion, takes changes only through a pull request, and requires the checks to pass. With GitHub, a repository ruleset does all three.
- **One required job over many.** Split CI into jobs that run at once (lint, typecheck, unit, contract) and require only the one job that needs them all, so adding a job never means editing the branch rule.
- **A required check that always reports.** A required check whose workflow runs only when certain paths change blocks every pull request that touches none of them, waiting for a result that never comes. Pair it with a second workflow of the same job name and the opposite path filter, so exactly one of them reports on every pull request.
- **Know main is green before merging.** Requiring every branch to be up to date with main is safest, and with many agents it sends every open pull request back to re-run after each merge. If you drop it, keep the guard on main instead: read main's latest runs before merging, and watch the run for the merge commit after.
- **What lives outside a pull request runs on a schedule, in a workflow of its own,** so a scheduled check that finds a problem in the live product opens a report rather than failing someone's unrelated pull request.
- **The drift check.** `intentset review --base origin/main --fail-on-drift` refuses a change that touched a slice's code and none of its records, unless a commit says why.

Whether a green pull request then merges on its own is your process. Coral Reef Ventures lets an agent merge its own once every check passes; yours may send it to a reviewer. Either way the gate means what arrives has been checked.

## Checks after it ships

Some claims are about the live product, not the code: a page is locked to invited guests, a deploy came up, a certificate renews. A test on a pull request cannot see them.

- **A smoke test after every deploy,** signing in as a temporary user and walking one flow end to end, so a deploy that went green and serves nothing is caught at once.
- **A scheduled check of each live claim.** Coral Reef Ventures checks every day that the sites it keeps locked still refuse a visitor without an invitation and serve an invitee, and by hand after every deploy of one.
- **Run evidence, bound to what it checked.** `intentset evidence import --from vitest` (or `--from playwright`) turns a test report into run records bound to the commit and to each verification's subject, the files its check is about. A pass stays current while those files are unchanged and goes stale when they change, and `intentset evidence stale --format playwright` prints the arguments that make the runner run only the stale ones. The model then says which of its claims hold today, not which were ever tested.

## A clean signal

Every layer above is worth nothing if a failure is ignored, and failures are ignored once they are normal.

- **No flaky tests.** A suite with no failures to expect makes every failure real. An agent reads a failing test's error and trace rather than re-running it until it passes; a test that fails only sometimes is fixed or removed the day it is found, because one teaches every agent to retry.
- **No loosened test to make a build pass.** A changed expectation is a change in the pull request, with its reason in the commit, where a reviewer can question it. An agent never skips a test, raises a timeout or widens an assertion to get to green.
- **Deterministic by construction.** Same inputs, same result: fixed clocks and seeds in tests, stub backends for anything a test does not mean to exercise, and each test working in data of its own so tests running at once cannot meet.
- **A reviewer that is not the author.** The agent that wrote a change has a stake in its tests passing. A second agent reads the diff, the tests and the records cold, and a verifier tries to break each of its findings. What survives is what a person sees.

## What a reviewer reads

With the layers in place, a pull request carries its proof: the records it changed, the tests that check them, the screenshots of every changed screen in both schemes and at each width, the gate green, and a cold reviewer's findings. A person's review goes to the records, which are a page in product language, and the pictures, which take a glance. The diff is still there for anyone who wants it, and nobody has to read it to know the change works.

## Have your agent set it up

Like everything on [the adoption page](../adopt/), this is work an agent does well: a workflow, a branch rule, a test helper that measures contrast, a script that captures screenshots. Point it here:

```text
Read https://intentset.org/verify/. I want every change in this repository to
carry its own proof. Compare what is here with that page, inside the controls we
already have: <your rules on merging, deploying and approval>. Write the plan
first, as a page you keep current: each layer we have, each we lack, what you
would add and in what order, and every question you cannot answer from the
repository. Stop there until I have read it.
```

[[Run the adoption](../adopt/)]{.button .primary} [[How it works](../how-it-works/)]{.button}
