/**
 * The `intentset` command: argument parsing, dispatch and exit codes, with
 * every command's work in commands/. `main` returns the exit code rather than
 * exiting, so tests run it in-process with captured io.
 *
 * Exit codes (Core §11, ADR 0004): 0 no errors, 1 validation errors, 2
 * invocation or tool failure. validate, graph, architecture check, impact,
 * context and review never write; graph --out, architecture check
 * --write-baseline, evidence import --out and publish --out write only what
 * they name; init only creates.
 */
import { parseArgs } from "node:util";
import type { Mode } from "@intentset/architecture";
import { LEVELS, type Level } from "@intentset/core";
import type { RunScope } from "@intentset/verification";
import { architectureCommand } from "./commands/architecture.ts";
import { contextCommand } from "./commands/context.ts";
import { evidenceImportCommand, evidenceUsageProblem } from "./commands/evidence.ts";
import { graphCommand, graphUsageProblem, parseRelease } from "./commands/graph.ts";
import { impactCommand } from "./commands/impact.ts";
import { initCommand } from "./commands/init.ts";
import { publishCommand, publishUsageProblem } from "./commands/publish.ts";
import { reviewCommand } from "./commands/review.ts";
import { validateCommand } from "./commands/validate.ts";
import type { Io } from "./output.ts";
import { type CarrierName, CARRIERS, findRoot } from "./repository.ts";
import { EVIDENCE_DIR, evidenceFiles, openSession, type SessionOptions } from "./session.ts";

export type { Io } from "./output.ts";

export const USAGE = `usage: intentset <command> [options]

commands
  init [--repository <name>] [--example]
                            create .intentset/config.yaml and an empty .intentset/registries.yaml;
                            --example adds the scheduling example under product/scheduling/.
                            Never overwrites a file.
  validate                  every check the level asks for; exit 1 when any diagnostic is an error
  graph [--format json] [--include-bodies] [--release <product>:<label>] [--out <file>]
        [--generated-at <time>]
                            print the intentset/export/0.1 envelope, or write it to --out
  architecture check [--mode migration|strict] [--baseline <file>] [--write-baseline <file>]
                            ownership, claims, imports, layers and regions (default level L2)
  evidence import --from vitest|node-tap <report> --out <file> --product <ID> --release <label>
        [--environment <text>] [--started-at <time>] [--finished-at <time>] [--uri-base <uri>]
        [--tool-version <v>]
                            turn a test report into run records bound to this commit and graph
  impact <ID>               what depends on an artifact: direct, candidates, review context, ancestors
  context <ID> [--include-restricted]
                            the bounded engineering context of an artifact, with paths and bodies
  review [--base <ref>]     the local review report: checks, coverage, and the impact of what changed
  publish --visibility <v> --audience <a> --product <ID> --release <r> --role <r> --edition <e>
        [--flag <f>]... [--authorized-internal] [--authorized-restricted] --out <dir> [--html]
        [--published-at <time>]
                            reviewed knowledge for one audience and release, as Markset with provenance
  serve                     the local Atlas (not built yet)
  mcp                       the read-only agent interface (not built yet)

options
  --root <dir>              repository root (default: the nearest directory at or above this one
                            holding .intentset/config.yaml)
  --json                    machine-readable output, keys in canonical order
  --carrier <markset|plain> how documents are read (default markset)
  --level <L1..L4>          conformance level; each includes those below it (default L1):
                            L2 adds architecture, L3 evidence, L4 publication readiness
  --evidence <file>         L3 and above: run records to read, repeatable (default: every *.json in
                            ${EVIDENCE_DIR}/, which holds local output and is not committed)
  --product <ID> --release <label>
                            L3 and above: the exact scope evidence is assessed for (default: every scope)
  --mode <migration|strict> --baseline <file>
                            L2 and above: whether a baseline of known violations applies, and which
  -h, --help                show this help

exit codes: 0 no errors, 1 validation errors, 2 invocation or tool failure`;

const BUILT = ["init", "validate", "graph", "architecture", "evidence", "impact", "context", "review", "publish"];
const NOT_BUILT = ["serve", "mcp"];

const GLOBAL = ["root", "json", "carrier", "level", "help"];
const LEVEL_OPTIONS = ["evidence", "product", "release", "mode", "baseline"];
const COMMAND_OPTIONS: Record<string, string[]> = {
  init: ["repository", "example"],
  validate: LEVEL_OPTIONS,
  graph: ["format", "include-bodies", "release", "out", "generated-at", "evidence", "mode", "baseline"],
  architecture: ["mode", "baseline", "write-baseline"],
  evidence: [
    "from",
    "out",
    "product",
    "release",
    "environment",
    "started-at",
    "finished-at",
    "uri-base",
    "tool-version",
  ],
  impact: LEVEL_OPTIONS,
  context: ["include-restricted", ...LEVEL_OPTIONS],
  review: ["base", ...LEVEL_OPTIONS],
  publish: [
    "visibility",
    "audience",
    "product",
    "release",
    "role",
    "edition",
    "flag",
    "authorized-internal",
    "authorized-restricted",
    "out",
    "html",
    "published-at",
  ],
};

/** Positional arguments after the command: a fixed subcommand, then how many more. */
const POSITIONALS: Record<string, { sub?: string; count: number; what?: string }> = {
  architecture: { sub: "check", count: 0 },
  evidence: { sub: "import", count: 1, what: "a report file" },
  impact: { count: 1, what: "an artifact ID" },
  context: { count: 1, what: "an artifact ID" },
};

export async function main(argv: string[], io: Io): Promise<number> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    io.stderr(`intentset: ${(error as Error).message}\n\n${USAGE}\n`);
    return 2;
  }
  const { values, positionals, tokens } = parsed;
  const [command, ...rest] = positionals;
  if (values.help || command === undefined) {
    io.stdout(`${USAGE}\n`);
    return values.help ? 0 : 2;
  }
  // The command is checked before its arguments, so a typo reads as a typo and not as a missing ID.
  if (NOT_BUILT.includes(command)) {
    io.stderr(`intentset ${command}: not built yet in this version of the CLI.\n`);
    return 2;
  }
  if (!BUILT.includes(command)) {
    io.stderr(`intentset: unknown command "${command}"\n\n${USAGE}\n`);
    return 2;
  }
  const usage = (message: string) => {
    io.stderr(`intentset ${command}: ${message}\n`);
    return 2;
  };
  const allowed = [...GLOBAL, ...(COMMAND_OPTIONS[command] ?? [])];
  for (const token of tokens) {
    if (token.kind === "option" && !allowed.includes(token.name)) {
      return usage(`--${token.name} is not an option of ${command}`);
    }
  }

  const shape = POSITIONALS[command] ?? { count: 0 };
  let args = rest;
  if (shape.sub !== undefined) {
    if (args[0] !== shape.sub) return usage(`the only subcommand is "${command} ${shape.sub}"`);
    args = args.slice(1);
  }
  if (args.length < shape.count) return usage(`${shape.what} is required`);
  if (args.length > shape.count) {
    const hint = shape.count === 0 ? " (use --root <dir> to name the repository)" : "";
    return usage(`unexpected argument "${args[shape.count]}"${hint}`);
  }

  const carrier = values.carrier ?? "markset";
  if (!Object.hasOwn(CARRIERS, carrier)) {
    return usage(`--carrier ${carrier}: the carriers are ${Object.keys(CARRIERS).join(" and ")}`);
  }
  const levelGiven = values.level as Level | undefined;
  if (levelGiven !== undefined && !LEVELS.includes(levelGiven)) {
    return usage(`--level ${levelGiven}: the levels are ${LEVELS.join(", ")}`);
  }
  if (levelGiven === "L5") {
    return usage("L5 is a claim about continuous CI, not something one run can check (Core §11).");
  }
  if (values.mode !== undefined && values.mode !== "migration" && values.mode !== "strict") {
    return usage(`--mode ${values.mode}: the modes are migration and strict`);
  }
  if (command === "init") {
    return initCommand({ root: values.root, repository: values.repository, example: values.example }, io);
  }

  // Evidence scope: --product with --release, or graph's --release <product>:<label>.
  let scope: RunScope | null = null;
  if (command !== "evidence" && command !== "publish") {
    if (command === "graph") {
      const release = values.release === undefined ? null : parseRelease(values.release);
      scope = release === null ? null : { product: release.product, release: release.label };
    } else if ((values.product === undefined) !== (values.release === undefined)) {
      return usage("--product and --release name one scope together; give both or neither");
    } else if (values.product !== undefined && values.release !== undefined) {
      scope = { product: values.product, release: values.release };
    }
  }

  const sessionOptions = (level: Level): SessionOptions => ({
    root: values.root,
    carrier: carrier as CarrierName,
    level,
    mode: values.mode as Mode | undefined,
    baseline: values.baseline,
    evidence: values.evidence,
    scope,
  });

  switch (command) {
    case "validate": {
      const session = openSession(command, sessionOptions(levelGiven ?? "L1"), io);
      return typeof session === "number" ? session : validateCommand(session, values.json, io);
    }
    case "graph": {
      const options = {
        format: values.format,
        includeBodies: values["include-bodies"],
        release: values.release,
        out: values.out,
        generatedAt: values["generated-at"],
      };
      const problem = graphUsageProblem(options);
      if (problem !== null) return usage(problem);
      const session = openSession(command, sessionOptions(levelGiven ?? "L1"), io);
      return typeof session === "number" ? session : graphCommand(session, options, io);
    }
    case "architecture": {
      if (levelGiven === "L1") return usage("the architecture check runs at L2 and above, where ownership joins");
      const session = openSession("architecture check", sessionOptions(levelGiven ?? "L2"), io);
      if (typeof session === "number") return session;
      return architectureCommand(session, { writeBaseline: values["write-baseline"] }, values.json, io);
    }
    case "evidence": {
      const options = {
        from: values.from,
        report: args[0],
        out: values.out,
        product: values.product,
        release: values.release,
        environment: values.environment,
        startedAt: values["started-at"],
        finishedAt: values["finished-at"],
        uriBase: values["uri-base"],
        toolVersion: values["tool-version"],
      };
      const problem = evidenceUsageProblem(options);
      if (problem !== null) return usage(problem);
      const session = openSession("evidence import", sessionOptions(levelGiven ?? "L1"), io);
      return typeof session === "number" ? session : evidenceImportCommand(session, options, io);
    }
    case "impact": {
      const session = openSession(command, sessionOptions(levelGiven ?? "L1"), io);
      return typeof session === "number" ? session : impactCommand(session, args[0], values.json, io);
    }
    case "context": {
      const session = openSession(command, sessionOptions(levelGiven ?? "L1"), io);
      if (typeof session === "number") return session;
      return contextCommand(session, args[0], values["include-restricted"], values.json, io);
    }
    case "review": {
      let level = levelGiven;
      let reason = "as asked";
      if (level === undefined) {
        const root = findRoot(io.cwd, values.root);
        const records = root === null ? [] : evidenceFiles(root, io.cwd, values.evidence);
        level = records.length > 0 ? "L4" : "L2";
        reason =
          records.length > 0
            ? "the highest the inputs allow: run records were given or found"
            : `the highest the inputs allow: no run records were given or found in ${EVIDENCE_DIR}/, so L3 and L4 were not checked`;
      }
      const session = openSession(command, sessionOptions(level), io);
      if (typeof session === "number") return session;
      return reviewCommand(session, { base: values.base, levelReason: reason }, values.json, io);
    }
    default: {
      const options = {
        visibility: values.visibility,
        audience: values.audience,
        product: values.product,
        release: values.release,
        role: values.role,
        edition: values.edition,
        flags: values.flag ?? [],
        authorizedInternal: values["authorized-internal"],
        authorizedRestricted: values["authorized-restricted"],
        out: values.out,
        html: values.html,
        publishedAt: values["published-at"],
      };
      const problem = publishUsageProblem(options);
      if (problem !== null) return usage(problem);
      const session = openSession(command, sessionOptions(levelGiven ?? "L1"), io);
      return typeof session === "number" ? session : publishCommand(session, options, io);
    }
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
      evidence: { type: "string", multiple: true },
      product: { type: "string" },
      mode: { type: "string" },
      baseline: { type: "string" },
      "write-baseline": { type: "string" },
      from: { type: "string" },
      environment: { type: "string" },
      "started-at": { type: "string" },
      "finished-at": { type: "string" },
      "uri-base": { type: "string" },
      "tool-version": { type: "string" },
      base: { type: "string" },
      visibility: { type: "string" },
      audience: { type: "string" },
      role: { type: "string" },
      edition: { type: "string" },
      flag: { type: "string", multiple: true },
      "authorized-internal": { type: "boolean", default: false },
      "authorized-restricted": { type: "boolean", default: false },
      html: { type: "boolean", default: false },
      "published-at": { type: "string" },
    },
  });
}
