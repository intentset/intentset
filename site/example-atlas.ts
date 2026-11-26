/**
 * The shop's Atlas, exactly as `intentset serve` shows it (Gary, 2026-11-26): the Atlas's own pages, look and
 * navigation, published under /example/atlas/ rather than wrapped in the site's shell, so a reader opening it sees what
 * a team sees on its own machine. Until then the site rendered each Atlas page inside its own shell, which showed the
 * pages but not the tool.
 *
 * It is built the way a team would get it: a scratch repository holding the shop's records under product/shop/, its
 * code and its tests; the tests run with node:test's TAP reporter; their report imported as run records; then the Atlas
 * built from that repository at L3, through the same `atlasOf` the command uses, with the `example` notice. One pass is
 * made stale honestly: after the tests run, a later commit changes the sign-in code, so the sign-in check's pass no
 * longer holds (subject binding, Core §8) until the tests run again. The rule that reset links work once has no test,
 * which is the shop's real gap, and the sign-in behavior is left a draft.
 *
 * Deterministic: the commits carry fixed author and committer dates, the run records fixed start and finish times, and
 * nothing reads the clock or the network, so the same commit of this repository gives the same bytes.
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { atlasOf, type Io, main, openSession } from "@intentset/cli";

/** Where the shop's Atlas is published on the site. */
export const ATLAS_ROOT = "example/atlas";

/** The fixed moments the example is built at, so the build is the same every time. */
export const EXAMPLE_TIMES = {
  firstCommit: "2026-11-24T09:00:00Z",
  testsStarted: "2026-11-24T09:05:00Z",
  testsFinished: "2026-11-24T09:05:02Z",
  laterCommit: "2026-11-25T14:00:00Z",
  today: "2026-11-26",
} as const;

/** The file the later commit changes, and the change: a refactor of the lockout's parameter name. */
export const STALE_FILE = "src/features/accounts/sign-in/policies/lockout.ts";

/** A record's page in the Atlas, from the site's root. */
export function atlasRecordPath(id: string): string {
  return `${ATLAS_ROOT}/records/${id}.html`;
}

async function files(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) out.push(relative(dir, join(entry.parentPath, entry.name)));
  }
  return out.sort();
}

/** The shop's Atlas: every file `intentset serve --out` would write, by path, for the example in `exampleDir`. */
export async function shopAtlas(exampleDir: string): Promise<Map<string, string>> {
  const repo = await mkdtemp(join(tmpdir(), "intentset-shop-atlas-"));
  try {
    const git = (date: string, ...args: string[]) =>
      execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
        cwd: repo,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "Shop",
          GIT_AUTHOR_EMAIL: "shop@example.invalid",
          GIT_COMMITTER_NAME: "Shop",
          GIT_COMMITTER_EMAIL: "shop@example.invalid",
          GIT_AUTHOR_DATE: date,
          GIT_COMMITTER_DATE: date,
        },
      });
    let output = "";
    const io: Io = { stdout: (s) => (output += s), stderr: (s) => (output += s), cwd: repo };
    const run = async (...argv: string[]) => {
      output = "";
      const code = await main(argv, io);
      if (code !== 0) throw new Error(`intentset ${argv[0]} failed building the shop's Atlas:\n${output}`);
    };

    git(EXAMPLE_TIMES.firstCommit, "init", "-q", "-b", "main");
    await run("init", "--repository", "example/shop");
    await cp(join(exampleDir, "registries.yaml"), join(repo, ".intentset", "registries.yaml"));
    await mkdir(join(repo, "product", "shop"), { recursive: true });
    for (const name of (await readdir(exampleDir)).filter((n) => n.endsWith(".md")).sort()) {
      await cp(join(exampleDir, name), join(repo, "product", "shop", name));
    }
    await cp(join(exampleDir, "src"), join(repo, "src"), { recursive: true });
    await writeFile(join(repo, ".gitignore"), "reports/\n.intentset/evidence/\n");
    git(EXAMPLE_TIMES.firstCommit, "add", "-A");
    git(EXAMPLE_TIMES.firstCommit, "commit", "-qm", "The shop's accounts, with their records, code and tests");

    // The tests, run as a team's CI would, and their report imported as run records bound to that commit.
    const tests = (await files(join(repo, "src"))).filter((f) => f.endsWith(".test.ts")).map((f) => join("src", f));
    // Run as a fresh test run: under a test runner (the site's own tests build the site), node:test tells a child it
    // is a subtest through NODE_TEST_CONTEXT and it would report to that runner rather than print TAP.
    const { NODE_TEST_CONTEXT: _, ...env } = process.env;
    const tap = execFileSync(process.execPath, ["--test", "--test-reporter=tap", ...tests], {
      cwd: repo,
      encoding: "utf8",
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (!/^# pass \d+$/m.test(tap) || !/^# fail 0$/m.test(tap))
      throw new Error(`the shop's tests did not pass:\n${tap}`);
    await mkdir(join(repo, "reports"), { recursive: true });
    await writeFile(join(repo, "reports", "node-test.tap"), tap);
    await run(
      "evidence",
      "import",
      "--from",
      "node-tap",
      "reports/node-test.tap",
      "--out",
      ".intentset/evidence/ci.json",
      "--product",
      "PRD-SHOP",
      "--release",
      "v1",
      "--started-at",
      EXAMPLE_TIMES.testsStarted,
      "--finished-at",
      EXAMPLE_TIMES.testsFinished,
    );

    // A later change to the sign-in code, after the tests ran: its pass no longer holds until they run again.
    const lockout = join(repo, STALE_FILE);
    const before = await readFile(lockout, "utf8");
    const after = before.replaceAll("failedAt", "failures");
    if (after === before) throw new Error(`the shop's ${STALE_FILE} no longer has the name the later commit renames`);
    await writeFile(lockout, after);
    git(EXAMPLE_TIMES.laterCommit, "commit", "-qam", "Name the lockout's failed attempts plainly");

    const session = openSession("serve", { carrier: "markset", level: "L3", today: EXAMPLE_TIMES.today }, io);
    if (typeof session === "number") throw new Error(`the shop's repository could not be read:\n${output}`);
    return atlasOf(session, { notice: "example" });
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
}
