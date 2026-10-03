/**
 * Customer tools (Core §9, §10): published knowledge only. This module is
 * handed a publication (the publisher's documents and index) and its
 * retrieval chunks, and nothing else: it never receives the engineering
 * graph, so no tool, argument or bug in it can reach an internal record. An
 * ID that is not in the publication index gets the same answer whether or not
 * it exists anywhere else, because here it does not.
 *
 * Authorization happens twice, as Core §9 requires: before retrieval, every
 * chunk considered must belong to a document the index published under a
 * public or customer projection, with that document's provenance unchanged;
 * and again before the response is assembled, over the hits themselves.
 * Results cite the source IDs the publication block names, never the ones it
 * withheld (it counts those), and the snapshot the publication was made from.
 */
import { canonicalJson, compareStrings } from "@intentset/core";
import {
  type Chunk,
  type PublicationIndex,
  type PublicationMeta,
  type PublishedDocument,
  toChunks,
} from "@intentset/publisher";
import { READ_ONLY, result, stringArgument, type Tool, type ToolResult } from "./tool.ts";

/** What customer mode is given: a publisher PublishResult's documents and index. */
export interface CustomerPublication {
  documents: readonly PublishedDocument[];
  index: PublicationIndex;
}

export const CUSTOMER_PROJECTIONS: readonly string[] = ["public", "customer"];
export const RESULT_LIMIT = 10;
/** The one answer for any ID the publication does not hold. It names nothing, not even the ID asked for. */
export const NOT_AVAILABLE = "No published knowledge with that ID is available.";

export function customerTools(publication: CustomerPublication, suppliedChunks?: readonly Chunk[]): Tool[] {
  const { index } = publication;
  const request = index.request;
  if (request === null) throw new Error("mcp: customer mode needs a publication whose request was not refused");
  if (!CUSTOMER_PROJECTIONS.includes(request.visibility)) {
    throw new Error(
      `mcp: customer mode serves a public or customer projection only, and this publication is ${request.visibility}`,
    );
  }
  const published = new Set(index.published);
  const documents = new Map<string, PublishedDocument>();
  for (const document of publication.documents) {
    if (!published.has(document.id) || document.publication.projection !== request.visibility) {
      throw new Error(`mcp: document ${document.id} is not in the publication index under its projection`);
    }
    if (canonicalJson(document.publication.snapshot) !== canonicalJson(index.snapshot)) {
      throw new Error(`mcp: document ${document.id} was published from another snapshot than the index names`);
    }
    documents.set(document.id, document);
  }
  const provenance = new Map([...documents].map(([id, d]) => [id, canonicalJson(d.publication)]));

  /** Core §9 authorization: published here, under a customer-safe projection, with its provenance intact. */
  const authorized = (documentId: string, block: PublicationMeta): boolean =>
    published.has(documentId) &&
    CUSTOMER_PROJECTIONS.includes(block.projection) &&
    provenance.get(documentId) === canonicalJson(block);

  const chunks = [...(suppliedChunks ?? toChunks([...documents.values()]))];
  for (const chunk of chunks) {
    if (!authorized(chunk.document, chunk.publication)) {
      throw new Error(`mcp: chunk ${chunk.id} does not belong to a document in the publication index`);
    }
  }

  const header = () => ({
    snapshot: { commit: index.snapshot.commit, graphHash: index.snapshot.graphHash },
    projection: request.visibility,
    audience: request.audience,
    availability: {
      product: request.product,
      release: request.release,
      role: request.role,
      edition: request.edition,
      flags: request.flags,
    },
  });

  const search: Tool = {
    definition: {
      name: "knowledge_search",
      title: "Search published knowledge",
      description:
        "Passages of published knowledge for this audience and release. Every word of the query must appear. " +
        `At most ${RESULT_LIMIT} passages, each citing the sources its document names and the snapshot it was ` +
        "published from. An empty result means there is no published answer; say so rather than guess.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "Words to find, case-insensitively." } },
        required: ["query"],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
    },
    call(args) {
      const query = stringArgument("knowledge_search", args, "query");
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      // Before retrieval: only chunks of authorized documents are candidates at all.
      const candidates = chunks.filter((chunk) => authorized(chunk.document, chunk.publication));
      const matches = candidates
        .filter((chunk) => {
          const haystack = [chunk.title, chunk.heading ?? "", chunk.text].join("\n").toLowerCase();
          return terms.every((term) => haystack.includes(term));
        })
        .sort(compareChunks);
      // Before response assembly: authorize the hits again, then cite from their own blocks.
      const hits = matches.filter((chunk) => authorized(chunk.document, chunk.publication)).slice(0, RESULT_LIMIT);
      return result({
        ...header(),
        query,
        matched: matches.length,
        shown: hits.length,
        results: hits.map((chunk) => ({
          passage: chunk.id,
          document: chunk.document,
          title: chunk.title,
          heading: chunk.heading,
          text: chunk.text,
          citation: citation(chunk.publication),
        })),
        ...(hits.length === 0
          ? { note: "No published knowledge matches. There is nothing to answer from; do not answer from elsewhere." }
          : {}),
      });
    },
  };

  const get: Tool = {
    definition: {
      name: "knowledge_get",
      title: "Get a published document",
      description:
        "One published knowledge document as Markset, with its provenance block, by the ID the publication index " +
        "lists. Any other ID is not available.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "A published knowledge ID." } },
        required: ["id"],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
    },
    call(args): ToolResult {
      const id = stringArgument("knowledge_get", args, "id");
      const document = documents.get(id);
      if (document === undefined || !authorized(document.id, document.publication)) {
        return result({ ...header(), error: NOT_AVAILABLE }, true);
      }
      return result({
        ...header(),
        id: document.id,
        path: document.path,
        citation: citation(document.publication),
        markset: document.markset,
      });
    },
  };

  return [get, search];
}

/** The provenance a customer may see: the sources the block names, the count it withheld, review and snapshot. */
function citation(block: PublicationMeta) {
  return {
    source: { id: block.source.id, revision: block.source.revision, sourceHash: block.source.sourceHash },
    sources: block.sources.map((s) => ({ id: s.id, revision: s.revision, sourceHash: s.sourceHash })),
    withheldSources: block.withheldSources,
    reviewer: block.reviewer,
    reviewedAt: block.reviewedAt,
    publishedAt: block.publishedAt,
    snapshot: { commit: block.snapshot.commit, graphHash: block.snapshot.graphHash },
  };
}

/** Document ID, then passage number as a number, so KB-X/10 follows KB-X/9. */
function compareChunks(a: Chunk, b: Chunk): number {
  const n = (chunk: Chunk) => Number(chunk.id.slice(chunk.id.lastIndexOf("/") + 1));
  return compareStrings(a.document, b.document) || n(a) - n(b) || compareStrings(a.id, b.id);
}
