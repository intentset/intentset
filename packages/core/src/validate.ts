/**
 * The L1 pipeline (Core §4, §5, §7, §11; VSA §3): read every document, hold
 * IDs unique, build the graph, check relationships, decomposition, lifecycle
 * claims against the registries, attachment, slice metadata, and at L2 and
 * above ownership. Diagnostics come back sorted by `compareDiagnostics`.
 *
 * Two choices keep diagnostics at their cause. A record that could not be
 * read is remembered by the ID it declared, and references to that ID are not
 * reported as unresolved: the CORE001 on the record already says what to fix.
 * Of two records with one ID, the first by path stays in the graph and both
 * are reported as CORE002; neither is merged with the other.
 */
import { type ReadDocument, readDocument } from "./artifact.ts";
import { type Diagnostic, hasErrors, sortDiagnostics } from "./diagnostics.ts";
import { buildGraph, incomingEdges, outgoing } from "./graph.ts";
import { type Locate, aType, capitalize, compareStrings, describeTypes, makeDiagnostic } from "./report.ts";
import {
  type Artifact,
  type ArtifactType,
  type DocumentInput,
  type Graph,
  LEVELS,
  LINK_ENDPOINTS,
  LINK_KINDS,
  type LinkKind,
  PARENT_TARGETS,
  type Registries,
  type ValidationOptions,
  type ValidationResult,
} from "./types.ts";

/**
 * Core §5 pairs `supports` sources with targets (outcome → intent,
 * capability → outcome), which LINK_ENDPOINTS cannot say; this narrows it.
 */
const SUPPORTS_TARGETS: Partial<Record<ArtifactType, readonly ArtifactType[]>> = {
  outcome: ["intent"],
  capability: ["outcome"],
};

interface Context {
  graph: Graph;
  registries: Registries;
  /** IDs declared by records that could not be read: references to them are not unresolved. */
  unreadable: Set<string>;
  locators: Map<string, Locate>;
  diagnostics: Diagnostic[];
  levelIndex: number;
}

/** Core §11: validate a repository scope at a conformance level. The whole L1 pipeline; CORE006 joins at L2. */
export function validate(
  inputs: readonly DocumentInput[],
  registries: Registries,
  options: ValidationOptions = {},
): ValidationResult {
  const level = options.level ?? "L1";
  const diagnostics: Diagnostic[] = [];
  const sorted = [...inputs].sort((a, b) => compareStrings(a.path, b.path));
  const read: ReadDocument[] = [];
  for (const input of sorted) {
    diagnostics.push(...input.syntax);
    const doc = readDocument(input);
    diagnostics.push(...doc.diagnostics);
    read.push(doc);
  }

  const unreadable = new Set<string>();
  const byId = new Map<string, ReadDocument[]>();
  for (const doc of read) {
    if (doc.artifact === null) {
      if (doc.id !== null) unreadable.add(doc.id);
      continue;
    }
    const id = doc.artifact.meta.id;
    const list = byId.get(id);
    if (list === undefined) byId.set(id, [doc]);
    else list.push(doc);
  }

  const kept = new Set<ReadDocument>();
  const locators = new Map<string, Locate>();
  for (const id of [...byId.keys()].sort(compareStrings)) {
    const docs = byId.get(id) ?? [];
    kept.add(docs[0]);
    locators.set(id, docs[0].locate);
    if (docs.length < 2) continue;
    for (const doc of docs) {
      diagnostics.push(
        makeDiagnostic({
          code: "CORE002",
          origin: "graph",
          artifact: id,
          path: doc.artifact?.path ?? null,
          location: doc.locate("/intentset/id"),
          field: "/intentset/id",
          message: `${id} is declared by ${docs.length} documents: ${docs.map((d) => d.artifact?.path).join(", ")}.`,
          remediation: "Give each artifact its own ID; an ID is never reused, and tools never merge duplicate records.",
        }),
      );
    }
  }

  const artifacts: Artifact[] = [];
  for (const doc of read) {
    if (doc.artifact !== null && kept.has(doc)) artifacts.push(doc.artifact);
  }
  for (const id of unreadable) {
    if (byId.has(id)) unreadable.delete(id);
  }

  const graph = buildGraph(artifacts);
  const context: Context = { graph, registries, unreadable, locators, diagnostics, levelIndex: LEVELS.indexOf(level) };
  checkRelationships(context);
  checkCycles(context);
  checkLifecycle(context);
  checkAttachment(context);
  checkSlices(context);
  if (context.levelIndex >= 1) checkOwnership(context);

  const all = sortDiagnostics(diagnostics);
  return { graph, diagnostics: all, ok: !hasErrors(all) };
}

interface Report {
  code: string;
  severity?: "error" | "warning";
  origin?: "graph" | "profile";
  field?: string;
  message: string;
  remediation: string;
}

function reportOn(context: Context, artifact: Artifact, fields: Report): void {
  const locate = context.locators.get(artifact.meta.id);
  context.diagnostics.push(
    makeDiagnostic({
      code: fields.code,
      severity: fields.severity,
      origin: fields.origin ?? "graph",
      artifact: artifact.meta.id,
      path: artifact.path,
      location: fields.field !== undefined && locate !== undefined ? locate(fields.field) : undefined,
      field: fields.field,
      message: fields.message,
      remediation: fields.remediation,
    }),
  );
}

function sortedArtifacts(graph: Graph): Artifact[] {
  return [...graph.artifacts.keys()].sort(compareStrings).map((id) => graph.artifacts.get(id) as Artifact);
}

/** Core §5: every reference resolves, endpoint types match the table, no self-edge, `replacedBy` keeps the type. */
function checkRelationships(context: Context): void {
  const { graph, unreadable } = context;
  for (const artifact of sortedArtifacts(graph)) {
    const { meta } = artifact;
    const id = meta.id;
    const resolve = (target: string, field: string, kind: string): Artifact | null => {
      const found = graph.artifacts.get(target);
      if (found !== undefined) return found;
      if (!unreadable.has(target)) {
        reportOn(context, artifact, {
          code: "CORE003",
          field,
          message: `${kind} names ${target}, which is not in the graph.`,
          remediation: `Create ${target}, or correct the ID to an artifact in the same snapshot.`,
        });
      }
      return null;
    };

    if (meta.parent !== undefined) {
      const targets = PARENT_TARGETS[meta.type];
      if (targets === undefined) {
        reportOn(context, artifact, {
          code: meta.type === "product" ? "CORE004" : "CORE003",
          field: "/intentset/parent",
          message:
            meta.type === "product"
              ? `${id} is a product and has a parent; a product is the root of the navigation spine.`
              : `${id} is ${aType(meta.type)} and has a parent; ${aType(meta.type)} is reached through its typed relationships, not a navigation parent.`,
          remediation: "Remove `parent` (Core §5).",
        });
      } else if (meta.parent !== id) {
        const target = resolve(meta.parent, "/intentset/parent", "parent");
        if (target !== null && !targets.includes(target.meta.type)) {
          reportOn(context, artifact, {
            code: "CORE003",
            field: "/intentset/parent",
            message: `The parent of ${aType(meta.type)} must be ${describeTypes(targets)}, but ${meta.parent} is ${aType(target.meta.type)}.`,
            remediation: `Point parent at the ${targets.join(" or ")} ${id} belongs to.`,
          });
        }
      }
    }

    for (const kind of LINK_KINDS) {
      if (kind === "parent") continue;
      const list = meta.links[kind];
      if (list === undefined) continue;
      const field = `/intentset/links/${kind}`;
      if (kind === "replacedBy") {
        if (meta.status !== "retired") {
          reportOn(context, artifact, {
            code: "CORE005",
            field,
            message: `${id} names successors in replacedBy while its status is ${meta.status}; only a retired artifact is replaced.`,
            remediation: "Set status to retired, or remove replacedBy until it is.",
          });
        }
        list.forEach((target, i) => {
          if (target === id) return;
          const found = resolve(target, `${field}/${i}`, "replacedBy");
          if (found !== null && found.meta.type !== meta.type) {
            reportOn(context, artifact, {
              code: "CORE003",
              field: `${field}/${i}`,
              message: `replacedBy must name a successor of the same type, ${meta.type}, but ${target} is ${aType(found.meta.type)}.`,
              remediation:
                "Name the successor of the same type; a change of type is a new artifact, not a replacement.",
            });
          }
        });
        continue;
      }
      const endpoints = LINK_ENDPOINTS[kind];
      if (!endpoints.from.includes(meta.type)) {
        reportOn(context, artifact, {
          code: "CORE003",
          field,
          message: `${kind} is written on ${aType(meta.type)}; only ${describeTypes(endpoints.from)} has ${kind}.`,
          remediation: `Remove the link, or author the relationship from the ${endpoints.from.join(" or ")} side; inverses are derived (Core §5).`,
        });
        continue;
      }
      const allowed = kind === "supports" ? (SUPPORTS_TARGETS[meta.type] ?? endpoints.to) : endpoints.to;
      list.forEach((target, i) => {
        if (target === id) {
          if (kind === "requires") return;
          reportOn(context, artifact, {
            code: "CORE003",
            field: `${field}/${i}`,
            message: `${id} names itself in ${kind}.`,
            remediation: "Remove the self-reference; an artifact cannot relate to itself.",
          });
          return;
        }
        const found = resolve(target, `${field}/${i}`, kind);
        if (found !== null && !allowed.includes(found.meta.type)) {
          reportOn(context, artifact, {
            code: "CORE003",
            field: `${field}/${i}`,
            message: `${kind} on ${aType(meta.type)} must target ${describeTypes(allowed)}, but ${target} is ${aType(found.meta.type)}.`,
            remediation: `Point ${kind} at ${describeTypes(allowed)}, or use the relationship that fits.`,
          });
        }
      });
    }
  }
}

/** Core §5: cycles in `parent`, `replacedBy` and `requires`, a self-reference being the shortest. */
function checkCycles(context: Context): void {
  const { graph } = context;
  for (const kind of ["parent", "replacedBy", "requires"] as const) {
    const ids = [...graph.artifacts.keys()].sort(compareStrings);
    const successors = new Map<string, string[]>();
    for (const id of ids) {
      successors.set(
        id,
        outgoing(graph, id, kind)
          .map((edge) => edge.to)
          .filter((to) => graph.artifacts.has(to))
          .sort(compareStrings),
      );
    }
    for (const component of stronglyConnected(ids, successors)) {
      const members = [...component].sort(compareStrings);
      const cyclic = members.length > 1 || (successors.get(members[0]) ?? []).includes(members[0]);
      if (!cyclic) continue;
      const field = kind === "parent" ? "/intentset/parent" : `/intentset/links/${kind}`;
      for (const id of members) {
        const artifact = graph.artifacts.get(id) as Artifact;
        reportOn(context, artifact, {
          code: "CORE004",
          field,
          message:
            members.length === 1
              ? `${id} names itself in ${kind}.`
              : `${id} is in a ${kind} cycle: ${[...members, members[0]].join(" -> ")}.`,
          remediation:
            kind === "parent"
              ? "Break the cycle so every navigation chain ends at a product (Core §5)."
              : `Break the ${kind} cycle; ${kind === "requires" ? "a prerequisite cannot depend on what it enables" : "a replacement chain must end at a current artifact"}.`,
        });
      }
    }
  }
}

/** Tarjan's strongly connected components, iterated in the given order so the result is deterministic. */
function stronglyConnected(ids: readonly string[], successors: Map<string, string[]>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;
  const visit = (id: string): void => {
    index.set(id, counter);
    low.set(id, counter);
    counter++;
    stack.push(id);
    onStack.add(id);
    for (const next of successors.get(id) ?? []) {
      if (!index.has(next)) {
        visit(next);
        low.set(id, Math.min(low.get(id) as number, low.get(next) as number));
      } else if (onStack.has(next)) {
        low.set(id, Math.min(low.get(id) as number, index.get(next) as number));
      }
    }
    if (low.get(id) === index.get(id)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop() as string;
        onStack.delete(member);
        component.push(member);
      } while (member !== id);
      components.push(component);
    }
  };
  for (const id of ids) if (!index.has(id)) visit(id);
  return components;
}

/** Core §4 and §7: owners, audiences and availability values come from the registries and the graph; retirement names successors. */
function checkLifecycle(context: Context): void {
  const { graph, registries, unreadable } = context;
  const undeclared = new Map<string, number>();
  const use = (dimension: string) => undeclared.set(dimension, (undeclared.get(dimension) ?? 0) + 1);
  const resourceIds = new Set(registries.resources.map((resource) => resource.id));

  for (const artifact of sortedArtifacts(graph)) {
    const { meta } = artifact;
    if (registries.owners.length === 0) use("owners");
    else if (!registries.owners.includes(meta.owner)) {
      reportOn(context, artifact, {
        code: "CORE005",
        field: "/intentset/owner",
        message: `owner ${meta.owner} is not in the owner registry.`,
        remediation: "Add the team or role to registries.yaml owners, or name a registered owner.",
      });
    }
    meta.audiences.forEach((audience, i) => {
      if (registries.audiences.length === 0) use("audiences");
      else if (!registries.audiences.includes(audience)) {
        reportOn(context, artifact, {
          code: "CORE005",
          field: `/intentset/audiences/${i}`,
          message: `audience ${audience} is not in the audience registry.`,
          remediation: "Add it to registries.yaml audiences, or use a registered audience.",
        });
      }
    });
    const availability = meta.availability;
    if (availability !== undefined) {
      availability.products.forEach((product, i) => {
        const found = graph.artifacts.get(product);
        if (found === undefined && unreadable.has(product)) return;
        if (found === undefined || found.meta.type !== "product") {
          reportOn(context, artifact, {
            code: "CORE005",
            field: `/intentset/availability/products/${i}`,
            message: `availability names ${product}, which is not a product in the graph.`,
            remediation: "Name the product artifact's ID, such as PRD-LANTERN.",
          });
        }
      });
      for (const dimension of ["releases", "roles", "editions", "flags"] as const) {
        availability[dimension].forEach((value, i) => {
          if (registries[dimension].length === 0) use(dimension);
          else if (!registries[dimension].includes(value)) {
            reportOn(context, artifact, {
              code: "CORE005",
              field: `/intentset/availability/${dimension}/${i}`,
              message: `${dimension} value ${value} is not in the registries.`,
              remediation: `Add it to registries.yaml ${dimension}, or use a declared value; release labels match exactly (Core §7).`,
            });
          }
        });
      }
    }
    meta.slice?.usesResources.forEach((resource, i) => {
      if (registries.resources.length === 0) use("resources");
      else if (!resourceIds.has(resource)) {
        reportOn(context, artifact, {
          code: "CORE003",
          field: `/intentset/slice/usesResources/${i}`,
          message: `usesResources names ${resource}, which is not a resource in the registries.`,
          remediation:
            "Declare the resource under registries.yaml resources with its technical owner, or remove the reference.",
        });
      }
    });
    if (meta.status === "retired" && (meta.links.replacedBy ?? []).length === 0) {
      reportOn(context, artifact, {
        code: "CORE005",
        severity: "warning",
        field: "/intentset/status",
        message: `${meta.id} is retired and names no successor in replacedBy.`,
        remediation: "Add replacedBy with the successor IDs when the artifact was split, merged or superseded.",
      });
    }
  }

  if (undeclared.size > 0) {
    const dimensions = [...undeclared.keys()].sort(compareStrings);
    const count = [...undeclared.values()].reduce((sum, n) => sum + n, 0);
    const named =
      dimensions.length === 1
        ? dimensions[0]
        : `${dimensions.slice(0, -1).join(", ")} or ${dimensions[dimensions.length - 1]}`;
    context.diagnostics.push(
      makeDiagnostic({
        code: "CORE005",
        severity: "warning",
        origin: "graph",
        artifact: null,
        path: null,
        message: `The registries declare no ${named}, so ${count} value${count === 1 ? "" : "s"} in the documents could not be checked.`,
        remediation: `List the valid ${dimensions.join(", ")} in registries.yaml; an empty registry reads as not declared.`,
      }),
    );
  }
}

interface Requirement {
  kinds: LinkKind[];
  direction: "in" | "out";
  message: string;
  remediation: string;
  /** Core §5 names no active obligation for this type; only the draft warning applies. */
  draftOnly?: boolean;
}

function requirement(artifact: Artifact): Requirement | null {
  const { meta } = artifact;
  const id = meta.id;
  switch (meta.type) {
    case "rule":
      return {
        kinds: ["governedBy"],
        direction: "in",
        message: "no behavior names it in governedBy",
        remediation: `Add ${id} to the governedBy of the behavior it constrains; a rule is attached from the behavior side.`,
      };
    case "scenario":
      return {
        kinds: ["illustrates"],
        direction: "out",
        message: "it illustrates no behavior",
        remediation: "Add the behavior IDs it exemplifies to links.illustrates.",
      };
    case "verification":
      return {
        kinds: ["verifies"],
        direction: "out",
        message: "it verifies no behavior, rule or scenario",
        remediation: "Add the claims it assesses to links.verifies.",
      };
    case "knowledge":
      return {
        kinds: ["explains"],
        direction: "out",
        message: "it explains no behavior, rule or capability",
        remediation: "Add the sources it is grounded in to links.explains.",
      };
    case "slice":
      if (meta.slice?.kind !== "product") return null;
      return {
        kinds: ["implements"],
        direction: "out",
        message: "it is a product slice and implements no behavior",
        remediation: "Add the behaviors it owns to links.implements, or make the slice technical with a rationale.",
      };
    case "contract":
      return {
        kinds: ["exposes", "consumes"],
        direction: "in",
        message: "no slice exposes or consumes it",
        remediation: `Add ${id} to the exposes of the slice that maintains it, or to the consumes of one that relies on it.`,
        draftOnly: true,
      };
    case "decision":
      return {
        kinds: ["informedBy"],
        direction: "in",
        message: "no slice, contract or behavior names it in informedBy",
        remediation: `Add ${id} to the informedBy of the artifacts the decision shaped.`,
        draftOnly: true,
      };
    default:
      return null;
  }
}

/**
 * Core §5 and VSA §3: active rules, scenarios, verifications, knowledge and
 * product slices are attached (CORE003). Their drafts, and draft contracts
 * and decisions nothing refers to, are unattached drafts (CORE009, warning).
 */
function checkAttachment(context: Context): void {
  const { graph } = context;
  for (const artifact of sortedArtifacts(graph)) {
    const need = requirement(artifact);
    if (need === null || artifact.meta.status === "retired") continue;
    const edges = need.kinds.flatMap((kind) =>
      need.direction === "in" ? incomingEdges(graph, artifact.meta.id, kind) : outgoing(graph, artifact.meta.id, kind),
    );
    if (edges.length > 0) continue;
    const field = need.direction === "out" ? `/intentset/links/${need.kinds[0]}` : undefined;
    if (artifact.meta.status === "draft") {
      reportOn(context, artifact, {
        code: "CORE009",
        severity: "warning",
        field,
        message: `Draft ${artifact.meta.type} ${artifact.meta.id} is unattached: ${need.message}.`,
        remediation: need.remediation,
      });
    } else if (need.draftOnly !== true) {
      reportOn(context, artifact, {
        code: "CORE003",
        field,
        message: `${capitalize(artifact.meta.status)} ${artifact.meta.type} ${artifact.meta.id} is unattached: ${need.message}.`,
        remediation: need.remediation,
      });
    }
  }
}

/** VSA §3: what a pattern may not be. Null when the pattern is acceptable. */
export function patternProblem(pattern: string): string | null {
  if (pattern.startsWith("/")) return "is absolute";
  if (pattern.split("/").includes("..")) return "contains `..`";
  if (/[{}]/.test(pattern)) return "uses brace expansion";
  if (pattern.includes("!")) return "uses negation";
  if (pattern.includes("\\")) return "uses a backslash; patterns are POSIX paths";
  return null;
}

/** VSA §3 and Core §8: type-specific blocks on their own type only; technical slices give a rationale and implement nothing; patterns are plain. */
function checkSlices(context: Context): void {
  const { graph } = context;
  for (const artifact of sortedArtifacts(graph)) {
    const id = artifact.meta.id;
    const profile = (field: string, message: string, remediation: string, code = "CORE001") =>
      reportOn(context, artifact, { code, origin: "profile", field, message, remediation });
    if (artifact.meta.verification !== undefined && artifact.meta.type !== "verification") {
      profile(
        "/intentset/verification",
        `${id} is ${aType(artifact.meta.type)} and carries verification metadata, which only a verification has.`,
        "Remove the verification block, or change the type (Core §8).",
      );
    }
    const slice = artifact.meta.slice;
    if (slice === undefined) continue;
    if (artifact.meta.type !== "slice") {
      profile(
        "/intentset/slice",
        `${id} is ${aType(artifact.meta.type)} and carries slice metadata, which only a slice has.`,
        "Remove the slice block, or change the type (VSA §3).",
      );
      continue;
    }

    if (slice.kind === "technical") {
      if ((artifact.meta.links.implements ?? []).length > 0) {
        profile(
          "/intentset/links/implements",
          `Technical slice ${id} implements behaviors; a technical slice owns mechanisms, not product behavior.`,
          "Remove implements, or set slice.kind to product (VSA §3).",
        );
      }
      if (slice.rationale === undefined || slice.rationale.trim() === "") {
        profile(
          "/intentset/slice",
          `Technical slice ${id} gives no rationale.`,
          "Add slice.rationale saying why no product owner exists for what it does (VSA §3).",
        );
      }
    }
    const entry = patternProblem(slice.entrypoint);
    if (entry !== null) {
      profile("/intentset/slice/entrypoint", `slice.entrypoint ${entry}.`, "Give a repository-relative POSIX path.");
    }
    for (const layer of Object.keys(slice.layers).sort(compareStrings)) {
      slice.layers[layer].forEach((pattern, i) => {
        const why = patternProblem(pattern);
        if (why !== null)
          profile(
            `/intentset/slice/layers/${layer}/${i}`,
            `Layer pattern ${pattern} ${why}.`,
            "Use literal segments, `*` within a segment and `**` across segments only (VSA §3).",
          );
      });
    }
    slice.claims.forEach((claim, i) => {
      const why = patternProblem(claim.path);
      if (why !== null)
        profile(
          `/intentset/slice/claims/${i}/path`,
          `Claim pattern ${claim.path} ${why}.`,
          "Use literal segments, `*` within a segment and `**` across segments only (VSA §3).",
        );
    });
  }
}

const OWNED_STATUSES = new Set(["approved", "implemented", "released", "deprecated"]);

/** Core §5 at L2 and above: an active behavior has exactly one accountable product slice through `implements`. */
function checkOwnership(context: Context): void {
  const { graph } = context;
  for (const artifact of sortedArtifacts(graph)) {
    const { meta } = artifact;
    if (meta.type !== "behavior" || !OWNED_STATUSES.has(meta.status)) continue;
    const owners = incomingEdges(graph, meta.id, "implements")
      .map((edge) => graph.artifacts.get(edge.from))
      .filter((slice): slice is Artifact => slice?.meta.slice?.kind === "product")
      .map((slice) => slice.meta.id)
      .sort(compareStrings);
    if (owners.length === 1) continue;
    reportOn(context, artifact, {
      code: "CORE006",
      message:
        owners.length === 0
          ? `${capitalize(meta.status)} behavior ${meta.id} has no product slice implementing it.`
          : `${capitalize(meta.status)} behavior ${meta.id} is implemented by ${owners.length} product slices (${owners.join(", ")}); exactly one is accountable.`,
      remediation:
        owners.length === 0
          ? "Add the behavior to the implements of the one product slice that owns it."
          : "Keep implements on the accountable slice and express the collaborators through dependsOn and contracts (Core §5).",
    });
  }
}
