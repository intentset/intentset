/**
 * The chat's corpus: everything the chat on intentset.org answers from, built
 * from the same sources and the same commit as the site (RULE-ASK-PUBLISHED-ONLY).
 *
 * One document per published page: the content pages, the specifications, the
 * agent guide and each record of the worked example, each with the address the
 * site serves it at, so an answer can link the page it came from. The text is
 * the page's Markset source after the site's tokens are substituted, without
 * its frontmatter, except for the example's records, which keep theirs because
 * the record format is what a reader asks about.
 *
 * Usage: node --conditions=intentset-source site/corpus.ts [--out <file>]
 * (default amplify/functions/ask/corpus.json, which is not committed: the
 * backend's deploy builds it from the commit it deploys).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  CONTENT_PAGES,
  canonicalUrl,
  contentSource,
  GUIDE_SCOPE,
  NOT_FOUND,
  SPECS,
  siteGuide,
  siteInputs,
  VERSION,
} from "./build.ts";
import { splitFrontmatter } from "./records.ts";

const root = resolve(import.meta.dirname, "..");

export const CORPUS_FORMAT = "intentset-chat-corpus/1";
export const DEFAULT_OUT = join(root, "amplify", "functions", "ask", "corpus.json");

/**
 * The corpus may not grow past this many estimated tokens without a decision:
 * the whole corpus is sent, cached, with every question, so its size is the
 * chat's cost per question.
 */
export const TOKEN_BUDGET = 100_000;

export type CorpusKind = "page" | "specification" | "guide" | "example";

export interface CorpusDocument {
  url: string;
  title: string;
  kind: CorpusKind;
  /** The repository file the text comes from. */
  source: string;
  text: string;
}

export interface Corpus {
  format: typeof CORPUS_FORMAT;
  /** The release of the repository the corpus was built from. */
  version: string;
  /** sha256 of the documents, so a stored answer names the corpus it came from. */
  hash: string;
  documents: CorpusDocument[];
}

/** Build the corpus. Deterministic: the same commit gives the same bytes. */
export async function buildCorpus(): Promise<Corpus> {
  const { metas, records, tokens } = await siteInputs();
  const documents: CorpusDocument[] = [];

  for (const [path, file] of CONTENT_PAGES) {
    if (path === NOT_FOUND) continue;
    const { body } = splitFrontmatter(await contentSource(file, tokens));
    documents.push(doc(path, firstHeading(body) ?? file, "page", `site/content/${file}`, body));
  }
  for (const [i, spec] of SPECS.entries()) {
    const file = `spec/${spec.file}`;
    const { body } = splitFrontmatter(await readFile(join(root, file), "utf8"));
    documents.push(doc(`specifications/${spec.slug}/index.html`, metas[i].title, "specification", file, body));
  }
  const guide = siteGuide();
  documents.push(
    doc(
      "guide/index.html",
      firstHeading(guide) ?? "Agent guide",
      "guide",
      "packages/cli/src/agents.ts",
      `The guide \`intentset init\` writes to .intentset/agents.md, with ${GUIDE_SCOPE} where a repository's scope goes.\n\n${guide}`,
    ),
  );
  for (const record of records) {
    const file = `examples/scheduling/${record.file}`;
    const text = await readFile(join(root, file), "utf8");
    documents.push(doc(`example/${record.id}/index.html`, `${record.id}: ${record.title}`, "example", file, text));
  }

  documents.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  const hash = createHash("sha256").update(JSON.stringify(documents)).digest("hex");
  return { format: CORPUS_FORMAT, version: VERSION, hash, documents };
}

function doc(path: string, title: string, kind: CorpusKind, source: string, text: string): CorpusDocument {
  // Fixed key order, so JSON.stringify, and so the hash, is stable.
  return { url: canonicalUrl(path), title: title.trim(), kind, source, text: text.trim() };
}

function firstHeading(markdown: string): string | null {
  const m = /^#[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(markdown);
  return m ? m[1] : null;
}

/**
 * A rough token count, about four characters to a token: enough to hold the
 * corpus to its budget, not to bill by. The API's own count is the measure.
 */
export function estimateTokens(corpus: Corpus): number {
  return Math.ceil(corpus.documents.reduce((n, d) => n + d.title.length + d.text.length, 0) / 4);
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { out: { type: "string" } } });
  const out = resolve(values.out ?? DEFAULT_OUT);
  const corpus = await buildCorpus();
  const estimate = estimateTokens(corpus);
  if (estimate > TOKEN_BUDGET) {
    throw new Error(`The corpus is about ${estimate} tokens, over its budget of ${TOKEN_BUDGET}.`);
  }
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(corpus, null, 2)}\n`);
  console.log(`${corpus.documents.length} documents, about ${estimate} tokens, ${corpus.hash.slice(0, 12)} → ${out}`);
}
