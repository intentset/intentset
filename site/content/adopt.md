---
markset: 0
---

{.eyebrow}
Start

# Run the adoption with many agents

{.lead}
Adopting Intentset in a product that already exists is a team's work for a long time: model every capability, move the code into slices, close the gaps the records expose, put a check behind every claim. One person running many agents in parallel can do it in weeks, if the agents can work unattended inside protections that make a mistake cheap. This page is for that person: how to set up, how to split the work, what to settle before a long run, and what to prove before anything lands.

[Start with one capability](../start/index.html) comes first. This page is what to do once the first capability is modelled and you want the rest.

None of it asks you to change a control you already have. Whether a pull request merges on its own or waits for a reviewer, whether main deploys itself or a release is cut by hand, who may approve what: those are your rules, and this page works inside them. What it changes is how much of the work reaches those controls ready, and how little of a person's time it takes to get there.

## The shape of the job

The adoption has three kinds of work, and each of them is large.

- **Modelling.** An agent reads a capability out of the code, the tests and the decisions, and writes the records: its behaviors, rules, scenarios, the slice that owns it, the contract it exposes, a verification record for each check that exists. A product has dozens of capabilities.
- **Moving the code.** The architecture check reports every import that reaches past a slice's entrypoint, crosses a region the wrong way, or binds to the backend outside the one module meant to hold it. The first run in a real product reports hundreds. Each is a small change in one slice, and the baseline counts them down.
- **Closing the gaps.** Every model exposes claims no test checks, behaviors no code names, and explanations nobody reviewed. Each gap is a test, a marker or a record, written where the records say it belongs.

None of it is hard. All of it is long, and most of it can run at once, because the model has already divided it: one slice owns each behavior, one record names each check, and the gate on every pull request says whether a change kept them true. That is what lets one person run many agents the way a lead runs a team. Each agent does an engineer's work in its own slice. The model is what keeps twenty of them from stepping on each other, and the person's job is deciding, reviewing records and watching the counts, not typing.

## Protection before automation

An agent that works unattended will, at some point, do the wrong thing with the authority it has. The answer is not to watch it. The answer is to give it authority only inside a boundary where the wrong thing is cheap to undo, and to widen the boundary only as the protection around it grows. Three boundaries do the work, and the word "sandbox" gets used for all of them, so this page names them apart.

1. **The tool boundary.** The agent's own commands run with the files and the network they need and no more. What it can read, write and reach is a setting in the repository, and the destructive commands are refused there whatever the agent decides.
2. **The environment boundary.** The agent builds, deploys and clicks through a copy of the product that holds no real data and no real credential: a temporary backend of its own, a database it can drop, a browser pointed at its own build. When it is done, the copy is deleted.
3. **The merge boundary.** Nothing the agent does reaches the main branch except through a pull request and the review your process already requires, with the gate as a required check and, for the records, a person. A branch is cheap to throw away. Main is not.

The amount of automation a product can safely allow is set by the weakest of the three. Before anything is in production, the second boundary costs nothing, because there is no real data to protect, and a product can run with the first and third alone. Coral Reef Ventures' own products run that way today; neither is released. The day one of them is, the first boundary stops being optional, and the [adoption log](../pilot/index.html) will say when each protection went on and what it cost.

## Set up for many agents

Everything the [Start](../start/index.html) page does, and then the pieces that let the work run without you.

- **The guide, pointed at.** `intentset init` writes `.intentset/agents.md`, and one line in `CLAUDE.md` or `AGENTS.md` points every agent at it. The guide is generated from the toolchain, so what it tells an agent to run cannot disagree with what the gate runs.
- **The gate, required.** A check on every pull request runs `intentset validate --level L2 --mode migration` against a baseline of the violations that already exist, so only a new one fails, and `intentset review --base origin/main --fail-on-drift`, so a change that touched a slice's code and none of its records is refused unless a commit says why. Make the check required in the branch protection, with the product's own tests beside it. Whatever happens to a green pull request after that, a merge on its own or a reviewer's queue, is your process and stays as it is; the gate means what reaches it is already checked.
- **A disposable environment per branch.** Whatever the product runs on, give each agent its own temporary copy, created from the branch and deleted after, with no path from it to a shared environment. An agent that cannot run its build cannot check a screen, and one that runs it somewhere shared cannot be left alone. Your real environments and how they are deployed to do not change.
- **A browser the agent can drive.** A screen is a claim too. Give the agent a browser it can point at its own build, so it can open the page a behavior describes, read what is on it and compare it with the record, rather than reasoning about the component's source.
- **A permissions file in the repository**, committed, that says what every agent in the repository may do without asking. It starts narrow and widens as the boundaries above go on, and each widening is a commit with a reason.
- **A second model as reviewer.** A reviewer that reads the diff and the records without being told what the author concluded, and a verifier that is asked to break each finding rather than to confirm it.

## Split the work

The unit of parallel work is the slice, because that is the unit the architecture check protects. Two agents in one slice will write over each other; two agents in two slices can only meet at a contract. From there, four ways to run work, each for a different shape.

- **A session, in its own worktree, owns a slice or a capability.** It is the unit a person reviews: it opens a pull request, the gate runs on it, and the records in it are what the person reads. Run as many as there are slices you can review. A session's worktree is a copy of the repository with its own branch, so sessions never share a working tree, and an agent in its own worktree installs there rather than at the root it shares.
- **A workflow, inside a session, fans out work with a known shape.** Modelling the twelve capabilities of one product area, writing the test each of thirty verification records lacks, verifying every finding a review produced: the orchestrator holds the list, hands each item to a subagent, and collects the results in order. Use a workflow when you can write the loop down before it starts. Use sessions when each item needs a person's judgement at the end.
- **A subagent, inside a session, does a read or a review the session should not be anchored on.** Searching the repository for every consumer of an entrypoint, reviewing a diff fresh, checking a screen. It costs a handoff each way, so it is for work whose result is a conclusion, not a file dump.
- **A routine, on a schedule, runs what has to run whether or not anyone is working.** The drift check on main, the check that a locked site is still locked, the dependency updates, the daily count of the baseline. A routine's job is to open a pull request or a report, never to merge one.

Three things never split. **Approval** stays with a person, one record at a time; validation passing is not approval, and an agent never moves a record out of draft. **The root install** belongs to whoever owns the root; agents in parallel do not run it there. **Main** takes only what the gate passed.

## Ask first, then leave

The reason a person has to stay beside a long run is that the agent will stop to ask something. So gather the questions before it starts, and answer them where the agent can read them.

1. **Plan before building.** Ask the agent to read the capability's context and write a plan: the records it expects to write, the slices it will touch, the tests it will add, and every question it cannot answer from the repository. A plan is cheap, and reading one is how you find out what the agent misunderstood before it has written four thousand lines.
2. **Draft the records first, and approve them.** For new work, a product manager and an agent draft the behaviors and rules, and the slice that will deliver them, before any code. You read the drafts, which are a page in product language, and approve them. From then on the agent builds against what was approved, and the drift check holds it to that.
3. **Answer the questions in the repository, not the chat.** A decision the agent needed goes into a decision record or the project's instructions file, so the next agent does not ask it again.
4. **Then let it run, with two rules.** It does not end its turn to wait for a check it could poll; it polls, fixes and keeps going. And it stops only when the work is done or when it is blocked on a decision only you can make, which it says in one sentence.
5. **Check in from wherever you are.** A session you can reach from a phone is one you can leave. Look at the counts and the open pull requests, not the transcript.

## Write every decision down

Each session starts with no memory of the others. What one agent decided on Tuesday, twenty agents will face again on Wednesday, and the person who answered the question once does not want to answer it twenty times. The decision record is how a decision made in one session reaches every session after it, and how an agent explains to a later one why the obvious change is wrong.

One file per decision, in the repository, with four parts: the context, what was true and what forced a choice; the decision, as one sentence; what was rejected, and why; and the consequences, what it costs and what it makes easier. A decision is never edited to reverse it. A new record supersedes it and the old one says so, so the history of the reasoning stays readable. Code, specifications and other records cite it by number.

Agents write them. When an agent chose between alternatives, or you answered a question it asked, the record goes in the same pull request as the change, and reading it is the cheapest review there is: a decision is a paragraph where the code is a thousand lines, and a wrong decision is visible there in a way a wrong line is not. Ask for the rejected alternatives in particular; they are what the next agent needs most, because the rejected alternative is usually the one it will think of first.

Intentset makes the decision part of the model. A `decision` is a record type, with Context, Decision and Consequences as its required sections, and a slice, a contract or a behavior names the decisions that inform it. `intentset context` hands an agent its slice's decisions beside its behaviors and rules, so the next agent reads them before it changes the code, and the drift check lists a slice whose code changed while its decisions and other records did not. In the [adoption log](../pilot/index.html), the decision record that already explained Streamlane's blocked state joined the model by gaining frontmatter, its text unchanged, and came in as approved while every record written that day was a draft: the one record a person had already reviewed.

## Prove it before it lands

A change that lands unread has to carry its own proof. Each of these is a check the agent runs before it opens the pull request, and the gate runs again.

- **A test with every claim.** A new behavior ships with the test that checks it and the verification record that names the test. A changed behavior ships with the changed test. The verification records are the list of what the product can prove, and a claim with no record on it is a gap the model reports.
- **Screens checked in a browser, not in the source.** For a behavior with a surface, the agent opens its own build, performs the behavior and reads the result from the page. A screenshot in the pull request is the record of that.
- **A review the author did not write.** A second agent reads the diff and the records cold, and an adversarial verifier takes each finding and tries to show it is wrong. What survives is what a person sees. A reviewer handed the author's conclusion returns it confirmed; a reviewer handed the code does not.
- **The drift check.** `intentset review` lists each slice whose code changed while its records did not. A refactor answers with one `Intentset-Unchanged` trailer per slice, in the commit, where the reviewer can question it. Anything unanswered fails the gate.
- **The gate before the review.** Whether a green pull request then merges on its own or waits for a reviewer is your rule, not this page's. What changes is what the reviewer gets: a change that has already passed the gate, with its records, its tests and its screenshots in it, so a person's review goes to the records, which are short, rather than the diff, which is not.

## Loosen only inside the protection

Permissions widen in steps, and each step is paid for by a boundary.

| What the agent may do without asking | What has to be in place |
|---|---|
| Read the repository and run the tests, the build and the Intentset checks | Nothing. These change nothing outside the working tree. |
| Edit files, commit and push to its own branch | A worktree per session, and branch protection on main. |
| Deploy and drive a browser | A disposable environment with no real data, created and deleted by the agent. |
| Run every command without asking | The tool boundary: a command sandbox with the destructive commands refused, and no production credential reachable from the working tree. |
| Merge on its own, where your process allows it | A required gate, a reviewer that is not the author, and the rule that only a person approves a record. Where your process does not allow it, the agent's work stops at the pull request, ready. |

What never loosens: a production credential in the working tree, a deploy to a shared environment, a record moved out of draft by an agent, and a merge that skipped the gate or the review your process requires.

## With Claude Code

The practices above are for any agent. These are the pieces that map to them in Claude Code as of 2026-10-09, where the names are its own and will move. Check its documentation for the current form.

| The practice | The piece |
|---|---|
| The guide, pointed at | `@.intentset/agents.md` in `CLAUDE.md`, which imports the file. |
| A permissions file in the repository | `.claude/settings.json`, committed: `permissions.allow`, `permissions.deny` and `permissions.ask` name the commands and tools, and `sandbox` limits the files and the network a command can reach. `.claude/settings.local.json` beside it holds what one person allows and is not committed. |
| A rule that holds whatever the agent decides | A hook in the same file: a command that runs before a tool call and can refuse it, or when the agent stops and can send it back to run the checks. Instructions ask; hooks enforce. |
| A session in its own worktree | `claude --worktree <name>`, which opens the session on a copy of the repository under its own branch. |
| A workflow that fans out subagents | Dynamic workflows, asked for with the word `ultracode` in the prompt or saved under `.claude/workflows/`: a script of agent calls whose results stay in the script, not in your context. `/workflows` watches one run. |
| A subagent for a cold read or review | A definition under `.claude/agents/`, with the model and the tools it gets, run in the background and given the code, not the conclusion. `isolation: worktree` gives it a worktree of its own. |
| A routine on a schedule | A routine, from `/schedule`, with a cron expression, run in the cloud whether or not a session is open (a research preview as of this date); `/loop` for a repeated check within one session. |
| Plan before building | Plan mode, from `--permission-mode plan` or Shift+Tab, which reads and plans and changes nothing until you accept it. |
| A browser the agent can drive | Claude in Chrome, from `--chrome`, or a Playwright MCP server, pointed at the agent's own build. |
| Check in from wherever you are | Remote Control, from `/remote-control`, which puts the running session in the Claude app on your phone. |
| A review the author did not write | `/code-review` on the branch, which runs as a background subagent and can post its findings on the pull request with `--comment`. |
| A run with no one watching | `claude -p` for a run from a script, and the Claude Code GitHub Action for one that CI starts. |

Two instructions belong in `CLAUDE.md` for every repository that runs this way, in plain words: that an agent never ends its turn to wait on a check it could poll, and that when it is blocked it says so in one sentence and stops. Everything else the guide already says.

## With any agent

The same shape holds for any coding agent that reads a file of instructions and runs commands. `AGENTS.md` carries the line that points at the guide. Git worktrees are git's, and a branch per session with protection on main needs nothing from the agent. The gate is a workflow in CI, and what happens after it is whatever your process already does. A disposable environment is a copy of whatever the product runs on, created from a branch. What differs between agents is how they run subagents, how they ask, and how they are reached from a phone; what is the same is that none of it is safe without the three boundaries, and all of it is fast with them.

## This is less to set up than it reads

Everything above is a lot to read and would be a lot to set up by hand. You do not set it up by hand. An agent can read this page, and setting up is the kind of work it does well: a permissions file, a worktree, a hook, a subagent definition, a check in CI. So point your agent here and say that this is how you want to work, with whatever your own rules add:

```text
Read https://intentset.org/adopt/. That is how I want to work in this repository.
Set it up here, inside the controls we already have: <your rules on merging,
deploying and approval>. Write a plan first, with every question you cannot
answer from the repository, and stop there until I have read it.
```

The plan is the page's own first step. Read it, answer what it asks, and the rest is the agent's work, one pull request at a time, each through the gate.

[[Read the adoption log](../pilot/index.html)]{.button .primary} [[The agent guide](../guide/index.html)]{.button}
