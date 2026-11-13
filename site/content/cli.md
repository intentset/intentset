---
markset: 0
---

# The intentset command

{.lead}
`intentset` reads the records in a repository and reports on them. `validate`, `graph`, `architecture check`, `evidence stale`, `impact`, `context`, `list` and `review` execute nothing, reach no network and never change a record; publishing and serving are separate commands you run on purpose.

## Install

:::tabs
### npm
```sh
npm install --save-dev @intentset/cli
npx intentset validate
```

### pnpm
```sh
pnpm add --save-dev @intentset/cli
pnpm exec intentset validate
```
:::

The checks that read source (`architecture check`, `validate` at L2 and above, `review`) need TypeScript 7, the CLI's peer dependency; the rest of the toolchain does not. npm installs the peer beside the CLI; pnpm gives the CLI the TypeScript your repository has, and on one earlier than 7 those checks stop and name the version found. There, run the toolchain without installing it: `pnpm dlx --package=@intentset/cli --package=typescript@7 intentset`, or `npx -p @intentset/cli -p typescript@7 intentset`.

## In a repository

`init` writes the configuration, empty registries and the [agent guide](../../guide/) your agents follow. From then on, CI runs these on every change, and an agent runs them before it finishes:

```sh
intentset validate --level L2
intentset review --base origin/main --fail-on-drift
```

`validate` runs every check the level asks for. Each level includes those below it: L1 is the model, L2 adds the architecture, L3 the evidence and L4 publication readiness. `review` adds the impact of what changed, and lists each slice whose code changed while its records did not.

To ask the model a question, `list` names the records that match. Fields combine with AND and the values of one field with OR, so this lists the draft behaviors that describe code that exists, which is where an owner starts approving:

```sh
intentset list --type behavior --status draft --delivery built
```

`--count-by` counts the matches by one field instead, and `--from` reads an export rather than the repository, with the same answer.

## Every command

This is the command's own help, as `intentset --help` prints it.

```text
{{usage}}
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | No errors. Warnings may still be reported. |
| 1 | At least one diagnostic is an error, or, with `review --fail-on-drift`, a slice changed with no acknowledgement. |
| 2 | The command was invoked wrongly, or the tool itself failed. |

`--json` prints machine-readable output, with its keys in canonical order, for CI and for agents.
