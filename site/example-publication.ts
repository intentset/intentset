/**
 * The worked example, published: what `intentset publish` writes for the one
 * projection its knowledge is written for, so the walkthrough's last act can
 * show the generated document and the help file instead of describing them.
 *
 * The example is copied into a temporary repository and published through the
 * CLI's own `main`, as site/knowledge.ts publishes this repository's model:
 * nothing here decides what is released. The knowledge is approved and
 * reviewed against its sources as they are, so publication releases it. When a
 * source changes and the review is not redone, publication excludes the record
 * and this throws with publication's own reasons, so the site is never built
 * with an empty help file where the walkthrough promises tips.
 */
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Io, main } from "@intentset/cli";
import { PUBLISHED_AT } from "./knowledge.ts";

/** The publication request the example's knowledge is written for: a teacher on Lantern's pilot release. */
export const EXAMPLE_REQUEST = {
  visibility: "customer",
  audience: "teacher",
  product: "PRD-LANTERN",
  release: "pilot-1",
  role: "teacher",
  edition: "standard",
} as const;

/** The knowledge record the example publishes. */
export const EXAMPLE_KNOWLEDGE = "KB-ASMT-SCHEDULE";

export interface ExamplePublication {
  /** The generated document, `KB-ASMT-SCHEDULE.md`, exactly as publication wrote it. */
  document: string;
  /** `help.json`, exactly as publication wrote it. */
  help: string;
}

/** Publish the example at `exampleDir` and return the two files the walkthrough shows. */
export async function publishExample(exampleDir: string): Promise<ExamplePublication> {
  const repo = await mkdtemp(join(tmpdir(), "intentset-example-"));
  try {
    await cp(exampleDir, join(repo, "product"), { recursive: true });
    await mkdir(join(repo, ".intentset"));
    await writeFile(
      join(repo, ".intentset", "config.yaml"),
      'repository: "example/scheduling"\nscope:\n  - "product/**/*.md"\nregistries: "product/registries.yaml"\n',
    );
    const out = join(repo, "published");
    let stdout = "";
    let stderr = "";
    const io: Io = { stdout: (s) => (stdout += s), stderr: (s) => (stderr += s), cwd: repo };
    const code = await main(
      [
        "publish",
        "--root",
        repo,
        ...Object.entries(EXAMPLE_REQUEST).flatMap(([name, value]) => [`--${name}`, value]),
        "--published-at",
        PUBLISHED_AT,
        "--out",
        out,
      ],
      io,
    );
    if (code !== 0) throw new Error(`intentset publish refused the worked example:\n${stdout}${stderr}`);
    const index = JSON.parse(await readFile(join(out, "index.json"), "utf8")) as { published: string[] };
    if (!index.published.includes(EXAMPLE_KNOWLEDGE)) {
      throw new Error(
        `intentset publish released nothing from the worked example, and the walkthrough shows what it writes for ${EXAMPLE_KNOWLEDGE}. ` +
          `If a source changed, review the knowledge against it and update its review pins.\n${stdout}${stderr}`,
      );
    }
    return {
      document: await readFile(join(out, `${EXAMPLE_KNOWLEDGE}.md`), "utf8"),
      help: await readFile(join(out, "help.json"), "utf8"),
    };
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
}
