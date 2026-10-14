/**
 * `.intentset/config.yaml` (Core §11: a conformance claim names its declared
 * repository scope). `repository` is the stable identity the export carries;
 * `scope` is the globs that select documents; `registries` is the path of
 * registries.yaml or null; `ignore` excludes generated output. A bad shape is
 * CFG001 and the defaults stand in, so a caller always gets a usable config.
 */
import type { Diagnostic } from "./diagnostics.ts";
import { compareStrings, makeDiagnostic } from "./report.ts";
import { patternProblem } from "./validate.ts";
import { type Config, EVIDENCE_BINDINGS } from "./types.ts";
import { parseYamlDetailed } from "./yaml.ts";

export const DEFAULT_SCOPE = ["**/*.md"];
export const DEFAULT_IGNORE = ["node_modules/**", "dist/**", ".git/**"];
const KNOWN_KEYS = ["repository", "scope", "registries", "ignore", "evidence"];
const EVIDENCE_KEYS = ["binding", "globalInputs"];

/** Core §11: read the repository configuration. Shape problems are CFG001. */
export function readConfig(text: string, path: string): { config: Config; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const config: Config = {
    repository: "",
    scope: [...DEFAULT_SCOPE],
    registries: null,
    ignore: [...DEFAULT_IGNORE],
    evidence: { binding: null, globalInputs: [] },
  };
  const parsed = parseYamlDetailed(text);
  if (parsed.error) {
    diagnostics.push(
      makeDiagnostic({
        code: "CFG001",
        origin: "profile",
        artifact: null,
        path,
        location: { line: parsed.error.line },
        message: `The configuration does not parse: ${parsed.error.message}`,
        remediation: "Write the configuration as a block mapping with repository, scope, registries and ignore.",
      }),
    );
    return { config, diagnostics };
  }
  const root = parsed.value;
  const report = (field: string, message: string, remediation: string) => {
    const line = parsed.lines.get(field);
    diagnostics.push(
      makeDiagnostic({
        code: "CFG001",
        origin: "profile",
        artifact: null,
        path,
        ...(line !== undefined ? { location: { line } } : {}),
        field,
        message,
        remediation,
      }),
    );
  };

  for (const key of Object.keys(root).sort(compareStrings)) {
    if (!KNOWN_KEYS.includes(key)) {
      report(`/${key}`, `Unknown configuration key \`${key}\`.`, `Remove it; the keys are ${KNOWN_KEYS.join(", ")}.`);
    }
  }
  if (typeof root.repository === "string" && root.repository !== "") {
    config.repository = root.repository;
  } else {
    report(
      "/repository",
      "`repository` is required and must be a non-empty string.",
      'Set it to the repository\'s stable identity, such as "org/name".',
    );
  }
  for (const key of ["scope", "ignore"] as const) {
    const value = root[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.every((item) => typeof item === "string" && item !== "")) {
      config[key] = [...(value as string[])];
      for (const [index, pattern] of (value as string[]).entries()) {
        const why = patternProblem(pattern);
        if (why !== null) {
          report(
            `/${key}/${index}`,
            `${key} pattern ${JSON.stringify(pattern)} is not a supported pattern: ${why}`,
            "Use repository-relative POSIX paths with literal segments, * within a segment and ** across segments.",
          );
        }
      }
    } else {
      report(
        `/${key}`,
        `\`${key}\` must be a list of glob strings.`,
        `Write ${key} as a sequence of patterns such as "**/*.md".`,
      );
    }
  }
  if (root.registries !== undefined && root.registries !== null) {
    if (typeof root.registries === "string" && root.registries !== "") config.registries = root.registries;
    else report("/registries", "`registries` must be a path or null.", "Point it at registries.yaml, or remove it.");
  }
  readEvidence(root.evidence, config, report);
  return { config, diagnostics };
}

/** `evidence:` (Core §8): the binding asked for and the global inputs, each optional. */
function readEvidence(
  value: unknown,
  config: Config,
  report: (field: string, message: string, remediation: string) => void,
): void {
  if (value === undefined || value === null) return;
  if (typeof value !== "object" || Array.isArray(value)) {
    report(
      "/evidence",
      "`evidence` must be a mapping.",
      "Write `binding` and `globalInputs` under `evidence:`, or remove it.",
    );
    return;
  }
  const mapping = value as Record<string, unknown>;
  for (const key of Object.keys(mapping).sort(compareStrings)) {
    if (!EVIDENCE_KEYS.includes(key)) {
      report(
        `/evidence/${key}`,
        `Unknown evidence key \`${key}\`.`,
        `Remove it; the keys are ${EVIDENCE_KEYS.join(", ")}.`,
      );
    }
  }
  if (mapping.binding !== undefined && mapping.binding !== null) {
    if ((EVIDENCE_BINDINGS as readonly unknown[]).includes(mapping.binding)) {
      config.evidence.binding = mapping.binding as Config["evidence"]["binding"];
    } else {
      report(
        "/evidence/binding",
        "`evidence.binding` must be subject or commit.",
        "Write `binding: subject` (the default where slices exist) or `binding: commit` (Core §8).",
      );
    }
  }
  const inputs = mapping.globalInputs;
  if (inputs !== undefined && inputs !== null) {
    if (Array.isArray(inputs) && inputs.every((item) => typeof item === "string" && item !== "")) {
      config.evidence.globalInputs = [...new Set(inputs as string[])];
      for (const [index, pattern] of (inputs as string[]).entries()) {
        const why = patternProblem(pattern);
        if (why !== null) {
          report(
            `/evidence/globalInputs/${index}`,
            `globalInputs entry ${JSON.stringify(pattern)} is not a supported path or pattern: ${why}`,
            "Use repository-relative POSIX paths, with * within a segment and ** across segments.",
          );
        }
      }
    } else {
      report(
        "/evidence/globalInputs",
        "`evidence.globalInputs` must be a list of paths or patterns.",
        "Write the files whose change affects every check, such as pnpm-lock.yaml.",
      );
    }
  }
}
