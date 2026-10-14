/**
 * Evidence binding in the CLI (Core §8): which binding is in force for a
 * session, and the subjects it judges by. The file reads are the repository's
 * own working tree, so a subject hashes what is on disk, uncommitted edits
 * included; `evidence import` refuses an uncommitted tree for the commit it
 * records, not for the subject.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { subjectSource } from "@intentset/architecture";
import type { EvidenceBinding, Graph } from "@intentset/core";
import {
  type BindingDecision,
  hasSliceClaims,
  resolveBinding,
  type Subject,
  type SubjectSource,
  subjectsFor,
} from "@intentset/verification";
import { changedSince } from "./git.ts";
import type { Repository } from "./repository.ts";
import type { Tree } from "./tree.ts";

/** The binding in force: the option, else the configuration, else the default (Core §8). */
export function bindingFor(repo: Repository, graph: Graph, given: EvidenceBinding | undefined): BindingDecision {
  return resolveBinding(given ?? repo.config.evidence.binding, hasSliceClaims(graph));
}

/** The architecture's resolution over the tree, reading file contents from disk. */
export function sourceFor(repo: Repository, graph: Graph, tree: Tree): SubjectSource {
  return subjectSource(graph, repo.registries, tree, {
    globalInputs: repo.config.evidence.globalInputs,
    readFile: (path) => {
      try {
        return readFileSync(join(repo.root, path));
      } catch {
        return undefined;
      }
    },
  });
}

export interface Subjects {
  subjects: Map<string, Subject>;
  source: SubjectSource;
  /** Files changed since a commit, asked of git once per commit. */
  changedSince: (commit: string) => string[] | null;
}

export function subjectsOf(repo: Repository, graph: Graph, tree: Tree): Subjects {
  const source = sourceFor(repo, graph, tree);
  const asked = new Map<string, string[] | null>();
  return {
    subjects: subjectsFor(graph, source),
    source,
    changedSince: (commit) => {
      if (!asked.has(commit)) asked.set(commit, changedSince(repo.root, commit));
      return asked.get(commit) ?? null;
    },
  };
}
