/**
 * Profiles (spec/profile-contract.md, ADR 0030). A profile is data: the language a tree is read in, its layers, the
 * roles they play, their matrix, the layout and the rule sets that run. Intentset ships the profiles below, written
 * in the format a team's own profile uses and read by the same reader, and a repository's `.intentset/profile.yaml`
 * extends one of them or states a whole profile. Nothing here loads or runs code (design invariant 7).
 *
 * The configuration a check runs with is resolved in one order: the shipped profile a team's file extends (or the
 * reference profile when the repository has no file), the team's file, `.intentset/architecture.yaml`, and the
 * options a caller hands in. A key given replaces the one beneath it whole; nothing is merged entry by entry.
 */
import { type Diagnostic, parseYamlDetailed } from "@intentset/core";
import {
  ARCHITECTURE_CONFIG_PATH,
  type ArchitectureConfig,
  CONFIG_KEYS,
  type ConfigReport,
  DEFAULT_ARCHITECTURE_CONFIG,
  type LayerRoles,
  REFERENCE_PROFILE,
  RULE_SETS,
  readArchitectureConfig,
  readConfigKeys,
  readMatrix,
  resolveConfigFrom,
} from "./config.ts";
import { compareStrings, validatePattern } from "./patterns.ts";
import { READERS, type Reader } from "./reader.ts";

/** Where a repository's own profile lives. One repository has one profile. */
export const PROFILE_PATH = ".intentset/profile.yaml";

/** The plain TypeScript profile: the layers, their matrix and the layout, and no stack's rules. */
export const TYPESCRIPT_PROFILE = "intentset/typescript/1";

/** The TypeScript profile for Next.js: the plain one with the `nextjs` rule set and the application router's layout. */
export const NEXTJS_PROFILE = "intentset/typescript-nextjs/1";

/**
 * The profiles this release ships, as profile files. The reference profile is the TypeScript one with the Amplify
 * rule set and the backend it checks; a test holds what it resolves to equal to DEFAULT_ARCHITECTURE_CONFIG.
 */
export const SHIPPED_PROFILE_SOURCES: Readonly<Record<string, string>> = {
  [TYPESCRIPT_PROFILE]: `id: ${TYPESCRIPT_PROFILE}
language: typescript
layers: [presentation, application, policy, model, external]
roles:
  seam: external
  pure: [policy, model]
  rendering: [presentation]
layerMatrix:
  presentation: [presentation, application, policy, model]
  application: [application, policy, model, external]
  policy: [policy, model]
  model: [model]
  external: [external, model]
layerFolders:
  policy: [domain/policies]
  model: [domain/models]
  external: [client]
forbiddenPackages:
  policy: ["react/**", "react-dom/**", "react-native/**", "preact/**", "vue/**", "svelte/**", "solid-js/**", "@angular/**"]
  model: ["react/**", "react-dom/**", "react-native/**", "preact/**", "vue/**", "svelte/**", "solid-js/**", "@angular/**"]
  external: ["react/**", "react-dom/**", "react-native/**", "preact/**", "vue/**", "svelte/**", "solid-js/**", "@angular/**"]
ruleSets: []
sourceRoots: ["src/**"]
shared: ["src/shared/**"]
infrastructure: ["src/infrastructure/**"]
composition: ["src/app/**"]
ignore: ["**/node_modules/**", "**/dist/**", ".git/**"]
tests: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"]
screensGlob: "**/ui/screens/**"
`,
  [NEXTJS_PROFILE]: `id: ${NEXTJS_PROFILE}
extends: ${TYPESCRIPT_PROFILE}
ruleSets: [nextjs]
sourceRoots: ["src/**", "app/**", "middleware.ts"]
composition: ["app/**", "src/app/**", "middleware.ts", "src/middleware.ts"]
middlewareFiles: ["middleware.ts", "src/middleware.ts"]
serverOnly: ["**/server/**", "**/*.server.ts", "**/*.server.tsx"]
outsidePackages: ["pg/**", "mysql2/**", "mongodb/**", "mongoose/**", "@prisma/client/**", "drizzle-orm/**", "sequelize/**", "typeorm/**", "knex/**", "better-sqlite3/**", "redis/**", "ioredis/**", "firebase-admin/**", "stripe/**", "nodemailer/**", "@aws-sdk/**"]
`,
  [REFERENCE_PROFILE]: `id: ${REFERENCE_PROFILE}
extends: ${TYPESCRIPT_PROFILE}
ruleSets: [amplify]
backendRoots: ["amplify/**"]
backendSdks: ["aws-amplify/**", "@aws-amplify/**", "@aws-sdk/**"]
`,
};

/** The IDs of the profiles this release ships, sorted. */
export const SHIPPED_PROFILES: readonly string[] = Object.keys(SHIPPED_PROFILE_SOURCES).sort(compareStrings);

/** What a profile that extends nothing starts from: every file in scope, and nothing else said. */
const NOTHING: ArchitectureConfig = {
  scope: ["**"],
  sourceRoots: [],
  shared: [],
  infrastructure: [],
  composition: [],
  backendRoots: [],
  routerFiles: [],
  responseParserModules: [],
  ignore: [],
  tests: [],
  screensGlob: "",
  backendSdks: [],
  layerMatrix: {},
  forbiddenPackages: {},
  conditions: [],
  areas: [],
  sharedBackend: [],
  schemaBridge: null,
  outsidePackages: [],
  serverOnly: [],
  middlewareFiles: [],
  profile: "",
  language: "",
  layers: [],
  roles: { seam: null, pure: [], rendering: [] },
  layerFolders: {},
  ruleSets: [],
};

/**
 * The architecture configuration's keys a profile may not hold, because each is a fact about one repository and not
 * about a stack (profile contract §2): its scope, its areas, files it names one by one, and how its own workspace
 * resolves. They stay in `.intentset/architecture.yaml`.
 */
export const REPOSITORY_KEYS: readonly string[] = [
  "areas",
  "conditions",
  "responseParserModules",
  "routerFiles",
  "schemaBridge",
  "scope",
  "sharedBackend",
];

/** The keys only a profile file has, beside the layout and policy keys it shares with the configuration. */
export const PROFILE_KEYS: readonly string[] = [
  "extends",
  "id",
  "language",
  "layerFolders",
  "layers",
  "roles",
  "ruleSets",
];

const PROFILE_ID = /^[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9.-]*)+$/;
const LAYER_NAME = /^[a-z][a-z0-9-]*$/;
const ROLE_KEYS = ["pure", "rendering", "seam"];

const shipped = new Map<string, ArchitectureConfig>();

/** A shipped profile, resolved, or null when this release ships none by that ID. */
export function shippedProfile(id: string): ArchitectureConfig | null {
  const known = shipped.get(id);
  if (known !== undefined) return structuredClone(known);
  const source = SHIPPED_PROFILE_SOURCES[id];
  if (source === undefined) return null;
  const read = readProfile(source, `shipped:${id}`, { shipped: true });
  if (read.config === null || read.diagnostics.length > 0) {
    throw new Error(`The shipped profile ${id} does not read: ${read.diagnostics.map((d) => d.message).join(" ")}`);
  }
  shipped.set(id, read.config);
  return structuredClone(read.config);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item !== "");
}

/**
 * Read a profile file. `config` is the whole configuration it resolves to, laid over the shipped profile it extends,
 * or null when anything in the file is wrong: a profile is never applied in part, and a check stops with its errors. Every problem is CFG001 with origin "architecture".
 */
export function readProfile(
  text: string,
  path: string = PROFILE_PATH,
  options: { shipped?: boolean } = {},
): { config: ArchitectureConfig | null; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const parsed = parseYamlDetailed(text);
  const report: ConfigReport = (field, line, message, remediation) => {
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
      `The profile does not parse: ${parsed.error.message}`,
      "Write it as a block mapping of the keys the profile contract lists (§2).",
    );
    return { config: null, diagnostics };
  }
  const root = parsed.value;
  const at = (field: string) => parsed.lines.get(field);
  const stated = (key: string) => Object.hasOwn(root, key) && root[key] !== null;

  // What it extends, or nothing.
  let base: ArchitectureConfig;
  if (stated("extends")) {
    const found = typeof root.extends === "string" ? shippedProfile(root.extends) : null;
    if (found === null) {
      report(
        "/extends",
        at("/extends"),
        `The profile extends ${typeof root.extends === "string" ? `\`${root.extends}\`` : "something that is not a profile ID"}, and a profile extends only a profile this release ships.`,
        `Extend one of ${SHIPPED_PROFILES.join(", ")}, or leave \`extends\` out and state the whole profile (profile contract §4).`,
      );
      return { config: null, diagnostics };
    }
    base = found;
  } else {
    base = structuredClone(NOTHING);
    for (const key of ["language", "layers", "layerMatrix"]) {
      if (!stated(key)) {
        report(
          undefined,
          undefined,
          `The profile extends none and does not state \`${key}\`.`,
          `State \`${key}\`, or extend one of ${SHIPPED_PROFILES.join(", ")} (profile contract §2).`,
        );
      }
    }
  }
  const config = base;

  // Its identity.
  const id = root.id;
  if (typeof id !== "string" || !PROFILE_ID.test(id)) {
    report(
      stated("id") ? "/id" : undefined,
      at("/id"),
      stated("id")
        ? "The profile's `id` is not a profile ID."
        : "The profile has no `id`, so nothing can say which profile a result was checked against.",
      "Give it an ID of lowercase segments under a name the team owns, such as `acme/web/1` (profile contract §2).",
    );
    config.profile = "";
  } else if (options.shipped !== true && id.startsWith("intentset/")) {
    report(
      "/id",
      at("/id"),
      `The profile's \`id\` is ${id}, and IDs under \`intentset/\` are the profiles Intentset ships.`,
      "Give it an ID under a name the team owns, such as `acme/web/1` (profile contract §2).",
    );
    config.profile = "";
  } else config.profile = id;

  // The keys a configuration has too, by the configuration's own reader.
  const overlay: Partial<ArchitectureConfig> = {};
  const keys = [...PROFILE_KEYS, ...CONFIG_KEYS.filter((key) => !REPOSITORY_KEYS.includes(key))].sort(compareStrings);
  const stack: Record<string, unknown> = {};
  for (const key of Object.keys(root).sort(compareStrings)) {
    if (!REPOSITORY_KEYS.includes(key)) stack[key] = root[key];
    else {
      report(
        `/${key}`,
        at(`/${key}`),
        `\`${key}\` is a fact about one repository, and a profile holds what is true of a stack.`,
        `State \`${key}\` in ${ARCHITECTURE_CONFIG_PATH}, which overrides the profile (profile contract §2).`,
      );
    }
  }
  readConfigKeys(stack, at, report, overlay, (key) =>
    PROFILE_KEYS.includes(key)
      ? null
      : { message: `Unknown profile key \`${key}\`.`, remediation: `Remove it; the keys are ${keys.join(", ")}.` },
  );
  Object.assign(config, structuredClone(overlay));

  if (stated("language")) {
    if (typeof root.language !== "string" || root.language === "") {
      report("/language", at("/language"), "`language` must name one language.", "Write it as `language: typescript`.");
    } else if (stated("extends") && root.language !== config.language) {
      report(
        "/language",
        at("/language"),
        `The profile extends a ${config.language} profile and states the language ${root.language}.`,
        "Leave `language` out, or extend a profile of that language (profile contract §4).",
      );
    } else config.language = root.language;
  }

  if (stated("layers")) {
    const layers = root.layers;
    const bad = !isStringList(layers)
      ? "must be a list of layer names"
      : layers.find((layer) => !LAYER_NAME.test(layer)) !== undefined
        ? `names the layer \`${layers.find((layer) => !LAYER_NAME.test(layer))}\`, and a layer's name is lowercase letters, digits and hyphens`
        : new Set(layers).size !== layers.length
          ? "names a layer twice"
          : null;
    if (bad !== null) {
      report("/layers", at("/layers"), `\`layers\` ${bad}.`, "Write it as `layers: [ui, app, domain, adapters]`.");
    } else config.layers = [...(layers as string[])];
  }

  if (stated("roles")) {
    const roles = readRoles(root.roles);
    if (typeof roles === "string") {
      report(
        "/roles",
        at("/roles"),
        `\`roles\` ${roles}.`,
        "Write `seam` as one layer, and `pure` and `rendering` each as a list of layers (profile contract §3).",
      );
    } else config.roles = roles;
  }

  if (stated("layerFolders")) {
    const folders = readMatrix(root.layerFolders);
    const bad =
      folders === null
        ? undefined
        : Object.values(folders)
            .flat()
            .find((folder) => folder.includes("*") || validatePattern(folder) !== null);
    if (folders === null || bad !== undefined) {
      report(
        "/layerFolders",
        at("/layerFolders"),
        folders === null
          ? "`layerFolders` must map each layer name to a list of folders."
          : `The folder ${bad === "" ? "(empty)" : bad} in \`layerFolders\` is not one folder's path.`,
        "Write each layer as `adapters: [client]`, a folder under a slice's entrypoint (profile contract §3).",
      );
    } else config.layerFolders = folders;
  }

  if (stated("ruleSets")) {
    if (!isStringList(root.ruleSets)) {
      report(
        "/ruleSets",
        at("/ruleSets"),
        "`ruleSets` must be a list of rule set names.",
        "Write it as `ruleSets: []`.",
      );
    } else config.ruleSets = [...root.ruleSets];
  }

  // A file with an error is never applied in part.
  if (diagnostics.length > 0) return { config: null, diagnostics };

  // What the whole profile must agree on, whichever file said each part.
  const fieldOf = (key: string) => (stated(key) ? `/${key}` : stated("layers") ? "/layers" : undefined);
  const lineOf = (key: string) => {
    const field = fieldOf(key);
    return field === undefined ? undefined : at(field);
  };
  const unlisted = (names: readonly string[]) => names.find((name) => !config.layers.includes(name));
  const agree = (key: string, names: readonly string[]) => {
    const name = unlisted(names);
    if (name === undefined) return;
    report(
      fieldOf(key),
      lineOf(key),
      `\`${key}\` names the layer ${name}, which \`layers\` does not list.`,
      `Name only the profile's layers, ${config.layers.join(", ") || "of which it lists none"}; a profile that changes \`layers\` states \`${key}\` again (profile contract §3).`,
    );
  };
  agree("layerMatrix", [...Object.keys(config.layerMatrix), ...Object.values(config.layerMatrix).flat()]);
  agree("roles", [
    ...(config.roles.seam === null ? [] : [config.roles.seam]),
    ...config.roles.pure,
    ...config.roles.rendering,
  ]);
  agree("layerFolders", Object.keys(config.layerFolders));
  agree("forbiddenPackages", Object.keys(config.forbiddenPackages));

  for (const name of config.ruleSets) {
    const set = RULE_SETS[name];
    if (set === undefined) {
      report(
        fieldOf("ruleSets"),
        lineOf("ruleSets"),
        `\`ruleSets\` names ${name}, and this release ships no rule set by that name.`,
        `The rule sets are ${Object.keys(RULE_SETS).sort(compareStrings).join(", ")} (profile contract §5).`,
      );
    } else if (set.language !== config.language) {
      report(
        fieldOf("ruleSets"),
        lineOf("ruleSets"),
        `The rule set ${name} checks ${set.language}, and the profile's language is ${config.language || "not stated"}.`,
        "Remove it, or use a profile of that language (profile contract §5).",
      );
    }
  }

  if (config.language !== "" && !READERS.some((reader) => reader.language === config.language)) {
    const said = unreadLanguage(config.language);
    report(fieldOf("language"), lineOf("language"), said.message, said.remediation);
  }
  return { config: diagnostics.length > 0 ? null : config, diagnostics };
}

/** What is said of a language this release has no reader for, wherever the language was stated (profile contract §6). */
function unreadLanguage(language: string): { message: string; remediation: string } {
  return {
    message: `The profile's language is ${language}, which this release does not read, so no file's imports were checked.`,
    remediation: `This release reads ${READERS.map((reader) => reader.language).join(", ")}; use a profile of one of those (profile contract §6).`,
  };
}

/** `roles` as LayerRoles, or why it is not one. A role left out is played by no layer. */
function readRoles(value: unknown): LayerRoles | string {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return "must be a mapping of roles to layers";
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record)
    .sort(compareStrings)
    .find((key) => !ROLE_KEYS.includes(key));
  if (unknown !== undefined) return `has the unknown role \`${unknown}\`; the roles are ${ROLE_KEYS.join(", ")}`;
  const roles: LayerRoles = { seam: null, pure: [], rendering: [] };
  if (record.seam !== undefined && record.seam !== null) {
    if (typeof record.seam !== "string" || record.seam === "") return "gives `seam` something other than one layer";
    roles.seam = record.seam;
  }
  for (const key of ["pure", "rendering"] as const) {
    if (record[key] === undefined || record[key] === null) continue;
    if (!isStringList(record[key])) return `gives \`${key}\` something other than a list of layers`;
    roles[key] = [...(record[key] as string[])];
  }
  return roles;
}

/** A reader for a language this release does not read: no file is source, and nothing is passed. */
const NO_READER = (language: string): Reader => ({
  language,
  unresolved: { code: "CFG001", remediation: "" },
  isSource: () => false,
  read: () => ({
    graph: () => ({ edges: [], unresolved: [], exports: new Map(), jsx: new Map(), directives: new Map() }),
    notes: () => [],
    importsOf: () => [],
    aliasFor: () => null,
  }),
});

export interface LoadedConfig {
  config: ArchitectureConfig;
  /** CFG001 for whatever is wrong in the profile file or the architecture configuration. */
  diagnostics: Diagnostic[];
  /** The reader for the profile's language. For a language this release does not read, one that reads nothing. */
  reader: Reader;
  /** False when the profile's language has no reader: nothing was checked, which is never a pass. */
  read: boolean;
  /**
   * True when the repository's profile file has an error, or the caller handed in a language this release does not
   * read. `diagnostics` then holds only those errors, and a check stops with them: no other profile stands in, and
   * nothing else is checked (profile contract §2, §6).
   */
  profileFailed: boolean;
}

/**
 * The configuration a tree is checked with, in the one order: the shipped profile, the repository's profile file,
 * its architecture configuration, then what the caller hands in.
 */
export function loadConfig(files: ReadonlyMap<string, string>, override?: Partial<ArchitectureConfig>): LoadedConfig {
  const diagnostics: Diagnostic[] = [];
  let base = DEFAULT_ARCHITECTURE_CONFIG;
  const profileText = files.get(PROFILE_PATH);
  if (profileText !== undefined) {
    const read = readProfile(profileText, PROFILE_PATH);
    if (read.config === null) {
      return {
        config: structuredClone(DEFAULT_ARCHITECTURE_CONFIG),
        diagnostics: read.diagnostics,
        reader: NO_READER(""),
        read: false,
        profileFailed: true,
      };
    }
    base = read.config;
  }
  let fileConfig: Partial<ArchitectureConfig> | undefined;
  const configText = files.get(ARCHITECTURE_CONFIG_PATH);
  if (configText !== undefined) {
    const read = readArchitectureConfig(configText, ARCHITECTURE_CONFIG_PATH);
    fileConfig = read.config;
    diagnostics.push(...read.diagnostics);
  }
  const config = resolveConfigFrom(base, fileConfig, override);
  const reader = READERS.find((candidate) => candidate.language === config.language);
  if (reader === undefined) {
    // The language came from the caller, not from a file: the same error, and the check stops on it the same way.
    const said = unreadLanguage(config.language);
    return {
      config,
      diagnostics: [
        {
          code: "CFG001",
          severity: "error",
          origin: "architecture",
          artifact: null,
          path: null,
          field: "/language",
          message: said.message,
          remediation: said.remediation,
        },
      ],
      reader: NO_READER(config.language),
      read: false,
      profileFailed: true,
    };
  }
  return { config, diagnostics, reader, read: true, profileFailed: false };
}
