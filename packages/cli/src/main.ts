/**
 * The `intentset` command: argument parsing, dispatch and exit codes, with
 * every command's work in commands/. `main` returns the exit code rather than
 * exiting, so tests run it in-process with captured io.
 *
 * Exit codes (Core §11, ADR 0004): 0 no errors, 1 validation errors, 2
 * invocation or tool failure. validate, graph, impact and context never
 * write; graph --out writes only the file it names; init only creates.
 */
import { parseArgs } from "node:util";
import { LEVELS, type Level } from "@intentset/core";
import { contextCommand } from "./commands/context.ts";
import { graphCommand, graphUsageProblem } from "./commands/graph.ts";
import { impactCommand } from "./commands/impact.ts";
import { initCommand } from "./commands/init.ts";
import { validateCommand } from "./commands/validate.ts";
import type { Io } from "./output.ts";
import { type CarrierName, CARRIERS } from "./repository.ts";
import { openSession } from "./session.ts";

export type { Io } from "./output.ts";

export const USAGE = `usage: intentset <command> [options]

commands
  init [--repository <name>] [--example]
                            create .intentset/config.yaml and an empty .intentset/registries.yaml;
                            --example adds the scheduling example under product/scheduling/.
                            Never overwrites a file.
  validate                  check every document in scope; exit 1 when any diagnostic is an error
  graph [--format json] [--include-bodies] [--release <product>:<label>] [--out <file>]
        [--generated-at <time>]
                            print the intentset/export/0.1 envelope, or write it to --out
  impact <ID>               what depends on an artifact: direct, candidates, review context, ancestors
  context <ID> [--include-restricted]
                            bounded engineering context for a behavior, rule, capability or slice
  architecture check        ownership and import boundaries (not built yet)
  evidence import <file>    import verification run records (not built yet)
  review                    the local review report (not built yet)
  publish                   generate audience knowledge for a release (not built yet)
  serve                     the local Atlas (not built yet)
  mcp                       the read-only agent interface (not built yet)

options
  --root <dir>              repository root (default: the nearest directory at or above this one
                            holding .intentset/config.yaml)
  --json                    machine-readable output, keys in canonical order
  --carrier <markset|plain> how documents are read (default markset)
  --level <L1..L5>          conformance level to check at (default L1)
  -h, --help                show this help

exit codes: 0 no errors, 1 validation errors, 2 invocation or tool failure`;

const BUILT = ["init", "validate", "graph", "impact", "context"] as const;
const NOT_BUILT = ["architecture", "evidence", "review", "publish", "serve", "mcp"] as const;

/** Options every command takes, and the ones that belong to a single command. */
const GLOBAL_OPTIONS = ["root", "json", "carrier", "level", "help"];
const COMMAND_OPTIONS: Record<string, string[]> = {
  init: ["repository", "example"],
  graph: ["format", "include-bodies", "release", "out", "generated-at"],
  context: ["include-restricted"],
};

/** Levels whose checks this CLI runs today. L3 to L5 need evidence, publication and CI checks it does not run yet. */
const RUNNABLE_LEVELS: readonly Level[] = ["L1", "L2"];

export async function main(argv: string[], io: Io): Promise<number> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    io.stderr(`intentset: ${(error as Error).message}\n\n${USAGE}\n`);
    return 2;
  }
  const { values, positionals, tokens } = parsed;
  const [command, ...args] = positionals;
  if (values.help || command === undefined) {
    io.stdout(`${USAGE}\n`);
    return values.help ? 0 : 2;
  }
  // The command is checked before its arguments, so a typo reads as a typo
  // and not as a missing ID.
  if ((NOT_BUILT as readonly string[]).includes(command)) {
    io.stderr(`intentset ${[command, ...args].join(" ")}: not built yet in this version of the CLI.\n`);
    return 2;
  }
  if (!(BUILT as readonly string[]).includes(command)) {
    io.stderr(`intentset: unknown command "${command}"\n\n${USAGE}\n`);
    return 2;
  }
  const allowed = [...GLOBAL_OPTIONS, ...(COMMAND_OPTIONS[command] ?? [])];
  for (const token of tokens) {
    if (token.kind === "option" && !allowed.includes(token.name)) {
      io.stderr(`intentset ${command}: --${token.name} is not an option of ${command}\n`);
      return 2;
    }
  }

  const carrier = values.carrier ?? "markset";
  if (!Object.hasOwn(CARRIERS, carrier)) {
    io.stderr(`intentset: --carrier ${carrier}: the carriers are ${Object.keys(CARRIERS).join(" and ")}\n`);
    return 2;
  }
  const level = (values.level ?? "L1") as Level;
  if (!LEVELS.includes(level)) {
    io.stderr(`intentset: --level ${level}: the levels are ${LEVELS.join(", ")}\n`);
    return 2;
  }
  if (!RUNNABLE_LEVELS.includes(level)) {
    io.stderr(
      `intentset: --level ${level} needs evidence, publication and CI checks this CLI does not run yet;\n` +
        "a result here would claim conformance nothing checked. Use L1 or L2.\n",
    );
    return 2;
  }

  const takesId = command === "impact" || command === "context";
  const expected = takesId ? 1 : 0;
  if (args.length < expected) {
    io.stderr(`intentset ${command}: an artifact ID is required, such as BEH-ASMT-SCHEDULE\n`);
    return 2;
  }
  if (args.length > expected) {
    const hint = command === "validate" || command === "graph" ? " (use --root <dir> to name the repository)" : "";
    io.stderr(`intentset ${command}: unexpected argument "${args[expected]}"${hint}\n`);
    return 2;
  }

  if (command === "init") {
    return initCommand({ root: values.root, repository: values.repository, example: values.example }, io);
  }
  const graphOptions = {
    level,
    format: values.format,
    includeBodies: values["include-bodies"],
    release: values.release,
    out: values.out,
    generatedAt: values["generated-at"],
  };
  if (command === "graph") {
    const problem = graphUsageProblem(graphOptions);
    if (problem !== null) {
      io.stderr(`intentset graph: ${problem}\n`);
      return 2;
    }
  }

  const session = openSession(command, { root: values.root, carrier: carrier as CarrierName, level }, io);
  if (typeof session === "number") return session;
  switch (command) {
    case "validate":
      return validateCommand(session, level, values.json, io);
    case "graph":
      return graphCommand(session, graphOptions, io);
    case "impact":
      return impactCommand(session, args[0], level, values.json, io);
    default:
      return contextCommand(session, args[0], level, values["include-restricted"], values.json, io);
  }
}

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    tokens: true,
    options: {
      root: { type: "string" },
      json: { type: "boolean", default: false },
      carrier: { type: "string" },
      level: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
      repository: { type: "string" },
      example: { type: "boolean", default: false },
      format: { type: "string" },
      "include-bodies": { type: "boolean", default: false },
      release: { type: "string" },
      out: { type: "string" },
      "generated-at": { type: "string" },
      "include-restricted": { type: "boolean", default: false },
    },
  });
}
