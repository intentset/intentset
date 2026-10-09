import assert from "node:assert/strict";
import { test } from "node:test";
import { CHAT_PAGES, CONTENT_PAGES, canonicalUrl, NOT_FOUND, SPECS } from "../build.ts";
import { buildCorpus, CORPUS_FORMAT, estimateTokens, TOKEN_BUDGET } from "../corpus.ts";
import { loadRecords } from "../records.ts";

const corpus = await buildCorpus();
const urls = corpus.documents.map((d) => d.url);

test("the corpus is every published page: content pages, specifications, the guide and the example's records", async () => {
  const records = await loadRecords(new URL("../../examples/scheduling", import.meta.url).pathname);
  const expected = [
    ...[...CONTENT_PAGES, ...CHAT_PAGES].filter(([path]) => path !== NOT_FOUND).map(([path]) => path),
    ...SPECS.map((spec) => `specifications/${spec.slug}/index.html`),
    "guide/index.html",
    ...records.map((record) => `example/${record.id}/index.html`),
  ]
    .map(canonicalUrl)
    .sort();
  assert.deepEqual(urls, expected);
});

test("the corpus is deterministic, names its format and version, and its hash covers the documents", async () => {
  const again = await buildCorpus();
  assert.equal(JSON.stringify(again), JSON.stringify(corpus));
  assert.equal(corpus.format, CORPUS_FORMAT);
  assert.match(corpus.hash, /^[0-9a-f]{64}$/);
});

test("every document has a title and text, and no page keeps a token or its frontmatter", () => {
  for (const d of corpus.documents) {
    assert.ok(d.title.length > 0, `${d.url}: title`);
    assert.ok(d.text.length > 0, `${d.url}: text`);
    assert.doesNotMatch(d.text, /\{\{[\w.-]+\}\}/, `${d.url}: a token left over`);
    if (d.kind !== "example") assert.doesNotMatch(d.text, /^---\r?\n/, `${d.url}: frontmatter`);
  }
});

test("the corpus stays inside its token budget, since all of it is sent with every question", () => {
  assert.ok(estimateTokens(corpus) <= TOKEN_BUDGET, `about ${estimateTokens(corpus)} tokens`);
});
