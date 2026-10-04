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
 * status or prose. Two documents tipping one ID: the lower knowledge ID wins.
 */
import type { Artifact, Graph, Visibility } from "@intentset/core";
import { compareStrings } from "./diagnostic.ts";
import type { Snapshot } from "./project.ts";
import type { PublicationRequest } from "./request.ts";

export const HELP_PROFILE = "intentset/help/0.1";
/** The file's name beside the published documents. */
export const HELP_FILE = "help.json";

export interface HelpKnowledge {
  id: string;
  title: string;
  /** `<ID>.md`, the published document. */
  path: string;
}

export interface HelpTip {
  /** The tip as written on the knowledge record. */
  text: string;
  /** The knowledge the tip comes from, one of `knowledge`. */
  knowledge: string;
}

/** `help.json`, in the order it is written. */
export interface HelpFile {
  profile: typeof HELP_PROFILE;
  derived: true;
  projection: Visibility;
  snapshot: Snapshot;
  audience: string;
  availability: { product: string; release: string; role: string; edition: string; flags: string[] };
  publishedAt: string;
  /** One entry per published document, sorted by ID. */
  knowledge: HelpKnowledge[];
  /** By explained ID, sorted. */
  tips: Record<string, HelpTip>;
}

export interface HelpOptions {
  snapshot: Snapshot;
  publishedAt: string;
}

/** The help file for the documents a run published, which are given by knowledge ID. */
export function helpFile(
  graph: Graph,
  publishedIds: readonly string[],
  request: PublicationRequest,
  options: HelpOptions,
): HelpFile {
  const ids = [...publishedIds].sort(compareStrings);
  const knowledge: HelpKnowledge[] = [];
  const tips: Record<string, HelpTip> = {};
  const claimed = new Map<string, HelpTip>();
  for (const id of ids) {
    const artifact = graph.artifacts.get(id) as Artifact;
    knowledge.push({ id, title: artifact.meta.title, path: `${id}.md` });
    for (const key of Object.keys(artifact.meta.tips ?? {}).sort(compareStrings)) {
      // ids are ascending, so the first claim on a key is the lowest knowledge ID.
      if (claimed.has(key)) continue;
      claimed.set(key, { text: (artifact.meta.tips as Record<string, string>)[key], knowledge: id });
    }
  }
  for (const key of [...claimed.keys()].sort(compareStrings)) tips[key] = claimed.get(key) as HelpTip;
  return {
    profile: HELP_PROFILE,
    derived: true,
    projection: request.visibility,
    snapshot: { commit: options.snapshot.commit, graphHash: options.snapshot.graphHash },
    audience: request.audience,
    availability: {
      product: request.product,
      release: request.release,
      role: request.role,
      edition: request.edition,
      flags: [...new Set(request.flags)].sort(compareStrings),
    },
    publishedAt: options.publishedAt,
    knowledge,
    tips,
  };
}
