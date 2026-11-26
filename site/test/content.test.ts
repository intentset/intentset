import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { main } from "@intentset/cli";
import { parseDocument } from "@markset-lang/parser";
import { build, CHAT_PAGES, CONTENT_PAGES, VERSION } from "../build.ts";

const root = resolve(import.meta.dirname, "..", "..");
const contentDir = join(root, "site", "content");

const dist = await mkdtemp(join(tmpdir(), "intentset-content-"));
await build(dist);
after(async () => {
  await rm(dist, { recursive: true, force: true });
});

function text(fragment: string): string {
  return fragment
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

test("every content page parses as Markset with no error diagnostics", async () => {
  const files = (await readdir(contentDir)).filter((f) => f.endsWith(".md")).sort();
  assert.deepEqual(
    files,
    [...CONTENT_PAGES, ...CHAT_PAGES].map(([, file]) => file).sort(),
    "site/content and CONTENT_PAGES with CHAT_PAGES name the same files",
  );
  for (const file of files) {
    const { diagnostics } = parseDocument(await readFile(join(contentDir, file), "utf8"));
    const errors = diagnostics.filter((d) => d.severity === "error");
    assert.deepEqual(errors, [], file);
  }
});

/** The pages the retired phrases are checked on. */
const RETIRED_PHRASE_PAGES = [
  "index.html",
  "start/index.html",
  "specifications/index.html",
  "markset/index.html",
  "roadmap/index.html",
  "about/index.html",
];

test("the status notes are on their pages, as callouts, and none still says the toolchain is unbuilt", async () => {
  const notes: Array<[string, string]> = [
    [
      "index.html",
      `The specifications are ready for review. The reference toolchain, version ${VERSION}, is published to try them against.`,
    ],
    ["index.html", "Illustrative model. These links describe the proposed structure, not a live verification report."],
    [
      "start/index.html",
      `The reference toolchain is an early release, at ${VERSION}. The architecture check needs TypeScript 7, which the CLI names as a peer dependency: npm installs it beside the CLI and leaves your repository's own TypeScript alone, while pnpm gives the CLI the TypeScript your repository has, so on one earlier than 7 the checks that read source (the architecture check, validate at L2 and above, review) cannot run; init and validate at L1 still do. There, run the toolchain without installing it, as pnpm dlx --package=@intentset/cli --package=typescript@7 intentset, or with npm as npx -p @intentset/cli -p typescript@7 intentset.`,
    ],
    [
      "specifications/index.html",
      `All six documents are drafts, each with a dated revision. Core §1 says what a change to them means, and the changelog records every one. The TypeScript reference implementation implements them, and its conformance suite is published for other implementations. The reference toolchain is at ${VERSION} on npm.`,
    ],
    [
      "markset/index.html",
      "The reference publisher pins Markset 0.4.1 and validates every document it generates with Markset before writing it.",
    ],
  ];
  for (const [page, note] of notes) {
    const html = await readFile(join(dist, page), "utf8");
    // Inline code becomes a space when tags are stripped, so close up the space before punctuation.
    const callouts = [...html.matchAll(/<div class="ms-callout-body">([\s\S]*?)<\/div>/g)].map((m) =>
      text(m[1]).replace(/\s+([,.;:])/g, "$1"),
    );
    assert.ok(callouts.includes(note), `${page}: no callout reads "${note}"`);
  }
  // Superseded on 2026-10-03, when 0.1 was published: none may come back.
  const retired = [
    "The reference toolchain is being designed",
    "There is no installation command",
    "The TypeScript reference implementation is planned",
    "before the reference publisher ships",
    "The planned publisher",
    "not yet presented as finished tools",
    "The working name is Intentset",
    // Superseded on 2026-10-04, when 0.3 was out and the export with it.
    "A first reference toolchain, version 0.1",
    "Version 0.1 is on npm",
    "the export contract arrives with 0.2",
    "A reference toolchain next",
    "All four documents",
    // The roadmap as a plan of the work, retired 2026-10-04.
    "Delivered in 0.1",
    "implementation roadmap",
    // Records written by hand, and 0.3, retired 2026-10-04.
    "manual adoption guide",
    "version 0.3",
    "at 0.3 on npm",
  ];
  for (const page of RETIRED_PHRASE_PAGES) {
    const body = text(await readFile(join(dist, page), "utf8"));
    for (const phrase of retired) assert.ok(!body.includes(phrase), `${page} still says "${phrase}"`);
  }
});

test("Home labels its illustrative change, and its failure excerpt is in the review command's own words", async () => {
  const html = await readFile(join(dist, "index.html"), "utf8");
  // The one illustrative change is always said to be invented (2026-11-25, the clarity plan's decision 3).
  assert.ok(
    text(html).includes("Illustrative · Lantern, an invented product · not a real event"),
    "the illustrative change's card keeps its label",
  );
  // The excerpt was run, not written (decision 5): each of its lines is one `intentset review` writes, so a change to
  // the command's words fails here until the excerpt is run again and requoted.
  const review = await readFile(join(root, "packages", "cli", "src", "commands", "review.ts"), "utf8");
  const slice = await readFile(join(root, "examples", "scheduling", "SLICE-ASMT-SCHEDULE.md"), "utf8");
  const title = /^ {2}title: (.+)$/m.exec(slice)?.[1];
  const excerpt = [...html.matchAll(/<pre><code class="language-text">([\s\S]*?)<\/code><\/pre>/g)]
    .map((m) => text(m[1]))
    .find((block) => block.startsWith("## Code changed"));
  assert.ok(excerpt, "Home quotes the failure");
  assert.match(review, /`## Code changed, records unchanged \(\$\{drifted\.length\}, \$\{open\} not acknowledged\)`/);
  assert.match(review, /`### \$\{item\.slice\}: \$\{item\.title\}`/);
  const notAcknowledged = "- Not acknowledged: update the records below, or say in a commit that no behavior changed.";
  assert.ok(review.includes(`"${notAcknowledged}"`));
  assert.equal(
    excerpt,
    [
      "## Code changed, records unchanged (1, 1 not acknowledged)",
      `### SLICE-ASMT-SCHEDULE: ${title}`,
      notAcknowledged,
    ].join(" "),
  );
});

/** The text of a rendered code block: tags dropped and entities decoded, whitespace kept. */
function codeText(fragment: string): string {
  return fragment
    .replace(/<[^>]+>/g, "")
    .replace(/&#x3C;/gi, "<")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Run this checkout's CLI in a directory, as the page's reader runs the published one. */
async function intentset(cwd: string, ...argv: string[]): Promise<{ code: number; out: string }> {
  let out = "";
  const code = await main(argv, { stdout: (s) => (out += s), stderr: (s) => (out += s), cwd });
  return { code, out };
}

test("How it works quotes review's drift failure as the CLI prints it, and both ways through pass as the page says", async () => {
  const page = await readFile(join(dist, "how-it-works", "index.html"), "utf8");
  const blocks = [...page.matchAll(/<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g)];
  const quoted = blocks.map(([, lang, body]) => [lang, codeText(body)] as const);
  const failure = quoted.find(([lang, body]) => lang === "text" && body.includes("Code changed, records unchanged"));
  assert.ok(failure, "the page quotes the drift section of a review");
  const diff = quoted.find(([lang]) => lang === "diff");
  assert.ok(diff, "the page shows the one-line rule change");
  const [removed, added] = ["-", "+"].map(
    (sign) =>
      diff[1]
        .split("\n")
        .find((line) => line.startsWith(sign))
        ?.slice(1) ?? "",
  );
  assert.match(page, /<code>Intentset-Unchanged: SLICE-ASMT-SCHEDULE<\/code>/, "the page shows the trailer it ran");

  // The scratch repository the caption describes: the example's records and its registry's data file on main, and one
  // file of the slice's code added on a branch.
  const repo = await mkdtemp(join(tmpdir(), "intentset-drift-"));
  try {
    const git = (...args: string[]) =>
      execFileSync(
        "git",
        ["-c", "user.name=Demo", "-c", "user.email=demo@example.com", "-c", "commit.gpgsign=false", ...args],
        { cwd: repo, stdio: ["ignore", "pipe", "pipe"] },
      );
    git("init", "-q", "-b", "main");
    assert.equal((await intentset(repo, "init", "--example", "--root", repo)).code, 0);
    await mkdir(join(repo, "amplify", "data"), { recursive: true });
    await writeFile(join(repo, "amplify", "data", "resource.ts"), "export const data = {};\n");
    git("add", "-A");
    git("commit", "-qm", "Lantern's records");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    git("checkout", "-qb", "loosen-release-time");
    const policies = join(repo, "src", "features", "assessment", "schedule", "domain", "policies");
    await mkdir(policies, { recursive: true });
    await writeFile(
      join(policies, "release-time.ts"),
      "export const GRACE_MS = 60 * 60 * 1000;\nexport const accepts = (requested: number, now: number) => requested > now - GRACE_MS;\n",
    );
    git("add", "-A");
    git("commit", "-qm", "Accept a release time up to an hour in the past");
    const review = ["review", "--base", "origin/main", "--fail-on-drift"];

    const failed = await intentset(repo, ...review);
    assert.equal(failed.code, 1, "the review fails, as the page says");
    assert.ok(failed.out.includes(failure[1]), `the quoted output is not what review prints:\n${failed.out}`);

    // The behavior changed: the rule's one line, as the page's diff has it.
    git("checkout", "-qb", "way-rule");
    const rule = join(repo, "product", "scheduling", "RULE-ASMT-FUTURE.md");
    const text = await readFile(rule, "utf8");
    assert.ok(text.includes(`\n${removed}\n`), "the diff's removed line is the rule's own sentence");
    await writeFile(rule, text.replace(removed, added));
    git("commit", "-qam", "Allow a release time up to an hour in the past");
    assert.equal((await intentset(repo, ...review)).code, 0, "updating the rule passes");
    const l4 = await intentset(repo, "validate", "--level", "L4");
    assert.match(l4.out, /KB-ASMT-SCHEDULE needs review: RULE-ASMT-FUTURE changed since review/, "the guide is held");

    // It did not: the trailer, on the branch that only changed code.
    git("checkout", "-q", "loosen-release-time");
    git("commit", "-q", "--allow-empty", "-m", "Refactor", "-m", "Intentset-Unchanged: SLICE-ASMT-SCHEDULE");
    const acknowledged = await intentset(repo, ...review);
    assert.equal(acknowledged.code, 0, "the trailer passes");
    assert.ok(acknowledged.out.includes("- Acknowledged: a commit since the base says this changes no behavior"));
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
