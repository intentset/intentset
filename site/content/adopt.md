---
markset: true
---

{.eyebrow}
Once one capability works

# Model the whole product with many agents

{.lead}
You have one capability modelled and checked. Modelling the rest of an existing product is long work, but one person running many agents can do it in weeks, if the agents work inside protections that make a mistake cheap. Who may merge, deploy or approve stays your rule.

## The job has three parts, and most of it can run in parallel

- **Modelling.** An agent reads a capability out of the code, the tests and the decisions, and writes its records: behaviors, rules, the slice that owns it, a verification record for each check that exists. Each draft also says whether its work exists: `delivery: built` when it was written from code, `delivery: planned` when it proposes work. `intentset list --status draft --delivery built` lists the drafts that describe existing code, which is where an owner starts approving.
- **Moving the code.** The architecture check reports every import that reaches past a slice's entrypoint. A real product starts with hundreds. Each is a small change in one slice, and a baseline counts them down.
- **Closing the gaps.** The model shows claims no test checks and explanations nobody reviewed. Each gap is a test or a record, written where the records say it belongs.

One slice owns each behavior, so each agent can work in its own slice. Your job is deciding, reading records and watching the counts.

## Give agents authority only where a mistake is cheap

Three boundaries do the work:

1. **The tool boundary.** What an agent's commands can read, write and reach is a setting in the repository, and destructive commands are refused there whatever the agent decides.
2. **The environment boundary.** The agent builds and tests against its own temporary copy of the product, with no real data and no real credential, deleted when it is done.
3. **The merge boundary.** Nothing reaches main except through a pull request, the review your process already requires, and the check as a required status. A branch is cheap to throw away. Main is not.

The weakest of the three sets how much automation is safe. Before anything is in production, the first and third are enough.

## Set up once, then let the work run

- **Point every agent at the guide.** `intentset init` writes `.intentset/agents.md`, and one line in `CLAUDE.md` or `AGENTS.md` points agents at it.
- **Make the check required.** On every pull request, run `intentset validate --level L2 --mode migration` against a baseline of the violations that already exist, and `intentset review --base origin/main --fail-on-drift`. Add `--baseline` and `--fail-on-baseline-growth` to review, so a change that adds a violation is refused.
- **Give each branch a disposable environment**, created from the branch and deleted after, and a browser the agent can point at its own build, so it checks a screen by looking at it.
- **Commit a permissions file** saying what agents may do without asking. Start narrow; each widening is a commit with a reason.

## Split the work by slice

Two agents in one slice write over each other. Two agents in two slices can only meet at a contract.

- **A session in its own worktree owns a slice or a capability**, and opens one pull request a person reviews.
- **A workflow inside a session fans out work with a known shape**, such as modelling the twelve capabilities of one area or writing the test each verification record lacks.
- **A scheduled job runs what must run whether anyone is working**, such as the drift check on main. It opens a pull request or a report, never merges one.

Three things never split. Only a person approves a record, one at a time; passing validation is not approval. Only whoever owns the repository root installs there. And main takes only what passed the check.

## Settle the questions before a long run

1. **Ask for a plan first:** the records the agent expects to write, the slices it will touch, the tests it will add, and every question it cannot answer from the repository.
2. **For new work, draft and approve the records before any code**, each with `delivery: planned`. The drift check then holds the build to what you approved.
3. **Answer questions in the repository**, in a decision record or the instructions file, so the next agent doesn't ask again.
4. **Then let it run.** It polls checks instead of stopping to wait, and stops only when it is done or blocked on a decision that is yours, which it says in one sentence.

## Write every decision down

Each session starts with no memory of the others, so a choice made once goes into a decision record: the context, the decision in one sentence, what was rejected and why, and the consequences. Agents write them in the same pull request as the change. A `decision` is an Intentset record type, so `intentset context` hands an agent its slice's decisions beside its behaviors and rules.

## Prove it before it lands

A change that lands unread has to carry its own proof: a test with every claim, screens checked in a browser, a review the author did not write, and an answer to the drift check, either updated records or an `Intentset-Unchanged` trailer per slice. [Make agents' work safe to accept](../verify/) has each layer in full.

## Loosen permissions only inside the protection

| What the agent may do without asking | What has to be in place |
|---|---|
| Read the repository and run the tests, the build and the Intentset checks | Nothing. These change nothing outside the working tree. |
| Edit files, commit and push to its own branch | A worktree per session, and branch protection on main. |
| Deploy and drive a browser | A disposable environment with no real data. |
| Run every command without asking | A command sandbox that refuses destructive commands, and no production credential reachable from the working tree. |
| Merge on its own, where your process allows it | A required check, a reviewer that is not the author, and only people approving records. Otherwise the work stops at the pull request, ready. |

What never loosens: a production credential in the working tree, a deploy to a shared environment, a record approved by an agent, and a merge that skipped the check or your review.

## Let an agent set it up

What this page describes is setup work an agent does well. Point your agent here and add your own rules:

```text
Read https://intentset.org/adopt/. That is how I want to work in this repository.
Set it up here, inside the controls we already have: <your rules on merging,
deploying and approval>. Write the plan first, as a page you keep current, with
every question you cannot answer from the repository, and stop there until I
have read it.
```

[[Make agents' work safe to accept](../verify/)]{.button .primary} [[What your agents read](../guide/)]{.button}
