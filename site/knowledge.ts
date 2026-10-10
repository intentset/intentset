/**
 * The knowledge records of this repository's own model (product/model/) that
 * publication releases to the public, for the site's knowledge pages and the
 * chat's corpus (RULE-ASK-PUBLISHED-ONLY).
 *
 * Nothing here decides what is published. Each release is `intentset publish`
 * itself, run through the CLI's `main` for a public projection: once for every
 * combination of the product records and the audiences, releases, roles and
 * editions the registries declare, with no flags, since a reader of a public
 * site is entitled to none. A record is released when any of those
 * publications releases it, and its text is the body the publication wrote.
 * Publication denies by default (Core §9): a draft, retired, unreviewed,
 * non-public or changed-since-review record is released by none of them, so it
 * reaches neither the site nor the chat. A model that does not validate is
 * refused by the CLI, and the build fails rather than publishing around it.
 */
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Io, loadRepository, main } from "@intentset/cli";
import { type ExampleRecord, readRecord, readYaml, splitFrontmatter } from "./records.ts";

/** A knowledge record publication releases, as the site renders it. */
export interface PublishedKnowledge {
  /** The record as the site's card reads it; `file` is its repository-relative path. */
  record: ExampleRecord;
  /** The published body: the record's body, as the publication wrote it. */
  body: string;
  /** The record's file, absolute, for messages about it. */
  path: string;
}

/** The fixed publication time, so the same commit gives the same bytes. Only the body is read. */
const PUBLISHED_AT = "2026-01-01T00:00:00Z";

/** Every knowledge record a public publication releases from the model at `root`, sorted by ID. */
export async function publishedKnowledge(root: string): Promise<PublishedKnowledge[]> {
  const repo = loadRepository(root, "markset");
  if (!repo.configOk) throw new Error(`${root}: the Intentset configuration has errors`);
  const files = new Map<string, string>();
  const products: string[] = [];
  let knowledge = 0;
  for (const input of repo.inputs) {
    if (input.frontmatter === null) continue;
    const meta = readYaml(input.frontmatter.text).intentset;
    if (meta === null || typeof meta !== "object" || Array.isArray(meta)) continue;
    if (typeof meta.id !== "string") continue;
    files.set(meta.id, input.path);
    if (meta.type === "product") products.push(meta.id);
    if (meta.type === "knowledge") knowledge++;
  }
  // Without a knowledge record there is nothing to release, and no reason to run the CLI.
  if (knowledge === 0) return [];

  const { audiences, releases, roles, editions } = repo.registries;
  const bodies = new Map<string, string>();
  for (const product of products.sort())
    for (const audience of audiences)
      for (const release of releases)
        for (const role of roles)
          for (const edition of editions) {
            for (const [id, body] of await publishOnce(root, { audience, product, release, role, edition })) {
              bodies.set(id, body);
            }
          }

  const out: PublishedKnowledge[] = [];
  for (const id of [...bodies.keys()].sort()) {
    const file = files.get(id);
    if (file === undefined) throw new Error(`publish released ${id}, which no file in scope declares`);
    const path = join(root, file);
    out.push({ record: readRecord(file, await readFile(path, "utf8")), body: bodies.get(id) as string, path });
  }
  return out;
}

/** One public publication: the released IDs and their bodies. */
async function publishOnce(
  root: string,
  request: { audience: string; product: string; release: string; role: string; edition: string },
): Promise<Map<string, string>> {
  const out = await mkdtemp(join(tmpdir(), "intentset-knowledge-"));
  let stderr = "";
  const io: Io = { stdout: () => {}, stderr: (s) => (stderr += s), cwd: root };
  try {
    const code = await main(
      [
        "publish",
        "--root",
        root,
        "--visibility",
        "public",
        "--audience",
        request.audience,
        "--product",
        request.product,
        "--release",
        request.release,
        "--role",
        request.role,
        "--edition",
        request.edition,
        "--published-at",
        PUBLISHED_AT,
        "--out",
        out,
      ],
      io,
    );
    const written = await readdir(out);
    if (code === 2 || !written.includes("index.json")) {
      throw new Error(`intentset publish refused the site's public request (${JSON.stringify(request)}): ${stderr}`);
    }
    const index = JSON.parse(await readFile(join(out, "index.json"), "utf8")) as { published: string[] };
    const bodies = new Map<string, string>();
    for (const id of index.published) bodies.set(id, publishedBody(await readFile(join(out, `${id}.md`), "utf8")));
    return bodies;
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

/** A generated document's body: without its provenance frontmatter and the marker line after it. */
export function publishedBody(markset: string): string {
  return splitFrontmatter(markset)
    .body.replace(/^<!-- Generated by intentset publish from [^\n]*-->\r?\n/, "")
    .trim();
}
