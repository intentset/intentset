---
markset: 0
---

# Start with one behavior.

{.lead}
You do not need to reorganize your repository to try the model. Choose one observable promise, then connect the evidence around it.

### 1. Write the promise

Describe the actor, trigger, successful result, and meaningful failure response. Give the behavior a stable ID. If two parts can be released or owned independently, consider separate behaviors.

### 2. State the constraints

Add rules and concrete scenarios. Reuse a shared rule through a link rather than copying its wording into every behavior.

### 3. Find the owner

Identify the slice accountable for delivering the behavior. Record its public contract and implementation paths, including backend resources that live elsewhere. If the code does not exist yet, keep the slice a draft: paths it plans are warnings until you approve it.

### 4. Connect the checks

Name the verification procedure and its stable selector. A linked test is useful, but a current passing run is a separate claim. Keep that distinction visible.

### 5. Review the explanation

Write audience-safe guidance for an exact release. Keep internal decisions and implementation details out of the customer projection unless they help the customer act.

[[Open the worked example](../example/index.html)]{.button .primary} [[Read the Core specification](../specifications/core/index.html)]{.button}

> [!NOTE]
> This is a manual adoption guide for the v0.1 draft. To check your records as you go, install the reference toolchain with `npm install --save-dev @intentset/cli`, then run `npx intentset init` and `npx intentset validate`. The architecture check needs TypeScript 7; in a repository on an earlier TypeScript, run the toolchain as `npx -p @intentset/cli -p typescript@7 intentset`.
