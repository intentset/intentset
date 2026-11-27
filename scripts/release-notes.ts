/**
 * Prints one version's section of CHANGELOG.md, without its `## ` heading, so a GitHub Release can carry it as its
 * notes (`.github/workflows/release.yml`), and so a tag that exists already can be given one from the same text:
 *
 *   pnpm run release:notes <version> > notes.md
 *
 * `v0.18.0` and `0.18.0` name the same version. Exits 1, printing nothing, when the changelog has no such entry.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { entryBody } from "./changelog.ts";

/** The section's body followed by one newline. Throws when `version` has no entry or is not a version. */
export function releaseNotes(changelog: string, version: string): string {
  const bare = version.replace(/^v/u, "");
  if (!/^\d+\.\d+\.\d+(-[a-z]+\.\d+)?$/u.test(bare)) throw new Error(`${version} is not a version`);
  return `${entryBody(changelog, bare)}\n`;
}

function main(argv: string[]): number {
  const [version, ...extra] = argv;
  if (!version || extra.length > 0) {
    process.stderr.write("usage: pnpm run release:notes <version>\n");
    return 2;
  }
  const root = resolve(import.meta.dirname, "..");
  try {
    process.stdout.write(releaseNotes(readFileSync(join(root, "CHANGELOG.md"), "utf8"), version));
  } catch (error) {
    process.stderr.write(`release:notes: ${(error as Error).message}\n`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
