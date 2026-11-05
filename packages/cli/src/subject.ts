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

/** Where run records are read from when no --evidence is given. Local output: not to be committed. */
export const EVIDENCE_DIR = ".intentset/evidence";

/**
 * The run records under EVIDENCE_DIR are the toolchain's own output, never part of a subject, so a change to them
 * says nothing about evidence and is left out of what `changedSince` answers: EVID005 would otherwise list the file
 * `evidence import --out` has just written, until it is ignored or committed.
 */
function outsideEvidence(paths: string[] | null): string[] | null {
  return paths === null ? null : paths.filter((path) => path !== EVIDENCE_DIR && !path.startsWith(`${EVIDENCE_DIR}/`));
}

/** The binding in force: the option, else the configuration, else the default (Core §8). */
export function bindingFor(repo: Repository, graph: Graph, given: EvidenceBinding | undefined): BindingDecision {
  return resolveBinding(given ?? repo.config.evidence.binding, hasSliceClaims(graph));
}

/** The architecture's resolution over the tree, reading file contents from disk. */
export function sourceFor(repo: Repository, graph: Graph, tree: Tree): SubjectSource {
  return subjectSource(graph, repo.registries, tree, {
    globalInputs: repo.config.evidence.globalInputs,
    resources: repo.config.evidence.resources,
    dependencies: repo.config.evidence.dependencies,
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
      if (!asked.has(commit)) asked.set(commit, outsideEvidence(changedSince(repo.root, commit)));
      return asked.get(commit) ?? null;
    },
  };
}
