---
markset: 0
---

{.eyebrow}
For teams shipping with coding agents

# Keep control of what your agents build

{.lead}
Agents write code faster than anyone can review it. Intentset writes down what your product is supposed to do, in short files beside the code, and stops a change in CI when the code moves and those files do not.

[[See how it works](how-it-works/)]{.button .primary} [[Try it on your code](start/)]{.button}

***

{.eyebrow}
The problem

{#problem}
## A change can pass every check and still change the product

:::card[An example]{.example}
Your shop's password reset links work for one hour. An agent is asked to tidy up the account code. On the way, it changes the link's lifetime to 24 hours and updates the test to match. The tests pass and CI is green. The pull request says it tidies up the account code, which is true, and it is approved.

Nobody decided that a reset link should last a day. The product changed, and the only trace of it is one number in a long diff.

{.small .muted}
Illustrative: an invented shop, not a real event.
:::

Nobody made a mistake here. Every change makes small decisions about what the product does. When people wrote the code, those decisions passed through someone who knew the product. Now an agent makes them, and writes the tests that check them, in the same change. Green CI tells you the code does what the tests say. It cannot tell you whether anyone meant the product to change.

***

{.eyebrow}
How it works

## Write the promise down, and let CI hold the code to it

:::steps
1. **Write down what the product promises.** Each promise is a short Markdown file under `product/`, kept in your repository and reviewed in the same pull request as the code. Your agent drafts it, often from code you already have, and a person approves it. This is the shop's rule, without the header your agent fills in:

   ```markdown
   # Reset links expire after one hour

   ## Constraint

   A password reset link stops working one hour after it is sent.
   ```
2. **Say which code keeps it.** The records name the code that delivers each promise, so Intentset knows which promises a change to that code can affect.
3. **Check every pull request.** When code changes and the records that describe it do not, CI fails and says why:

   ```text
   ### SLICE-ACCOUNT-RESET: Password reset

   - Not acknowledged: update the records below, or say in a commit that no behavior changed.
   - Code changed: src/features/accounts/reset/policies/link-expiry.test.ts
   - Code changed: src/features/accounts/reset/policies/link-expiry.ts
   - Records describing it, none changed: BEH-RESET-PASSWORD, RULE-RESET-LINK-EXPIRY, SLICE-ACCOUNT-RESET
   ```

   {.small .muted}
   Real output of `intentset review --fail-on-drift` on the example above, trimmed to the part that failed.
:::

Now the change has to say what it means. If reset links really should last a day, the agent updates the rule, and the reviewer reads one line before any code:

```diff
-A password reset link stops working one hour after it is sent.
+A password reset link stops working 24 hours after it is sent.
```

If nothing the product does changed, as in a real tidy-up, a line in the commit message says so. Either way, a person sees the decision in plain words before it merges.

***

{.eyebrow}
What it is

## Plain files, and a command that checks them

- **Files you own.** The records are Markdown in your repository. Anyone can read them, on GitHub or in an editor, with nothing installed.
- **A command-line tool.** `@intentset/cli` on npm runs on your machine and in CI. There is no service, no database and no account.
- **Open.** The format is an open specification and the tool is MIT-licensed, so any tool can read the records.
- **Next to what you have.** Your tests, your pull requests and your agents' instructions stay as they are. Intentset ties them to what the product promises.

***

:::card{.closing}
## Try it on one feature you already have

{.lead}
An agent writes down one feature from your code and tests. You review what it wrote and see what it finds.

[[Try it on your code](start/)]{.button .primary} [[See how it works](how-it-works/)]{.button}
:::
