/**
 * `intentset graph --format json` (Core §12): the `intentset/export/0.1`
 * envelope over the validated repository. Printed to stdout, or written to
 * the one file `--out` names, which may not be any file the repository reads.
 * A failing validation still exports, with `validation.status: "fail"`, and
 * exits 1.
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ID_PATTERN, type Level, exportGraph } from "@intentset/core";
import type { Io } from "../output.ts";
import { CONFIG_PATH } from "../repository.ts";
import type { Session } from "../session.ts";

export interface GraphOptions {
  level: Level;
  format?: string;
  includeBodies: boolean;
  release?: string;
  out?: string;
  generatedAt?: string;
}

/** The export schema's generatedAt pattern. */
const ISO_8601 = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$/;

/** Check the options that need no repository, so a typo costs nothing. Returns a message, or null. */
export function graphUsageProblem(options: GraphOptions): string | null {
  if (options.format !== undefined && options.format !== "json") {
    return `--format ${options.format}: the only format is json`;
  }
  if (options.release !== undefined && parseRelease(options.release) === null) {
    return `--release ${options.release}: write it as <product ID>:<label>, such as PRD-LANTERN:pilot-1`;
  }
  if (options.generatedAt !== undefined && !ISO_8601.test(options.generatedAt)) {
    return `--generated-at ${options.generatedAt}: give an ISO 8601 time such as 2026-10-02T12:00:00Z`;
  }
  return null;
}

/** `<product>:<label>`, split at the first colon; the label is opaque and matched exactly (Core §7). */
function parseRelease(text: string): { product: string; label: string } | null {
  const colon = text.indexOf(":");
  if (colon === -1) return null;
  const product = text.slice(0, colon);
  const label = text.slice(colon + 1);
  if (!ID_PATTERN.test(product) || label === "") return null;
  return { product, label };
}

export function graphCommand(session: Session, options: GraphOptions, io: Io): number {
  const { repo, result, snapshot } = session;
  const release = options.release === undefined ? null : parseRelease(options.release);
  if (release !== null && result.graph.artifacts.get(release.product)?.meta.type !== "product") {
    io.stderr(`intentset graph: --release names ${release.product}, which is not a product in this graph.\n`);
    return 2;
  }
  const envelope = exportGraph(result, repo.registries, {
    repository: repo.config.repository,
    commit: snapshot.commit,
    ...(snapshot.commitUnavailable === undefined ? {} : { commitUnavailable: snapshot.commitUnavailable }),
    scope: repo.config.scope,
    level: options.level,
    release,
    ...(options.generatedAt === undefined ? {} : { generatedAt: options.generatedAt }),
    includeBodies: options.includeBodies,
  });
  const text = `${JSON.stringify(envelope, null, 2)}\n`;

  if (options.out === undefined) {
    io.stdout(text);
  } else {
    const target = resolve(io.cwd, options.out);
    const read = [CONFIG_PATH, ...(repo.config.registries === null ? [] : [repo.config.registries])]
      .concat(repo.inputs.map((input) => input.path))
      .map((path) => resolve(join(repo.root, path)));
    if (read.includes(target)) {
      io.stderr(`intentset graph: --out ${options.out} is a file the repository reads; tools never rewrite them.\n`);
      return 2;
    }
    try {
      writeFileSync(target, text);
    } catch (error) {
      io.stderr(`intentset graph: could not write ${options.out}: ${(error as Error).message}\n`);
      return 2;
    }
    io.stderr(
      `intentset graph: wrote ${options.out} (${envelope.artifacts.length} artifacts, ${envelope.validation.status})\n`,
    );
  }
  return result.ok ? 0 : 1;
}
