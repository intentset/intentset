/**
 * The repository registries (Core §4, §7; VSA §3): owners, audiences, the
 * four release dimensions, and the shared-resource inventory. The file is
 * `registries.yaml` in the shape of examples/scheduling/registries.yaml.
 * A missing or empty file is empty registries, which the validator reads as
 * "not declared" rather than "nothing allowed".
 */
import type { Diagnostic } from "./diagnostics.ts";
import { compareStrings, isRecord, makeDiagnostic } from "./report.ts";
import { EMPTY_REGISTRIES, ID_PATTERN, type Registries, type Resource } from "./types.ts";
import { parseYamlDetailed } from "./yaml.ts";

const LIST_KEYS = ["owners", "audiences", "releases", "roles", "editions", "flags"] as const;
const KNOWN_KEYS = new Set<string>([...LIST_KEYS, "resources"]);

/**
 * Core §4 and §7, VSA §3: read registries.yaml. Shape problems are CFG002
 * (origin "profile"); a YAML rejection is CFG002, also with origin "profile" (origin "syntax" is Markset's alone). Every
 * list comes back sorted. `null` text means the file is absent.
 */
export function readRegistries(
  text: string | null,
  path: string,
): { registries: Registries; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const registries: Registries = { ...EMPTY_REGISTRIES, resources: [] };
  if (text === null || text.trim() === "") return { registries, diagnostics };

  const parsed = parseYamlDetailed(text);
  if (parsed.error) {
    diagnostics.push(
      makeDiagnostic({
        code: "CFG002",
        origin: "profile",
        artifact: null,
        path,
        location: { line: parsed.error.line },
        message: `registries.yaml does not parse: ${parsed.error.message}`,
        remediation: "Write the registries as a block mapping of string lists and a resources list.",
      }),
    );
    return { registries, diagnostics };
  }
  const root = parsed.value;
  const report = (field: string, message: string, remediation: string) => {
    const line = parsed.lines.get(field);
    diagnostics.push(
      makeDiagnostic({
        code: "CFG002",
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
    if (!KNOWN_KEYS.has(key)) {
      report(`/${key}`, `Unknown registry \`${key}\`.`, `Remove it; the registries are ${[...KNOWN_KEYS].join(", ")}.`);
    }
  }
  for (const key of LIST_KEYS) {
    const value = root[key];
    if (value === undefined || value === null) continue;
    const list = stringList(value, `/${key}`, report);
    if (list !== null) registries[key] = list;
  }
  const resources = root.resources;
  if (resources !== undefined && resources !== null) {
    if (!Array.isArray(resources)) {
      report(
        "/resources",
        "`resources` must be a list of resource records.",
        "Write each resource as `- id:`, `path:`, `owner:`, `consumers:`.",
      );
    } else {
      const seen = new Set<string>();
      resources.forEach((entry, i) => {
        const resource = readResource(entry, `/resources/${i}`, report);
        if (resource === null) return;
        if (seen.has(resource.id)) {
          report(`/resources/${i}/id`, `Resource ${resource.id} is declared twice.`, "Keep one record per resource.");
          return;
        }
        seen.add(resource.id);
        registries.resources.push(resource);
      });
      registries.resources.sort((a, b) => compareStrings(a.id, b.id));
    }
  }
  return { registries, diagnostics };
}

type Report = (field: string, message: string, remediation: string) => void;

function stringList(value: unknown, field: string, report: Report): string[] | null {
  if (!Array.isArray(value)) {
    report(
      field,
      `\`${field.slice(1)}\` must be a list of strings.`,
      "Write it as a block or flow sequence of strings.",
    );
    return null;
  }
  const out: string[] = [];
  let ok = true;
  value.forEach((item, i) => {
    if (typeof item !== "string" || item === "") {
      report(
        `${field}/${i}`,
        `Entry ${i} of \`${field.slice(1)}\` is not a non-empty string.`,
        "Quote the value if it reads as a number or boolean.",
      );
      ok = false;
      return;
    }
    if (out.includes(item)) {
      report(`${field}/${i}`, `\`${item}\` is listed twice under \`${field.slice(1)}\`.`, "Keep one entry per value.");
      return;
    }
    out.push(item);
  });
  return ok ? out.sort(compareStrings) : null;
}

function readResource(value: unknown, field: string, report: Report): Resource | null {
  if (!isRecord(value)) {
    report(field, "A resource must be a mapping.", "Write it as `- id:`, `path:`, `owner:`, `consumers:`.");
    return null;
  }
  let ok = true;
  for (const key of Object.keys(value).sort(compareStrings)) {
    if (!["id", "path", "owner", "consumers"].includes(key)) {
      report(`${field}/${key}`, `Unknown resource key \`${key}\`.`, "A resource has id, path, owner and consumers.");
      ok = false;
    }
  }
  const { id, path, owner } = value;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    report(
      `${field}/id`,
      "A resource needs an `id` matching the artifact ID pattern.",
      "Use an upper-case ID such as RES-ASSESSMENT-DATA.",
    );
    ok = false;
  }
  if (typeof path !== "string" || path === "") {
    report(
      `${field}/path`,
      "A resource needs a repository-relative `path`.",
      "Name the file that defines the resource.",
    );
    ok = false;
  }
  if (typeof owner !== "string" || owner === "") {
    report(`${field}/owner`, "A resource needs an `owner`.", "Name the technical owner from the owner registry.");
    ok = false;
  }
  let consumers: string[] = [];
  if (value.consumers !== undefined && value.consumers !== null) {
    const list = stringList(value.consumers, `${field}/consumers`, report);
    if (list === null) ok = false;
    else consumers = list;
  }
  if (!ok) return null;
  return { id: id as string, path: path as string, owner: owner as string, consumers };
}
