import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { entryBody, parseChangelog, splitEntry, summaryProblems } from "../scripts/changelog.ts";
import { releaseNotes } from "../scripts/release-notes.ts";

const root = resolve(import.meta.dirname, "..");

const CHANGELOG = `# Changelog

Preamble.

## Unreleased

### Added

- **New.** (#2)

### Details

**New.** Specifications, suite and export did not move.

## 1.2.3 — 2026-01-01

**Old.** Specifications moved.

- **Item.**

## 1.2.3-beta.1 — 2025-12-01

**Beta.**
`;

test("the changelog is read as entries: version, date, body, and the summary when there is one", () => {
  const [unreleased, release, beta] = parseChangelog(CHANGELOG);
  assert.equal(unreleased?.version, "Unreleased");
  assert.equal(unreleased?.date, null);
  assert.equal(unreleased?.summary, "### Added\n\n- **New.** (#2)");
  assert.equal(release?.version, "1.2.3");
  assert.equal(release?.date, "2026-01-01");
  assert.equal(release?.summary, null, "an entry before the convention has no summary");
  assert.equal(beta?.version, "1.2.3-beta.1");
  assert.throws(() => parseChangelog("## Next\n"), /"Next" is not a release heading/u);
  assert.deepEqual(splitEntry("### Fixed\n\n- x"), ["### Fixed\n\n- x", ""]);
});

test("release:notes prints a version's body without its heading, with or without the v", () => {
  assert.equal(releaseNotes(CHANGELOG, "1.2.3"), "**Old.** Specifications moved.\n\n- **Item.**\n");
  assert.equal(releaseNotes(CHANGELOG, "v1.2.3-beta.1"), "**Beta.**\n");
  assert.throws(() => releaseNotes(CHANGELOG, "9.9.9"), /no entry for 9\.9\.9/u);
  assert.throws(() => releaseNotes(CHANGELOG, "Unreleased"), /not a version/u);
  assert.throws(() => entryBody(CHANGELOG, "1.2"), /no entry for 1\.2/u);
});

test("release:notes reads this repository's changelog and fails on a version it lacks", async () => {
  const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version: string };
  const out = execFileSync("node", ["--conditions=intentset-source", "scripts/release-notes.ts", `v${version}`], {
    cwd: root,
    encoding: "utf8",
  });
  assert.ok(out.endsWith("\n") && !/^## /u.test(out), "no heading, one trailing newline");
  assert.deepEqual(summaryProblems(out.trim()), []);
  assert.throws(
    () =>
      execFileSync("node", ["--conditions=intentset-source", "scripts/release-notes.ts", "0.0.1"], {
        cwd: root,
        stdio: "pipe",
      }),
    (error: { status: number; stderr: Buffer }) =>
      error.status === 1 && /no entry for 0\.0\.1/u.test(String(error.stderr)),
  );
});
