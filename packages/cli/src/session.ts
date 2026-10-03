/**
 * The shared front half of every reading command: find the root, load the
 * repository, validate it. Returns an exit code instead when the command
 * cannot proceed, having said why. Nothing here writes.
 */
import {
  type Diagnostic,
  type Level,
  type ValidationResult,
  graphHash,
  hasErrors,
  sortDiagnostics,
  validate,
} from "@intentset/core";
import { formatDiagnostic, type Io, type Snapshot } from "./output.ts";
import { type CarrierName, CONFIG_PATH, findRoot, loadRepository, type Repository } from "./repository.ts";

export interface SessionOptions {
  root?: string;
  carrier: CarrierName;
  level: Level;
}

export interface Session {
  repo: Repository;
  /** Core's result, with the registries' CFG002 folded into `diagnostics` and `ok` so the export carries them too. */
  result: ValidationResult;
  diagnostics: Diagnostic[];
  errors: number;
  warnings: number;
  snapshot: Snapshot;
}

/** Load and validate, or return the exit code (2) after reporting why the repository could not be read. */
export function openSession(command: string, options: SessionOptions, io: Io): Session | number {
  const root = findRoot(io.cwd, options.root);
  if (root === null) {
    const where = options.root === undefined ? "this directory or any above it" : options.root;
    io.stderr(
      `intentset ${command}: no ${CONFIG_PATH} in ${where}.\n` +
        "Run `intentset init` at the repository root to create one, or pass --root <dir>.\n",
    );
    return 2;
  }
  const repo = loadRepository(root, options.carrier);
  if (!repo.configOk) {
    io.stderr(`intentset ${command}: the configuration has errors, so the scope is unknown.\n`);
    for (const d of sortDiagnostics(repo.diagnostics)) io.stderr(formatDiagnostic(d));
    return 2;
  }
  const validated = validate(repo.inputs, repo.registries, { level: options.level });
  const diagnostics = sortDiagnostics([...validated.diagnostics, ...repo.diagnostics]);
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const result: ValidationResult = { graph: validated.graph, diagnostics, ok: !hasErrors(diagnostics) };
  const snapshot: Snapshot = { commit: repo.commit, graphHash: graphHash(validated.graph) };
  if (repo.commitUnavailable !== undefined) snapshot.commitUnavailable = repo.commitUnavailable;
  return { repo, result, diagnostics, errors, warnings: diagnostics.length - errors, snapshot };
}
