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

In CI, after the tests, turn the report into run records bound to this commit and graph:

```sh
npx intentset evidence import --from vitest reports/vitest.json --out .intentset/evidence/ci.json \
  --product PRD-X --release <label>
npx intentset validate --level L3 --product PRD-X --release <label>
```

From code:

```ts
import { readFile } from "node:fs/promises";
import { readRunRecords } from "@intentset/verification";

const path = ".intentset/evidence/ci.json";
const { records, diagnostics } = readRunRecords(JSON.parse(await readFile(path, "utf8")), path);
// a record with any problem is reported as EVID001 and left out, so it never counts as evidence
```

Only a `pass` at the assessed commit and graph hash is current; keep run records out of the commit they assess.

## Learn more

Part of [Intentset](https://intentset.org/), which keeps product intent connected to the code that delivers it and the
checks that verify it, as readable Markdown files in a repository. The specifications are at
https://intentset.org/specifications/ and the source at https://github.com/intentset/intentset.

## Licence

MIT
