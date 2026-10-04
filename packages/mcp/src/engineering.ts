/**
 * Engineering tools (Core §10): read-only context over one validated graph,
 * for an engineer or an agent inside the organization. Every result is JSON
 * that begins with the snapshot (commit and graph hash) and lists the source
 * paths it was read from, because a context an agent cannot trace back to
 * files and a snapshot cannot be reviewed.
 *
 * `restricted` artifacts are left out unless the operator started the server
 * with them included: a restricted ID reads exactly like an unknown one, a
 * link to one is withheld and counted, and search never looks inside one, so
 * a query cannot be used to probe restricted text.
 */
import {
  ARTIFACT_TYPES,
  type Artifact,
  type ArtifactType,
  compareStrings,
  contextFor,
  type Graph,
  type ImpactHit,
  impact,
  type LinkKind,
} from "@intentset/core";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { READ_ONLY, result, stringArgument, type Tool, type ToolDefinition, type ToolResult } from "./tool.ts";

export interface EngineeringSnapshot {
  commit: string | null;
  graphHash: string;
}

export interface EngineeringContext {
  graph: Graph;
  snapshot: EngineeringSnapshot;
  includeRestricted: boolean;
}

export const SEARCH_LIMIT = 20;
export const NOT_IN_SNAPSHOT = "No artifact with that ID is available in this snapshot.";

function idInput(): ToolDefinition["inputSchema"] {
  return {
    type: "object",
    properties: { id: { type: "string", description: "An artifact ID, such as BEH-ASMT-SCHEDULE." } },
    required: ["id"],
    additionalProperties: false,
  };
}

export function engineeringTools(context: EngineeringContext): Tool[] {
  const { graph } = context;
  const visible = (id: string): Artifact | null => {
    const artifact = graph.artifacts.get(id);
    if (artifact === undefined) return null;
    if (artifact.meta.visibility === "restricted" && !context.includeRestricted) return null;
    return artifact;
  };
  const envelope = (sources: string[], payload: Record<string, unknown>) => ({
    snapshot: { commit: context.snapshot.commit, graphHash: context.snapshot.graphHash },
    sources: [...new Set(sources)],
    ...payload,
  });
  const unavailable = (tool: string): ToolResult => result(envelope([], { tool, error: NOT_IN_SNAPSHOT }), true);

  const lookup: Tool = {
    definition: {
      name: "intentset_lookup",
      title: "Look up an artifact",
      description:
        "One artifact's metadata, source path and body, from the snapshot named in the result. Links to restricted " +
        "artifacts are withheld and counted unless the server was started with them.",
      inputSchema: idInput(),
      annotations: READ_ONLY,
    },
    call(args) {
      const id = stringArgument("intentset_lookup", args, "id");
      const artifact = visible(id);
      if (artifact === null) return unavailable("intentset_lookup");
      const { meta } = artifact;
      let withheld = 0;
      const keep = (ids: string[]) => {
        const kept = ids.filter((each) => visible(each) !== null || !graph.artifacts.has(each));
        withheld += ids.length - kept.length;
        return kept;
      };
      const links: Partial<Record<LinkKind, string[]>> = {};
      for (const kind of Object.keys(meta.links).sort(compareStrings) as Exclude<LinkKind, "parent">[]) {
        links[kind] = keep(meta.links[kind] ?? []);
      }
      const linkedFrom: Partial<Record<LinkKind, string[]>> = {};
      for (const edge of graph.in.get(id) ?? []) {
        const list = linkedFrom[edge.kind];
        if (list === undefined) linkedFrom[edge.kind] = [edge.from];
        else list.push(edge.from);
      }
      const derived: Partial<Record<LinkKind, string[]>> = {};
      for (const kind of (Object.keys(linkedFrom) as LinkKind[]).sort(compareStrings)) {
        derived[kind] = keep([...new Set(linkedFrom[kind])].sort(compareStrings));
      }
      const parent = meta.parent === undefined ? null : (keep([meta.parent])[0] ?? null);
      return result(
        envelope([artifact.path], {
          tool: "intentset_lookup",
          artifact: {
            id: meta.id,
            type: meta.type,
            title: meta.title,
            status: meta.status,
            owner: meta.owner,
            visibility: meta.visibility,
            audiences: meta.audiences,
            profile: meta.profile,
            revision: meta.revision ?? null,
            parent,
            links,
            linkedFrom: derived,
            availability: meta.availability ?? null,
            slice: meta.slice ?? null,
            verification: meta.verification ?? null,
            measure: meta.measure ?? null,
            tips: meta.tips ?? null,
            reviewedBy: meta.reviewedBy ?? null,
            reviewedAt: meta.reviewedAt ?? null,
            path: artifact.path,
            sourceHash: artifact.sourceHash,
            body: artifact.body,
          },
          withheld,
        }),
      );
    },
  };

  const contextTool: Tool = {
    definition: {
      name: "intentset_context",
      title: "Load bounded context",
      description:
        "The bounded context to load before changing implementation (Core §10): for a behavior, its owning slice, " +
        "rules, scenarios, verifications, contracts, decisions, knowledge and ancestors, each with its source path " +
        "and body. Rules, capabilities and slices reach behaviors; any other artifact gives its neighbours.",
      inputSchema: idInput(),
      annotations: READ_ONLY,
    },
    call(args) {
      const id = stringArgument("intentset_context", args, "id");
      if (visible(id) === null) return unavailable("intentset_context");
      const bundle = contextFor(graph, id, { includeRestricted: context.includeRestricted });
      if (bundle === null) return unavailable("intentset_context");
      const artifacts = bundle.artifacts.map((member) => {
        const artifact = graph.artifacts.get(member.id) as Artifact;
        return { ...member, sourceHash: artifact.sourceHash, body: artifact.body };
      });
      return result(
        envelope(
          artifacts.map((a) => a.path),
          {
            tool: "intentset_context",
            start: bundle.start,
            withheld: bundle.withheld,
            artifacts,
          },
        ),
      );
    },
  };

  const impactTool: Tool = {
    definition: {
      name: "intentset_impact",
      title: "Trace impact",
      description:
        "What a change to an artifact may reach (Core §10): direct dependents apart from candidate downstream " +
        "effects, review context and navigation ancestors, each with the path and reasons that reached it. " +
        "Reachability is not proof that runtime behavior changed.",
      inputSchema: idInput(),
      annotations: READ_ONLY,
    },
    call(args) {
      const id = stringArgument("intentset_impact", args, "id");
      const start = visible(id);
      if (start === null) return unavailable("intentset_impact");
      const report = impact(graph, id);
      let withheld = 0;
      const shown = (hits: ImpactHit[]) => {
        const kept = hits.filter(
          (hit) => hit.path.every((step) => visible(step.id) !== null) && visible(hit.id) !== null,
        );
        withheld += hits.length - kept.length;
        return kept.map((hit) => ({ ...hit, file: (graph.artifacts.get(hit.id) as Artifact).path }));
      };
      const direct = shown(report.direct);
      const candidates = shown(report.candidates);
      const reviewContext = shown(report.context);
      const ancestors = report.ancestors.filter((a) => visible(a) !== null);
      withheld += report.ancestors.length - ancestors.length;
      const files = [start.path, ...[...direct, ...candidates, ...reviewContext].map((hit) => hit.file)];
      for (const a of ancestors) files.push((graph.artifacts.get(a) as Artifact).path);
      return result(
        envelope(files, {
          tool: "intentset_impact",
          start: id,
          direct,
          candidates,
          context: reviewContext,
          ancestors,
          withheld,
          note: "Reachability through the graph is recorded, not proof that runtime behavior changed (Core §10).",
        }),
      );
    },
  };

  const search: Tool = {
    definition: {
      name: "intentset_search",
      title: "Search artifacts",
      description: `Case-insensitive substring search over artifact IDs, titles and bodies; at most ${SEARCH_LIMIT} results, by ID.`,
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text to find, matched case-insensitively as a substring." },
          types: {
            type: "array",
            items: { type: "string", enum: [...ARTIFACT_TYPES] },
            description: "Only artifacts of these types.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
    },
    call(args) {
      const query = stringArgument("intentset_search", args, "query");
      const types = typesArgument(args.types);
      const needle = query.toLowerCase();
      const matches: Artifact[] = [];
      for (const id of [...graph.artifacts.keys()].sort(compareStrings)) {
        const artifact = visible(id);
        if (artifact === null) continue;
        if (types !== null && !types.includes(artifact.meta.type)) continue;
        const haystack = [id, artifact.meta.title, artifact.body].map((s) => s.toLowerCase());
        if (haystack.some((s) => s.includes(needle))) matches.push(artifact);
      }
      const results = matches.slice(0, SEARCH_LIMIT).map((a) => ({
        id: a.meta.id,
        type: a.meta.type,
        title: a.meta.title,
        status: a.meta.status,
        path: a.path,
      }));
      return result(
        envelope(
          results.map((r) => r.path),
          {
            tool: "intentset_search",
            query,
            types,
            matched: matches.length,
            shown: results.length,
            results,
          },
        ),
      );
    },
  };

  return [contextTool, impactTool, lookup, search];
}

function typesArgument(value: unknown): ArtifactType[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value) || !value.every((t) => (ARTIFACT_TYPES as readonly unknown[]).includes(t))) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `intentset_search: types must be a list of artifact types (${ARTIFACT_TYPES.join(", ")})`,
    );
  }
  return [...new Set(value as ArtifactType[])].sort(compareStrings);
}
