/**
 * The corpus as the function reads it: what site/corpus.ts writes to corpus.json beside this file at deploy. The
 * shape is repeated here rather than imported, because the site is composition and a slice does not import it.
 */
export interface CorpusDocument {
  url: string;
  title: string;
  kind: string;
  source: string;
  text: string;
}

export interface Corpus {
  format: "intentset-chat-corpus/1";
  version: string;
  hash: string;
  documents: CorpusDocument[];
}

export function checkCorpus(value: unknown): Corpus {
  const corpus = value as Corpus;
  if (
    corpus?.format !== "intentset-chat-corpus/1" ||
    !Array.isArray(corpus.documents) ||
    corpus.documents.length === 0
  ) {
    throw new Error("corpus.json is not an intentset-chat-corpus/1 file with documents; run pnpm run corpus");
  }
  return corpus;
}
