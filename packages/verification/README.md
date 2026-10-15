# @intentset/verification

Run records and what they prove (Core §8): reading and checking records, classifying each as current, stale or
missing against the snapshot it ran at, coverage that counts links and current passes separately, and adapters that
turn a Vitest JSON report or node's TAP output into records.

## Install

```sh
npm install @intentset/verification
pnpm add @intentset/verification
```

## Example

In CI, after the tests, turn the report into run records bound to this commit and graph, through the CLI,
`@intentset/cli`:

```sh
npx -p @intentset/cli intentset evidence import --from vitest reports/vitest.json \
  --out .intentset/evidence/ci.json --product PRD-X --release <label>
npx -p @intentset/cli intentset validate --level L3 --product PRD-X --release <label>
```

With pnpm, `pnpm dlx --package=@intentset/cli intentset …`, or `pnpm exec intentset …` once `@intentset/cli` is
installed. The command is always `@intentset/cli`'s: this package has no `intentset` binary, and npx asked
for `intentset` alone would fetch an unrelated unscoped package from the registry.

From code:

```ts
import { readFile } from "node:fs/promises";
import { readRunRecords } from "@intentset/verification";

const path = ".intentset/evidence/ci.json";
const { records, diagnostics } = readRunRecords(JSON.parse(await readFile(path, "utf8")), path);
// a record with any problem is reported as EVID001 and left out, so it never counts as evidence
```

Only a `pass` whose binding holds is current. Under subject binding, the default where slices claim files, a record carries the hash of its verification's subject (`computeSubject`) and stays current while that is unchanged (a resource's files count only where the verification exercises it or an implementing slice owns it, `evidence.resources: exercised`; EVID006 reports what that cannot see; a slice reached only through `dependsOn` counts by every file it claims, or, with `evidence.dependencies: entrypoint`, by its binding fields, entrypoint files and contract records, and EVID007 reports what that cannot see); under commit binding, which a repository or a gate asks for, it is current only at the assessed commit and graph hash. Keep run records out of the commit they assess.

## Learn more

Part of [Intentset](https://intentset.org/), which keeps product intent connected to the code that delivers it and the
checks that verify it, as readable Markdown files in a repository. The specifications are at
https://intentset.org/specifications/ and the source at https://github.com/intentset/intentset.

## Licence

MIT
