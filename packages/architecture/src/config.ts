/**
 * Where the regions are, what counts as a test, which files may import
 * screens or the response parser, and the declared scope (VSA §5, §6, §9;
 * profile §2–§4). Every value has a default for the reference layout of
 * profile §1. A repository states its own in `.intentset/architecture.yaml`,
 * a file of its own because `.intentset/config.yaml` belongs to core and
 * rejects keys it does not know.
 */
import { type Diagnostic, parseYamlDetailed } from "@intentset/core";
import { compareStrings, validatePattern } from "./patterns.ts";

export const ARCHITECTURE_CONFIG_PATH = ".intentset/architecture.yaml";

export interface ArchitectureConfig {
  /** Declared scope (VSA §9, Core §11): files outside it are counted, never reported one by one. */
  scope: string[];
  /** Where product source lives; an in-scope code file here that nothing owns is VSA009. */
  sourceRoots: string[];
  /** Neutral shared abstractions (VSA §5). */
  shared: string[];
  /** Technical infrastructure (VSA §5). */
  infrastructure: string[];
  /** Application and route composition (VSA §6). */
  composition: string[];
  /** The unified backend deployment root (profile §1, AMP001, AMP004). */
  backendRoots: string[];
  /** The named Router files that may import screens directly (TS003). Never widened to a directory by default. */
  routerFiles: string[];
  /** The named response-parser modules a client seam may import from the backend (profile §4 inherited exception). */
  responseParserModules: string[];
  /** Generated, vendored and build output: excluded from everything (VSA §3 versioned ignore list). */
  ignore: string[];
  /** Test files: excluded from boundary checks except foreign internals (profile §3). */
  tests: string[];
  /** Screens; only a router file may import another slice's (TS003). */
  screensGlob: string;
  /** Backend SDK specifiers, matched as patterns against the import specifier (AMP002, AMP006). */
  backendSdks: string[];
  /** The internal layer matrix (profile §3): each layer may import itself and the layers listed. */
  layerMatrix: Record<string, string[]>;
  /** Export conditions tried first when resolving a workspace package's entry, before types, import and default. */
  conditions: string[];
}

export const DEFAULT_ARCHITECTURE_CONFIG: ArchitectureConfig = {
  scope: ["**"],
  sourceRoots: ["src/**"],
  shared: ["src/shared/**"],
  infrastructure: ["src/infrastructure/**"],
  composition: ["src/app/**"],
  backendRoots: ["amplify/**"],
  routerFiles: [],
  responseParserModules: [],
  ignore: ["**/node_modules/**", "**/dist/**", ".git/**"],
  tests: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
  screensGlob: "**/ui/screens/**",
  backendSdks: ["aws-amplify/**", "@aws-amplify/**", "@aws-sdk/**"],
  layerMatrix: {
    presentation: ["presentation", "application", "policy", "model"],
    application: ["application", "policy", "model", "external"],
    policy: ["policy", "model"],
    model: ["model"],
    external: ["external", "model"],
  },
  conditions: [],
};

const LIST_KEYS = [
  "scope",
  "sourceRoots",
  "shared",
  "infrastructure",
  "composition",
  "backendRoots",
  "routerFiles",
  "responseParserModules",
  "ignore",
  "tests",
  "backendSdks",
  "conditions",
] as const;

/** Keys whose entries are path patterns and must pass validatePattern. */
const PATTERN_KEYS = new Set<string>([
  "scope",
  "sourceRoots",
  "shared",
  "infrastructure",
  "composition",
  "backendRoots",
  "routerFiles",
  "responseParserModules",
  "ignore",
  "tests",
  "screensGlob",
]);

const KNOWN_KEYS = [...LIST_KEYS, "screensGlob", "layerMatrix"].sort(compareStrings);

/** The defaults with a partial configuration laid over them; a key given replaces the default whole. */
export function resolveConfig(...layers: (Partial<ArchitectureConfig> | undefined)[]): ArchitectureConfig {
  const config: ArchitectureConfig = structuredClone(DEFAULT_ARCHITECTURE_CONFIG);
  for (const layer of layers) {
    if (layer === undefined) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (value !== undefined) (config as unknown as Record<string, unknown>)[key] = structuredClone(value);
    }
  }
  return config;
}

/**
 * Read `.intentset/architecture.yaml` with core's strict reader. Every key is
 * optional; an unknown key, a wrong shape or an invalid pattern is CFG001
 * with origin "architecture", and that key keeps its default.
 */
export function readArchitectureConfig(
  text: string,
  path: string = ARCHITECTURE_CONFIG_PATH,
): { config: Partial<ArchitectureConfig>; diagnostics: Diagnostic[] } {
  const config: Partial<ArchitectureConfig> = {};
  const diagnostics: Diagnostic[] = [];
  const parsed = parseYamlDetailed(text);
  const report = (field: string | undefined, line: number | undefined, message: string, remediation: string) => {
    diagnostics.push({
      code: "CFG001",
      severity: "error",
      origin: "architecture",
      artifact: null,
      path,
      ...(line !== undefined ? { location: { line } } : {}),
      ...(field !== undefined ? { field } : {}),
      message,
      remediation,
    });
  };
  if (parsed.error !== null) {
    report(
      undefined,
      parsed.error.line,
      `The architecture configuration does not parse: ${parsed.error.message}`,
      "Write it as a block mapping of the keys documented for ArchitectureConfig.",
    );
    return { config, diagnostics };
  }
  const root = parsed.value;
  const at = (field: string) => parsed.lines.get(field);

  for (const key of Object.keys(root).sort(compareStrings)) {
    const field = `/${key}`;
    const value = root[key];
    if (!KNOWN_KEYS.includes(key)) {
      report(
        field,
        at(field),
        `Unknown architecture configuration key \`${key}\`.`,
        `Remove it; the keys are ${KNOWN_KEYS.join(", ")}.`,
      );
      continue;
    }
    if (value === null) continue;
    if (key === "screensGlob") {
      const why = typeof value === "string" ? validatePattern(value) : "is not a string";
      if (why !== null) {
        report(field, at(field), `screensGlob ${why}.`, "Give one pattern such as **/ui/screens/**.");
      } else config.screensGlob = value as string;
      continue;
    }
    if (key === "layerMatrix") {
      const matrix = readMatrix(value);
      if (matrix === null) {
        report(
          field,
          at(field),
          "layerMatrix must map each layer name to a list of layer names.",
          "Write each layer as `presentation: [presentation, application]`.",
        );
      } else config.layerMatrix = matrix;
      continue;
    }
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item !== "")) {
      report(field, at(field), `\`${key}\` must be a list of non-empty strings.`, `Write ${key} as a sequence.`);
      continue;
    }
    const list = value as string[];
    if (PATTERN_KEYS.has(key)) {
      const bad = list.findIndex((pattern) => validatePattern(pattern) !== null);
      if (bad !== -1) {
        const pointer = `${field}/${bad}`;
        report(
          pointer,
          at(pointer) ?? at(field),
          `Pattern ${list[bad]} in \`${key}\` ${validatePattern(list[bad])}.`,
          "Use literal segments, `*` within a segment and `**` across segments only (VSA §3).",
        );
        continue;
      }
    }
    (config as Record<string, unknown>)[key] = [...list];
  }
  return { config, diagnostics };
}

function readMatrix(value: unknown): Record<string, string[]> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const matrix: Record<string, string[]> = {};
  for (const [layer, targets] of Object.entries(value)) {
    if (!Array.isArray(targets) || !targets.every((item) => typeof item === "string")) return null;
    matrix[layer] = [...(targets as string[])];
  }
  return matrix;
}
