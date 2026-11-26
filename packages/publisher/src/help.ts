/**
 * The help file (spec/publication.md §5): every tip of every document
 * published in a run, keyed by the ID it explains, for a product's runtime to
 * show beside the control that delivers that behavior. Written beside the
 * documents whenever the request is accepted, so a runtime can rely on it.
 *
 * What gates a tip is what gated its document: a tip is written exactly when
 * its knowledge was published in the same run. The key is the explained
 * artifact's ID whatever that artifact's visibility, because a product that
 * binds a control to the ID has already written it where the same reader can
 * see it, and nothing else of that artifact is carried: never its title, path,
 * status or prose. Two documents tipping one ID: a current document's tip wins
 * over one from a document kept under review, then the lower knowledge ID
 * wins, whichever of the request's audiences or roles admitted each.
 *
 * A document kept under review (publication §3, ADR 0027) is listed with its
 * `under-review/` path and `underReview: true`, and so is each tip it
 * contributes, except a tip keyed to a rule, which is held back: a rule's tip
 * is the reason a product gives for a refusal, and a reason that may be wrong
 * is worse than none. A rule ID whose only tips were held back is listed in
 * `withheldForReview`.
 *
 * Like every file of its publication, it is for one reader (ADR 0029): its
 * `audience` and `availability` name the request's audiences, roles and flags
 * as sorted lists, held all-of. Members are written in publication §5's table
 * order, every collection always written.
 *
 * It carries no snapshot: the run names the commit and graph hash it was
 * published from in the snapshot file alone (snapshot.ts, ADR 0021), so this
 * file's bytes change only when a tip, a published document or the request does.
 */
import type { Artifact, Graph, Visibility } from "@intentset/core";
import { compareStrings } from "./diagnostic.ts";
import { UNDER_REVIEW_DIR } from "./generate.ts";
import { type CheckedRequest, type PublicationRequest, asList } from "./request.ts";

export const HELP_PROFILE = "intentset/help/0.3";
/** The file's name beside the published documents. */
export const HELP_FILE = "help.json";

export interface HelpKnowledge {
  id: string;
  title: string;
  /** `<ID>.md`, the published document, or `under-review/<ID>.md` for a document kept under review. */
  path: string;
  /** Only on a document kept under review (publication §5); never written as false. */
  underReview?: true;
}

export interface HelpTip {
  /** The tip as written on the knowledge record. */
  text: string;
  /** The knowledge the tip comes from, one of `knowledge`. */
  knowledge: string;
  /** Exactly when its knowledge entry carries it. */
  underReview?: true;
}

/** `help.json`, in the order it is written. */
export interface HelpFile {
  profile: typeof HELP_PROFILE;
  derived: true;
  projection: Visibility;
  /** The request's audiences, sorted: the reader is in every one. */
  audience: string[];
  /** The request's roles and flags, sorted: the reader holds every one. */
  availability: { product: string; release: string; role: string[]; edition: string; flags: string[] };
  publishedAt: string;
  /** One entry per published document, sorted by ID. */
  knowledge: HelpKnowledge[];
  /** By explained ID, sorted. */
  tips: Record<string, HelpTip>;
  /** Rule IDs whose tips were held back because their document is kept under review and no current one tips them. */
  withheldForReview: string[];
}

export interface HelpOptions {
  publishedAt: string;
}

/**
 * The help file for the documents a run published, given by knowledge ID: the current documents, then the documents
 * kept under review. A request with one `audience` or `role` reads it as a list of one; nothing else of it is checked.
 */
export function helpFile(
  graph: Graph,
  publishedIds: readonly string[],
  request: PublicationRequest | CheckedRequest,
  options: HelpOptions,
  keptIds: readonly string[] = [],
): HelpFile {
  const current = [...publishedIds].sort(compareStrings);
  const kept = [...keptIds].sort(compareStrings);
  const knowledge: HelpKnowledge[] = [];
  const tips: Record<string, HelpTip> = {};
  const claimed = new Map<string, HelpTip>();
  const held = new Set<string>();
  for (const id of current) {
    const artifact = graph.artifacts.get(id) as Artifact;
    knowledge.push({ id, title: artifact.meta.title, path: `${id}.md` });
    for (const key of Object.keys(artifact.meta.tips ?? {}).sort(compareStrings)) {
      // ids are ascending, so the first claim on a key is the lowest knowledge ID.
      if (claimed.has(key)) continue;
      claimed.set(key, { text: (artifact.meta.tips as Record<string, string>)[key], knowledge: id });
    }
  }
  // A current document's tip wins over a kept one's, whatever the IDs; a rule's tip from a kept document is held back.
  for (const id of kept) {
    const artifact = graph.artifacts.get(id) as Artifact;
    knowledge.push({ id, title: artifact.meta.title, path: `${UNDER_REVIEW_DIR}/${id}.md`, underReview: true });
    for (const key of Object.keys(artifact.meta.tips ?? {}).sort(compareStrings)) {
      if (claimed.has(key)) continue;
      if (graph.artifacts.get(key)?.meta.type === "rule") {
        held.add(key);
        continue;
      }
      claimed.set(key, { text: (artifact.meta.tips as Record<string, string>)[key], knowledge: id, underReview: true });
    }
  }
  knowledge.sort((a, b) => compareStrings(a.id, b.id));
  for (const key of [...claimed.keys()].sort(compareStrings)) tips[key] = claimed.get(key) as HelpTip;
  const withheldForReview = [...held].filter((key) => !claimed.has(key)).sort(compareStrings);
  return {
    profile: HELP_PROFILE,
    derived: true,
    projection: request.visibility,
    audience: [...new Set(asList(request.audience))].sort(compareStrings),
    availability: {
      product: request.product,
      release: request.release,
      role: [...new Set(asList(request.role))].sort(compareStrings),
      edition: request.edition,
      flags: [...new Set(request.flags)].sort(compareStrings),
    },
    publishedAt: options.publishedAt,
    knowledge,
    tips,
    withheldForReview,
  };
}
