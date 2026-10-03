/**
 * Reading one document into an Artifact (Core §3, §4, §6, §7; ADR 0002).
 *
 * `readArtifact` checks, in typed code, every constraint of
 * spec/frontmatter.schema.json plus the required narrative sections. Each
 * schema constraint is CORE001 with a JSON pointer, except two that the
 * schema also states and Core assigns elsewhere: a missing navigation parent
 * is CORE004 (Core §5, the chain does not reach a product) and a missing
 * `availability` on a behavior or knowledge is CORE005 (Core §7). A
 * duplicate ID inside one link array is CORE003 (Core §5, duplicate edge).
 * A test asserts that the schema and this code agree on validity.
 *
 * The record is returned whenever its identity and required common fields
 * are sound; an optional structure that fails its checks is reported and
 * left out of the metadata, so one bad link does not remove an artifact from
 * the graph and cascade into unresolved references elsewhere.
 */
import { closingFenceIndex } from "./carrier.ts";
import type { Diagnostic, Location } from "./diagnostics.ts";
import { sha256Hex } from "./hash.ts";
import { type Locate, NO_LOCATION, aType, capitalize, compareStrings, isRecord, makeDiagnostic } from "./report.ts";
import {
  ARTIFACT_TYPES,
  type Artifact,
  type ArtifactMeta,
  type ArtifactType,
  type Availability,
  CLAIM_KINDS,
  type Claim,
  type DocumentInput,
  ID_PATTERN,
  LINK_KINDS,
  type LinkKind,
  PARENT_TARGETS,
  REQUIRED_SECTIONS,
  SPEC_VERSION,
  STATUSES,
  type SliceMeta,
  VISIBILITIES,
  type VerificationMeta,
} from "./types.ts";
import { parseYamlDetailed, pointerToken } from "./yaml.ts";

/** Core §3's file-size limit for one record. A product record is prose; a megabyte is far beyond any real one. */
export const DOCUMENT_MAX_BYTES = 1024 * 1024;

export interface ReadDocument {
  artifact: Artifact | null;
  diagnostics: Diagnostic[];
  /** The ID the document declares when it is a well-formed string, even if the record could not be read. */
  id: string | null;
  /** File line of a frontmatter JSON pointer, when the key exists. */
  locate: Locate;
}

const REQUIRED_COMMON = [
  "spec",
  "profile",
  "id",
  "type",
  "title",
  "status",
  "owner",
  "visibility",
  "audiences",
] as const;
const OPTIONAL_COMMON = [
  "parent",
  "links",
  "availability",
  "revision",
  "reviewedAt",
  "reviewedBy",
  "extensions",
  "slice",
  "verification",
] as const;
const KNOWN_KEYS = new Set<string>([...REQUIRED_COMMON, ...OPTIONAL_COMMON]);
const LINK_FIELDS = LINK_KINDS.filter((kind) => kind !== "parent") as Exclude<LinkKind, "parent">[];
const AVAILABILITY_KEYS = ["products", "releases", "roles", "editions", "flags"] as const;
const EXTENSION_KEY = /^[^/]+\/.+$/;

/** Core §3, §4, §6 and §7 (ADR 0002): read one document into an Artifact, reporting CORE001 and its kin with origin "profile". */
export function readArtifact(input: DocumentInput): { artifact: Artifact | null; diagnostics: Diagnostic[] } {
  const { artifact, diagnostics } = readDocument(input);
  return { artifact, diagnostics };
}

/** Core §3, §4, §6 and §7: `readArtifact` plus the positions the validator needs to place its own diagnostics on lines. */
export function readDocument(input: DocumentInput): ReadDocument {
  const diagnostics: Diagnostic[] = [];
  const report = (fields: {
    code?: string;
    severity?: "error" | "warning";
    artifact: string | null;
    location?: Location;
    field?: string;
    message: string;
    remediation: string;
  }) => {
    diagnostics.push(
      makeDiagnostic({
        code: fields.code ?? "CORE001",
        severity: fields.severity,
        origin: "profile",
        artifact: fields.artifact,
        path: input.path,
        location: fields.location,
        field: fields.field,
        message: fields.message,
        remediation: fields.remediation,
      }),
    );
  };

  // Core §3: implementations MUST limit file size. Checked before anything is parsed.
  const bytes = Buffer.byteLength(input.source, "utf8");
  if (bytes > DOCUMENT_MAX_BYTES) {
    report({
      artifact: null,
      message: `The document is ${bytes} bytes, more than the ${DOCUMENT_MAX_BYTES / 1024 / 1024} MiB a record may be.`,
      remediation: "Split the record, or move large material such as data or images out of the document and link it.",
    });
    return { artifact: null, diagnostics, id: null, locate: NO_LOCATION };
  }

  const frontmatter = input.frontmatter;
  if (frontmatter === null) {
    report({
      artifact: null,
      location: { line: 1 },
      message: "The document has no frontmatter block between `---` lines at the top of the file.",
      remediation: "Start the file with `---`, the `markset: 0` and `intentset:` keys, and a closing `---` line.",
    });
    return { artifact: null, diagnostics, id: null, locate: NO_LOCATION };
  }

  const parsed = parseYamlDetailed(frontmatter.text);
  if (parsed.error) {
    report({
      artifact: null,
      location: { line: frontmatter.line + parsed.error.line - 1 },
      message: `The frontmatter is not accepted: ${parsed.error.message}`,
      remediation: "Write the frontmatter in the strict subset: block mappings, sequences and quoted or plain scalars.",
    });
    return { artifact: null, diagnostics, id: declaredId(frontmatter.text), locate: NO_LOCATION };
  }

  const root = parsed.value;
  const locate: Locate = (pointer) => {
    const line = parsed.lines.get(pointer);
    return line === undefined ? undefined : { line: frontmatter.line + line - 1 };
  };
  const section = root.intentset;
  const id = isRecord(section) && typeof section.id === "string" && ID_PATTERN.test(section.id) ? section.id : null;
  const problem = (field: string, message: string, remediation: string, code = "CORE001") =>
    report({ code, artifact: id, location: locate(field), field, message, remediation });

  if (!Object.hasOwn(root, "markset")) {
    problem(
      "/markset",
      "The frontmatter has no `markset` key.",
      "Add `markset: 0`, the Markset version the document is written against.",
    );
  } else if (root.markset !== 0) {
    problem(
      "/markset",
      "`markset` must be the number 0.",
      "Write `markset: 0`, unquoted: it is a version, not a flag.",
    );
  }
  if (!Object.hasOwn(root, "intentset")) {
    problem(
      "/intentset",
      "The frontmatter has no `intentset` block.",
      "Add an `intentset:` mapping with the common fields of Core §4.",
    );
    return { artifact: null, diagnostics, id, locate };
  }
  if (!isRecord(section)) {
    problem("/intentset", "`intentset` must be a mapping.", "Write the common fields as keys under `intentset:`.");
    return { artifact: null, diagnostics, id, locate };
  }

  const meta = readMeta(section, problem);
  const usable = meta !== null;
  if (usable) checkSections(input, meta, id, report);

  if (!usable) return { artifact: null, diagnostics, id, locate };
  const foreign: Record<string, unknown> = {};
  for (const key of Object.keys(root).sort(compareStrings)) {
    if (key !== "markset" && key !== "intentset") foreign[key] = root[key];
  }
  return {
    artifact: {
      meta,
      path: input.path,
      sourceHash: sha256Hex(input.source),
      body: bodyOf(input.source),
      headings: input.headings,
      foreign,
    },
    diagnostics,
    id,
    locate,
  };
}

type Problem = (field: string, message: string, remediation: string, code?: string) => void;

/** The `intentset` block against Core §4 and the schema; null when identity or a required common field is unusable. */
function readMeta(s: Record<string, unknown>, problem: Problem): ArtifactMeta | null {
  let usable = true;
  const base = "/intentset";

  for (const key of Object.keys(s).sort(compareStrings)) {
    if (!KNOWN_KEYS.has(key)) {
      problem(
        `${base}/${pointerToken(key)}`,
        `Unknown key \`${key}\` under intentset.`,
        "Remove it, or move it under `extensions` with a namespaced key such as `org.example/change`.",
      );
    }
  }
  for (const key of [...REQUIRED_COMMON, ...OPTIONAL_COMMON]) {
    if (Object.hasOwn(s, key) && s[key] === null) {
      problem(`${base}/${key}`, `\`${key}\` is present with no value.`, `Give \`${key}\` a value, or remove the key.`);
    }
  }
  for (const key of REQUIRED_COMMON) {
    if (!Object.hasOwn(s, key)) {
      problem(`${base}/${key}`, `Required field \`${key}\` is missing.`, `Add \`${key}\` under intentset (Core §4).`);
    }
    if (!Object.hasOwn(s, key) || s[key] === null) usable = false;
  }

  if (Object.hasOwn(s, "spec") && s.spec !== null && s.spec !== SPEC_VERSION) {
    const hint = typeof s.spec === "number" ? " Quote it: unquoted, it reads as a number." : "";
    problem(
      `${base}/spec`,
      `\`spec\` must be the string "${SPEC_VERSION}".${hint}`,
      `Write \`spec: '${SPEC_VERSION}'\`.`,
    );
    usable = false;
  }

  const idValue = s.id;
  if (idValue !== undefined && idValue !== null && (typeof idValue !== "string" || !ID_PATTERN.test(idValue))) {
    problem(
      `${base}/id`,
      `\`id\` must match ${ID_PATTERN.source}.`,
      "Use upper-case letters and digits in dash-separated groups, such as BEH-ASMT-SCHEDULE.",
    );
    usable = false;
  }

  const typeValue = s.type;
  const type =
    typeof typeValue === "string" && (ARTIFACT_TYPES as readonly string[]).includes(typeValue)
      ? (typeValue as ArtifactType)
      : null;
  if (typeValue !== undefined && typeValue !== null && type === null) {
    problem(
      `${base}/type`,
      `\`type\` must be one of ${ARTIFACT_TYPES.join(", ")}.`,
      "Choose the Core §2 type the artifact is.",
    );
    usable = false;
  }

  if (Object.hasOwn(s, "profile") && s.profile !== null) {
    if (typeof s.profile !== "string") {
      problem(`${base}/profile`, "`profile` must be a string.", "Write `profile: intentset/<type>/0.1`.");
      usable = false;
    } else if (type !== null && s.profile !== `intentset/${type}/${SPEC_VERSION}`) {
      problem(
        `${base}/profile`,
        `\`profile\` must equal intentset/${type}/${SPEC_VERSION} for ${aType(type)}.`,
        `Set profile to intentset/${type}/${SPEC_VERSION}, or change type.`,
      );
      usable = false;
    }
  }

  if (Object.hasOwn(s, "title") && s.title !== null && (typeof s.title !== "string" || s.title === "")) {
    problem(
      `${base}/title`,
      "`title` must be a non-empty string.",
      "Give the artifact a title; quote it if it would read as a number.",
    );
    usable = false;
  }
  if (Object.hasOwn(s, "status") && s.status !== null && !(STATUSES as readonly unknown[]).includes(s.status)) {
    problem(`${base}/status`, `\`status\` must be one of ${STATUSES.join(", ")}.`, "Use the Core §7 lifecycle status.");
    usable = false;
  }
  if (Object.hasOwn(s, "owner") && s.owner !== null && (typeof s.owner !== "string" || s.owner === "")) {
    problem(
      `${base}/owner`,
      "`owner` must be a non-empty string.",
      "Name one accountable team or role from the owner registry.",
    );
    usable = false;
  }
  if (
    Object.hasOwn(s, "visibility") &&
    s.visibility !== null &&
    !(VISIBILITIES as readonly unknown[]).includes(s.visibility)
  ) {
    problem(
      `${base}/visibility`,
      `\`visibility\` must be one of ${VISIBILITIES.join(", ")}.`,
      "Choose the narrowest visibility that fits; publication fails closed.",
    );
    usable = false;
  }
  let audiences: string[] | null = null;
  if (Object.hasOwn(s, "audiences") && s.audiences !== null) {
    audiences = stringList(s.audiences, `${base}/audiences`, "audiences", problem, { minItems: 1 });
    if (audiences === null) usable = false;
  }

  let parent: string | undefined;
  if (Object.hasOwn(s, "parent") && s.parent !== null) {
    if (typeof s.parent === "string" && ID_PATTERN.test(s.parent)) parent = s.parent;
    else
      problem(
        `${base}/parent`,
        "`parent` must be an artifact ID.",
        "Name the navigation parent's ID, such as CAP-ASMT-ASSIGN.",
      );
  } else if (!Object.hasOwn(s, "parent") && type !== null && PARENT_TARGETS[type] !== undefined) {
    problem(
      `${base}/parent`,
      `${capitalize(aType(type))} has no \`parent\`, so its navigation chain does not reach a product.`,
      `Add \`parent\` naming the ${PARENT_TARGETS[type]?.join(" or ")} it belongs to (Core §5).`,
      "CORE004",
    );
  }

  const links = readLinks(s.links, base, problem);
  let availability: Availability | undefined;
  if (Object.hasOwn(s, "availability") && s.availability !== null) {
    availability = readAvailability(s.availability, `${base}/availability`, problem) ?? undefined;
  } else if (!Object.hasOwn(s, "availability") && (type === "behavior" || type === "knowledge")) {
    problem(
      `${base}/availability`,
      `${capitalize(aType(type))} must declare \`availability\` with products, releases, roles, editions and flags.`,
      "Add the availability block; empty flags is `flags: []`, never an omission (Core §7).",
      "CORE005",
    );
  }

  let revision: number | undefined;
  if (Object.hasOwn(s, "revision") && s.revision !== null) {
    if (typeof s.revision === "number" && Number.isInteger(s.revision) && s.revision >= 1) revision = s.revision;
    else
      problem(
        `${base}/revision`,
        "`revision` must be a positive integer.",
        "Write an unquoted whole number from 1 upward.",
      );
  }
  let reviewedAt: string | undefined;
  if (Object.hasOwn(s, "reviewedAt") && s.reviewedAt !== null) {
    if (typeof s.reviewedAt === "string") reviewedAt = s.reviewedAt;
    else problem(`${base}/reviewedAt`, "`reviewedAt` must be a string.", "Quote the date, for example '2026-10-02'.");
  }
  let reviewedBy: string | undefined;
  if (Object.hasOwn(s, "reviewedBy") && s.reviewedBy !== null) {
    if (typeof s.reviewedBy === "string") reviewedBy = s.reviewedBy;
    else problem(`${base}/reviewedBy`, "`reviewedBy` must be a string.", "Name the reviewer or review record.");
  }
  let extensions: Record<string, unknown> | undefined;
  if (Object.hasOwn(s, "extensions") && s.extensions !== null) {
    if (!isRecord(s.extensions)) {
      problem(`${base}/extensions`, "`extensions` must be a mapping.", "Write namespaced keys under `extensions:`.");
    } else {
      extensions = {};
      for (const key of Object.keys(s.extensions).sort(compareStrings)) {
        if (EXTENSION_KEY.test(key)) extensions[key] = s.extensions[key];
        else
          problem(
            `${base}/extensions/${pointerToken(key)}`,
            `Extension key \`${key}\` is not namespaced.`,
            "Prefix it with a namespace and a slash, such as `org.example/change`.",
          );
      }
    }
  }

  let slice: SliceMeta | undefined;
  if (Object.hasOwn(s, "slice") && s.slice !== null) {
    slice = readSlice(s.slice, `${base}/slice`, problem) ?? undefined;
  } else if (!Object.hasOwn(s, "slice") && type === "slice") {
    problem(
      `${base}/slice`,
      "A slice must carry the `slice` metadata block.",
      "Add `slice:` with kind, domain, entrypoint, layers, claims and usesResources (VSA §3).",
    );
  }
  let verification: VerificationMeta | undefined;
  if (Object.hasOwn(s, "verification") && s.verification !== null) {
    verification = readVerification(s.verification, `${base}/verification`, problem) ?? undefined;
  } else if (!Object.hasOwn(s, "verification") && type === "verification") {
    problem(
      `${base}/verification`,
      "A verification must carry the `verification` metadata block.",
      "Add `verification:` with method, locator and selector (Core §8).",
    );
  }

  if (!usable || type === null || audiences === null) return null;
  const meta: ArtifactMeta = {
    spec: SPEC_VERSION,
    profile: s.profile as string,
    id: s.id as string,
    type,
    title: s.title as string,
    status: s.status as ArtifactMeta["status"],
    owner: s.owner as string,
    visibility: s.visibility as ArtifactMeta["visibility"],
    audiences,
    links,
  };
  if (parent !== undefined) meta.parent = parent;
  if (availability !== undefined) meta.availability = availability;
  if (revision !== undefined) meta.revision = revision;
  if (reviewedAt !== undefined) meta.reviewedAt = reviewedAt;
  if (reviewedBy !== undefined) meta.reviewedBy = reviewedBy;
  if (extensions !== undefined) meta.extensions = extensions;
  if (slice !== undefined) meta.slice = slice;
  if (verification !== undefined) meta.verification = verification;
  return meta;
}

interface ListOptions {
  minItems?: number;
  pattern?: RegExp;
  /** Code for a repeated entry; CORE001 unless the list is a relationship. */
  duplicateCode?: string;
}

/**
 * An array of non-empty unique strings. Bad and repeated entries are reported
 * and left out, so one bad ID does not detach the others; null when the value
 * is not an array or too few good entries remain.
 */
function stringList(
  value: unknown,
  field: string,
  name: string,
  problem: Problem,
  options: ListOptions = {},
): string[] | null {
  if (!Array.isArray(value)) {
    problem(field, `\`${name}\` must be a list.`, `Write ${name} as a sequence, for example \`${name}: [a, b]\`.`);
    return null;
  }
  const out: string[] = [];
  value.forEach((item, i) => {
    if (typeof item !== "string" || item === "") {
      problem(
        `${field}/${i}`,
        `Entry ${i} of \`${name}\` must be a non-empty string.`,
        "Quote the value if it reads as a number or boolean.",
      );
      return;
    }
    if (options.pattern !== undefined && !options.pattern.test(item)) {
      problem(
        `${field}/${i}`,
        `Entry ${i} of \`${name}\` is not an artifact ID.`,
        "Use an ID such as BEH-ASMT-SCHEDULE.",
      );
      return;
    }
    if (out.includes(item)) {
      problem(
        `${field}/${i}`,
        `\`${item}\` appears twice in \`${name}\`.`,
        "Keep one entry per ID.",
        options.duplicateCode ?? "CORE001",
      );
      return;
    }
    out.push(item);
  });
  if (options.minItems !== undefined && out.length < options.minItems) {
    if (value.length < options.minItems) {
      problem(
        field,
        `\`${name}\` must list at least ${options.minItems} entr${options.minItems === 1 ? "y" : "ies"}.`,
        `Add at least one value to ${name}.`,
      );
    }
    return null;
  }
  return out;
}

function readLinks(value: unknown, base: string, problem: Problem): ArtifactMeta["links"] {
  const links: ArtifactMeta["links"] = {};
  if (value === undefined || value === null) return links;
  if (!isRecord(value)) {
    problem(
      `${base}/links`,
      "`links` must be a mapping of relationship names to ID lists.",
      "Write `links:` with keys from the Core §5 table.",
    );
    return links;
  }
  for (const key of Object.keys(value).sort(compareStrings)) {
    if (!(LINK_FIELDS as readonly string[]).includes(key)) {
      problem(
        `${base}/links/${pointerToken(key)}`,
        `Unknown relationship \`${key}\` under links.`,
        `Use one of ${LINK_FIELDS.join(", ")}; inverse edges are derived, never written (Core §5).`,
      );
    }
  }
  for (const kind of LINK_FIELDS) {
    if (!Object.hasOwn(value, kind)) continue;
    const list = stringList(value[kind], `${base}/links/${kind}`, kind, problem, {
      pattern: ID_PATTERN,
      duplicateCode: "CORE003",
    });
    if (list !== null) links[kind] = list;
  }
  return links;
}

function readAvailability(value: unknown, field: string, problem: Problem): Availability | null {
  if (!isRecord(value)) {
    problem(
      field,
      "`availability` must be a mapping with products, releases, roles, editions and flags.",
      "Write the five dimension lists under `availability:`.",
    );
    return null;
  }
  let ok = true;
  for (const key of Object.keys(value).sort(compareStrings)) {
    if (!(AVAILABILITY_KEYS as readonly string[]).includes(key)) {
      problem(
        `${field}/${pointerToken(key)}`,
        `Unknown availability dimension \`${key}\`.`,
        `The dimensions are ${AVAILABILITY_KEYS.join(", ")}.`,
      );
      ok = false;
    }
  }
  const out: Partial<Availability> = {};
  for (const key of AVAILABILITY_KEYS) {
    if (!Object.hasOwn(value, key) || value[key] === null) {
      problem(
        `${field}/${key}`,
        `Availability dimension \`${key}\` is missing.`,
        key === "flags"
          ? "Write `flags: []` when no flag is required; no implicit wildcard exists."
          : `List the ${key} the artifact applies to.`,
      );
      ok = false;
      continue;
    }
    const list = stringList(value[key], `${field}/${key}`, key, problem, { minItems: key === "flags" ? 0 : 1 });
    if (list === null) ok = false;
    else out[key] = list;
  }
  return ok ? (out as Availability) : null;
}

function readSlice(value: unknown, field: string, problem: Problem): SliceMeta | null {
  if (!isRecord(value)) {
    problem(
      field,
      "`slice` must be a mapping.",
      "Write kind, domain, entrypoint, layers, claims and usesResources under `slice:`.",
    );
    return null;
  }
  let ok = true;
  const known = ["kind", "rationale", "domain", "entrypoint", "layers", "claims", "usesResources"];
  for (const key of Object.keys(value).sort(compareStrings)) {
    if (!known.includes(key)) {
      problem(
        `${field}/${pointerToken(key)}`,
        `Unknown slice key \`${key}\`.`,
        `The slice keys are ${known.join(", ")} (VSA §3).`,
      );
      ok = false;
    }
  }
  for (const key of ["kind", "domain", "entrypoint", "layers", "claims", "usesResources"]) {
    if (!Object.hasOwn(value, key) || value[key] === null) {
      problem(`${field}/${key}`, `Slice field \`${key}\` is missing.`, `Add \`${key}\` under slice (VSA §3).`);
      ok = false;
    }
  }
  if (Object.hasOwn(value, "kind") && value.kind !== null && value.kind !== "product" && value.kind !== "technical") {
    problem(
      `${field}/kind`,
      "`slice.kind` must be product or technical.",
      "A slice that owns behaviors is product; one that owns only mechanisms is technical.",
    );
    ok = false;
  }
  let rationale: string | undefined;
  if (Object.hasOwn(value, "rationale")) {
    if (typeof value.rationale === "string") rationale = value.rationale;
    else {
      problem(
        `${field}/rationale`,
        "`slice.rationale` must be a string.",
        "Explain in one sentence why the slice is technical.",
      );
      ok = false;
    }
  }
  for (const key of ["domain", "entrypoint"] as const) {
    if (Object.hasOwn(value, key) && value[key] !== null && typeof value[key] !== "string") {
      problem(
        `${field}/${key}`,
        `\`slice.${key}\` must be a string.`,
        key === "domain"
          ? "Name the product-oriented grouping the slice belongs to."
          : "Give the repository-relative path of the slice's public entry module.",
      );
      ok = false;
    }
  }
  const layers: Record<string, string[]> = {};
  if (Object.hasOwn(value, "layers") && value.layers !== null) {
    if (!isRecord(value.layers)) {
      problem(
        `${field}/layers`,
        "`slice.layers` must be a mapping of layer names to pattern lists.",
        "Write each layer as `name: [pattern, ...]`; `{}` declares none.",
      );
      ok = false;
    } else {
      for (const layer of Object.keys(value.layers).sort(compareStrings)) {
        const list = stringList(
          value.layers[layer],
          `${field}/layers/${pointerToken(layer)}`,
          `layers.${layer}`,
          problem,
        );
        if (list === null) ok = false;
        else layers[layer] = list;
      }
    }
  }
  const claims: Claim[] = [];
  if (Object.hasOwn(value, "claims") && value.claims !== null) {
    if (!Array.isArray(value.claims)) {
      problem(
        `${field}/claims`,
        "`slice.claims` must be a list of `{ kind, path }` records.",
        "Write each claim as `- kind: source` and `path: ...`.",
      );
      ok = false;
    } else {
      value.claims.forEach((claim, i) => {
        const read = readClaim(claim, `${field}/claims/${i}`, problem);
        if (read === null) ok = false;
        else claims.push(read);
      });
    }
  }
  let usesResources: string[] = [];
  if (Object.hasOwn(value, "usesResources") && value.usesResources !== null) {
    const list = stringList(value.usesResources, `${field}/usesResources`, "usesResources", problem, {
      pattern: ID_PATTERN,
    });
    if (list === null) ok = false;
    else usesResources = list;
  }
  if (!ok) return null;
  const slice: SliceMeta = {
    kind: value.kind as SliceMeta["kind"],
    domain: value.domain as string,
    entrypoint: value.entrypoint as string,
    layers,
    claims,
    usesResources,
  };
  if (rationale !== undefined) slice.rationale = rationale;
  return slice;
}

function readClaim(value: unknown, field: string, problem: Problem): Claim | null {
  if (!isRecord(value)) {
    problem(field, "A claim must be a mapping with kind and path.", "Write `- kind: source` and `path: src/...`.");
    return null;
  }
  let ok = true;
  for (const key of Object.keys(value).sort(compareStrings)) {
    if (key !== "kind" && key !== "path") {
      problem(`${field}/${pointerToken(key)}`, `Unknown claim key \`${key}\`.`, "A claim has kind and path only.");
      ok = false;
    }
  }
  if (!(CLAIM_KINDS as readonly unknown[]).includes(value.kind)) {
    problem(
      `${field}/kind`,
      `\`claims.kind\` must be one of ${CLAIM_KINDS.join(", ")}.`,
      "Choose the kind of files the pattern claims.",
    );
    ok = false;
  }
  if (typeof value.path !== "string" || value.path === "") {
    problem(
      `${field}/path`,
      "`claims.path` must be a non-empty pattern.",
      "Give a repository-relative POSIX pattern such as src/features/x/**.",
    );
    ok = false;
  }
  return ok ? { kind: value.kind as Claim["kind"], path: value.path as string } : null;
}

function readVerification(value: unknown, field: string, problem: Problem): VerificationMeta | null {
  if (!isRecord(value)) {
    problem(
      field,
      "`verification` must be a mapping with method, locator and selector.",
      "Write the three keys under `verification:` (Core §8).",
    );
    return null;
  }
  let ok = true;
  for (const key of Object.keys(value).sort(compareStrings)) {
    if (!["method", "locator", "selector"].includes(key)) {
      problem(
        `${field}/${pointerToken(key)}`,
        `Unknown verification key \`${key}\`.`,
        "The keys are method, locator and selector.",
      );
      ok = false;
    }
  }
  if (value.method !== "automated" && value.method !== "manual") {
    problem(
      `${field}/method`,
      "`verification.method` must be automated or manual.",
      "Say whether a tool or a reviewer performs the check.",
    );
    ok = false;
  }
  for (const key of ["locator", "selector"] as const) {
    if (typeof value[key] !== "string" || value[key] === "") {
      problem(
        `${field}/${key}`,
        `\`verification.${key}\` must be a non-empty string.`,
        key === "locator"
          ? "Give the repository-relative path of the check."
          : "Give the stable test or review-case identifier.",
      );
      ok = false;
    }
  }
  if (!ok) return null;
  return {
    method: value.method as VerificationMeta["method"],
    locator: value.locator as string,
    selector: value.selector as string,
  };
}

/** Core §6: a level-one heading equal to the title and the type's level-two sections, outside code fences. */
function checkSections(
  input: DocumentInput,
  meta: ArtifactMeta,
  id: string | null,
  report: (fields: { artifact: string | null; location?: Location; message: string; remediation: string }) => void,
): void {
  const title = meta.title.replace(/\s+/g, " ").trim();
  const level1 = input.headings.filter((h) => h.depth === 1);
  if (!level1.some((h) => h.text === title)) {
    const first = level1[0];
    report({
      artifact: id,
      location: first === undefined ? undefined : { line: first.line },
      message:
        first === undefined
          ? `The document has no level-one heading; Core §6 requires one equal to the title "${title}".`
          : `The level-one heading "${first.text}" does not match the title "${title}".`,
      remediation: `Add or correct the heading \`# ${title}\` so it equals intentset.title.`,
    });
  }
  const level2 = new Set(input.headings.filter((h) => h.depth === 2).map((h) => h.text));
  for (const section of REQUIRED_SECTIONS[meta.type]) {
    if (level2.has(section)) continue;
    report({
      artifact: id,
      message: `Required section "${section}" is missing from ${aType(meta.type)} document.`,
      remediation: `Add a level-two heading \`## ${section}\` with substantive prose (Core §6).`,
    });
  }
}

/**
 * Core §5 and §11: the ID a frontmatter that the reader rejected appears to declare, an `id:`
 * line inside the top-level `intentset:` block. It is used only so references
 * to the record are not also reported as unresolved; it is never reported as
 * the record's identity, since the record was not read.
 */
export function declaredId(text: string): string | null {
  let inside = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\S/.test(line)) inside = /^intentset:\s*(?:#.*)?$/.test(line);
    if (!inside) continue;
    const match = /^ +id: *(['"]?)([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\1 *(?:#.*)?$/.exec(line);
    if (match !== null) return match[2];
  }
  return null;
}

/** Everything after the closing frontmatter fence, line endings kept. */
function bodyOf(source: string): string {
  const text = source.startsWith("﻿") ? source.slice(1) : source;
  const lines = text.split("\n");
  const close = closingFenceIndex(lines);
  return close === -1 ? text : lines.slice(close + 1).join("\n");
}
