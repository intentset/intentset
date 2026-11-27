/**
 * records/<ID>.html: one record, whatever its type. It opens with where the
 * record sits, among the records and in the model, and then the record itself,
 * in one card that holds nothing else: the file's path (and, given a source
 * address, a link to the file), every field of its frontmatter, and its text,
 * rendered (record-text.ts). Everything after the card is derived, and the page
 * says so. A behavior's page then carries its detail (Core §10): its context
 * bundle, the same one `contextFor` gives an agent, as one card per role; its
 * claims and their evidence; its verification definitions with their evidence
 * status; and the knowledge that explains it with its review status. Every other
 * record lists the records that link to it, and what the Atlas reads about its
 * type: a verification's evidence, a knowledge record's review status.
 */
import {
  type Artifact,
  approvalSummary,
  type ContextArtifact,
  type ContextRole,
  compareStrings,
  contextFor,
  exportFormalizes,
  formalizedSummary,
  LINK_KINDS,
  type LinkKind,
} from "@intentset/core";
import { reviewStatus } from "@intentset/publisher";
import type { Model } from "../model.ts";
import { MAP_SLOT_SOURCE, type PageSource } from "../page.ts";
import { NEIGHBORHOOD_LIMIT, neighborhoodHtml, neighborhoodLayout } from "../map.ts";
import { type PageLink, recordPath, recordText, relativeLink } from "../record-text.ts";
import type { SourceUrl } from "../types.ts";
import { badge, code, fenced, idLink, link, ofTotal, plural, table, text } from "../text.ts";
import { TYPE_HEADINGS } from "./records.ts";
import { claimBadge, claimEvidence, deliveryWord, evidenceCell, latestRun, reviewBadge, reviewCell } from "./shared.ts";

const ROLE_HEADINGS: Record<Exclude<ContextRole, "start">, string> = {
  owner: "Owning slice",
  behavior: "Behaviors",
  rule: "Rules",
  scenario: "Scenarios",
  verification: "Verification definitions",
  contract: "Contracts",
  decision: "Decisions",
  knowledge: "Knowledge",
  ancestor: "Navigation ancestors",
  neighbour: "Neighbours",
};

/** Roles shown even when empty, because an empty one is itself something a reviewer needs to see. */
const ALWAYS: ReadonlySet<ContextRole> = new Set(["owner", "rule", "scenario", "verification"]);
const EMPTY_TONE: Partial<Record<ContextRole, "warn">> = { owner: "warn", verification: "warn" };

/** Each link as written in the record, and as read from the record it points at, where it is derived. */
const LINK_LABELS: Record<LinkKind, { written: string; derived: string }> = {
  parent: { written: "Parent", derived: "Children" },
  governedBy: { written: "Governed by", derived: "Governs" },
  illustrates: { written: "Illustrates", derived: "Illustrated by" },
  implements: { written: "Implements", derived: "Implemented by" },
  dependsOn: { written: "Depends on", derived: "Depended on by" },
  exposes: { written: "Exposes", derived: "Exposed by" },
  consumes: { written: "Consumes", derived: "Consumed by" },
  verifies: { written: "Verifies", derived: "Verified by" },
  explains: { written: "Explains", derived: "Explained by" },
  informedBy: { written: "Informed by", derived: "Informs" },
  requires: { written: "Requires", derived: "Required by" },
  supports: { written: "Supports", derived: "Supported by" },
  replacedBy: { written: "Replaced by", derived: "Replaces" },
};

/** The review page that also shows a record of this type, among the others of its kind. */
const SHOWN_ON: Partial<Record<Artifact["meta"]["type"], { page: string; label: string }>> = {
  capability: { page: "index.html", label: "the product tree, with its behaviors and their state" },
  slice: { page: "ownership.html", label: "the ownership page, with its path claims, layers and shared resources" },
  verification: { page: "verification.html", label: "the verification page, among the claims it covers" },
  knowledge: { page: "publication.html", label: "the publication page, with what each projection would publish" },
};

export function recordPage(model: Model, artifact: Artifact, pageLink?: PageLink, source?: SourceUrl): PageSource {
  const { meta } = artifact;
  const id = meta.id;
  const ancestry = model.ancestry(id);
  const body: string[] = [
    "{.lead}",
    meta.type === "behavior"
      ? "One behavior: its text as written, then how it traces from why it exists to the tests and help that hold it."
      : "One record: its text as written, then what it links to and where it stands.",
    "",
    `${link("Records", "../records.html")} › ${link(TYPE_HEADINGS[meta.type], `../records.html#${meta.type}`)} › ${code(id)}`,
    "",
  ];
  if (ancestry.length > 0) {
    body.push(`In the model: ${[...ancestry.map((a) => idLink(a, `${a}.html`)), code(id)].join(" › ")}`, "");
  }

  // The record, and nothing but the record, in one card: where its file is, its frontmatter, its text.
  const written = recordText(model, artifact, pageLink);
  const url = source?.(artifact.path) ?? null;
  body.push("## The record", "");
  if (!("html" in written)) {
    body.push(
      `> [!WARNING] Text shown as written`,
      `> The text of ${code(artifact.path)} does not parse as Markset (${written.unparsed.map(code).join(", ")}), ` +
        "so it is shown as source rather than rendered. The validation report has the details.",
      "",
    );
  }
  body.push(
    ":::card{.record}",
    "{.record-source}",
    `${code(artifact.path)}${url === null ? "" : ` · ${link("View the file on GitHub", url)}`}`,
    "",
    ...fields(model, artifact),
    "",
  );
  if (!("html" in written)) body.push(...fenced(artifact.body, "markdown"), "");
  else if (written.html.trim() === "") body.push("The record has no text beyond its title.", "");
  else body.push(...MAP_SLOT_SOURCE, "");
  body.push(
    ":::",
    "",
    "{.derived}",
    "Everything below is derived: the Atlas reads it from this record and the others, and none of it is written in " +
      "the file.",
    "",
  );

  if (meta.type === "behavior") body.push(...behaviorSections(model, artifact));
  else body.push(...typeSections(model, artifact), ...linkSection(model, id));

  // The record and the records nearest it, drawn as the map draws them, with no controls and no script.
  const near = neighborhoodLayout(model, id);
  const from = recordPath(id);
  const neighborhood = neighborhoodHtml(near, id, "", (to) => (pageLink ?? relativeLink)(from, to));
  body.push(
    "## Neighborhood",
    "",
    near.nodes.length === 1
      ? "No other record links to this one, and it links to none."
      : `${code(id)} and the ${plural(near.nodes.length - 1, "record")} nearest it: every record one link away` +
          `${near.nodes.length >= NEIGHBORHOOD_LIMIT ? ", and as many two links away as fit," : " and those two links away,"} ` +
          "laid out so that records linked to each other sit near each other. Each is a link to its page.",
    "",
    ...(near.nodes.length === 1 ? [] : [...MAP_SLOT_SOURCE, ""]),
  );

  const shown = SHOWN_ON[meta.type];
  if (shown !== undefined) body.push("{.small}", `Also on ${link(text(shown.label), `../${shown.page}#${id}`)}.`, "");
  const text_ = "html" in written && written.html.trim() !== "" ? [written.html] : [];
  const html = [...text_, ...(near.nodes.length === 1 ? [] : [neighborhood])];
  return {
    path: recordPath(id),
    title: `${id}: ${meta.title}`,
    body,
    ...(html.length === 0 ? {} : { html }),
  };
}

/** A behavior's detail: its context bundle, its claims and their evidence, its verifications and its knowledge. */
function behaviorSections(model: Model, behavior: Artifact): string[] {
  const id = behavior.meta.id;
  const body: string[] = [];
  // The Atlas is an internal review view over the graph it is given, so the bundle includes restricted records.
  const bundle = contextFor(model.graph, id, { includeRestricted: true });
  const members = bundle?.artifacts.filter((a) => a.role !== "start") ?? [];
  body.push(...trace(model, behavior));
  body.push(
    "## Context bundle",
    "",
    `What an engineer or agent loads before changing this behavior (Core §10): ${plural(members.length, "artifact")} ` +
      "besides the behavior, each under the first role it has.",
    "",
  );
  // One card per role, in a grid that a narrow screen reduces to one column.
  body.push("::::grid{cols=3}");
  for (const role of Object.keys(ROLE_HEADINGS) as Exclude<ContextRole, "start">[]) {
    const inRole = members.filter((a) => a.role === role);
    if (inRole.length === 0 && !ALWAYS.has(role)) continue;
    const tone = inRole.length === 0 ? (EMPTY_TONE[role] ?? "neutral") : "neutral";
    body.push(`- :::card[${ROLE_HEADINGS[role]} (${inRole.length})]{tone=${tone}}`);
    if (inRole.length === 0) body.push(`  ${emptyRole(role)}`);
    else body.push(...inRole.map((a) => `  - ${bundleEntry(a)}`));
    body.push("  :::", "");
  }
  body.push("::::", "");

  const claims = model.claimsOf(id);
  const linked = claims.filter((c) => model.linked(c)).length;
  body.push(
    "## Claims and their evidence",
    "",
    `The behavior, its rules and its scenarios are separate claims, and each needs its own coverage: a pass on the ` +
      `behavior does not cover its rules (Core §8). Linked: ${ofTotal(linked, claims.length, "claim")} (links). ` +
      (model.hasEvidence
        ? `Verified at this snapshot: ${ofTotal(
            claims.filter((c) => model.coverageOf(c)?.verified === true).length,
            claims.length,
            "claim",
          )} (evidence).`
        : "Verified: not assessed, because no run evidence was supplied."),
    "",
    ...table(
      ["Claim", "Type", "Status", "Verification definitions (links)", "Evidence"],
      claims.map((claim) => {
        const artifact = model.get(claim) as Artifact;
        const verifications = model.verificationsOf(claim);
        return [
          `${idLink(claim, `${claim}.html`)} ${text(artifact.meta.title)}`,
          artifact.meta.type,
          artifact.meta.status,
          verifications.length === 0
            ? badge("not linked", "warn")
            : verifications.map((v) => idLink(v, `${v}.html`)).join(", "),
          claimEvidence(model, claim),
        ];
      }),
    ),
    "",
  );

  const verifications = [...new Set(claims.flatMap((c) => model.verificationsOf(c)))].sort(compareStrings);
  body.push("## Verification definitions", "");
  if (verifications.length === 0)
    body.push("No verification definition names this behavior, its rules or its scenarios.", "");
  else {
    body.push(
      ...table(
        ["Verification", "Method", "Verifies", "Evidence status", "Latest run"],
        verifications.map((v) => {
          const artifact = model.get(v) as Artifact;
          const named = model.from(v, "verifies").filter((c) => claims.includes(c));
          return [
            `${idLink(v, `${v}.html`)} ${text(artifact.meta.title)}`,
            artifact.meta.verification?.method ?? "not declared",
            named.map(code).join(", "),
            evidenceCell(model, v),
            latestRun(model, v),
          ];
        }),
      ),
      "",
    );
  }

  const knowledge = model.into(id, "explains", "knowledge");
  body.push("## Knowledge", "");
  if (knowledge.length === 0) body.push("No knowledge explains this behavior.", "");
  else {
    body.push(
      ...table(
        ["Knowledge", "Status", "Visibility", "Audiences", "Review"],
        knowledge.map((k) => {
          const artifact = model.get(k) as Artifact;
          return [
            `${idLink(k, `${k}.html`)} ${text(artifact.meta.title)}`,
            artifact.meta.status,
            artifact.meta.visibility,
            artifact.meta.audiences.map(text).join(", "),
            reviewCell(reviewStatus(model.graph, artifact)),
          ];
        }),
      ),
      "",
    );
  }
  return body;
}

/**
 * The behavior's trace (#159): one chain from why it exists to what people are told, each step a link to the records
 * in it with their state. Steps, so it reads left to right on paper and top to bottom on a phone; an empty step says
 * what is missing rather than disappearing.
 */
function trace(model: Model, behavior: Artifact): string[] {
  const id = behavior.meta.id;
  const ref = (other: string) => `${idLink(other, `${other}.html`)} ${text(model.get(other)?.meta.title ?? "")}`;
  const why = model.ancestry(id).filter((a) => {
    const type = model.get(a)?.meta.type;
    return type === "intent" || type === "outcome";
  });
  const measures = why.flatMap((o) => model.into(o, "parent", "measure"));
  const rules = model.from(id, "governedBy", "rule");
  const scenarios = model.into(id, "illustrates", "scenario");
  const owners = model.owners(id);
  const decisions = [...new Set(owners.flatMap((o) => model.from(o, "informedBy", "decision")))].sort(compareStrings);
  const verifications = [...new Set(model.claimsOf(id).flatMap((c) => model.verificationsOf(c)))].sort(compareStrings);
  const knowledge = model.into(id, "explains", "knowledge");
  const list = (items: string[], empty: string) => (items.length === 0 ? empty : items.join("; "));
  const delivery = deliveryWord(behavior.meta)?.word ?? "not stated";
  return [
    "{#trace}",
    "## Trace",
    "",
    "From why the behavior exists to what people are told about it, one link at a time.",
    "",
    ":::steps",
    `1. **Why.** ${list(
      [...why.map((w) => `${ref(w)} · ${model.get(w)?.meta.type}`), ...measures.map((m) => `${ref(m)} · measure`)],
      "No intent or outcome sits above it, so nothing says why it exists.",
    )}`,
    `2. **The behavior.** ${ref(id)} · ${behavior.meta.status} · ${delivery} · ${claimBadge(model, id)}`,
    `3. **Rules and scenarios.** ${list(
      [...rules, ...scenarios].map((c) => `${ref(c)} ${claimBadge(model, c)}`),
      "No rule governs it and no scenario illustrates it.",
    )}`,
    `4. **Owning slice.** ${list(
      [...owners.map(ref), ...decisions.map((d) => `${ref(d)} · decision`)],
      `${badge("no owner", "warn")} No slice implements it.`,
    )}`,
    `5. **Verifications and evidence.** ${list(
      verifications.map((v) => `${ref(v)} ${evidenceCell(model, v)}`),
      `${badge("none", "warn")} No verification names it, its rules or its scenarios.`,
    )}`,
    `6. **What people are told.** ${list(
      knowledge.map((k) => `${ref(k)} ${reviewBadge(reviewStatus(model.graph, model.get(k) as Artifact))}`),
      "No knowledge explains it.",
    )}`,
    ":::",
    "",
  ];
}

/** What the Atlas reads about a record of this type: a verification's evidence, a knowledge record's review. */
function typeSections(model: Model, artifact: Artifact): string[] {
  const id = artifact.meta.id;
  switch (artifact.meta.type) {
    case "verification":
      return [
        "## Evidence",
        "",
        `- **Evidence:** ${evidenceCell(model, id)}`,
        `- **Latest run:** ${latestRun(model, id)}`,
        "",
      ];
    case "knowledge":
      return ["## Review", "", `- **Review:** ${reviewCell(reviewStatus(model.graph, artifact))}`, ""];
    default:
      return [];
  }
}

/** Every field of the record's frontmatter, as written, with each record it names linked to its page. */
function fields(model: Model, artifact: Artifact): string[] {
  const { meta } = artifact;
  const ref = (other: string) => idLink(other, model.get(other) === undefined ? null : `${other}.html`);
  const value = (v: unknown): string => {
    if (typeof v === "string") return model.get(v) === undefined ? text(v) : ref(v);
    if (Array.isArray(v)) return v.length === 0 ? "none" : v.map(value).join(", ");
    if (v !== null && typeof v === "object") {
      return Object.entries(v)
        .map(([key, inner]) => `${model.get(key) === undefined ? text(key) : ref(key)}: ${value(inner)}`)
        .join("; ");
    }
    return text(String(v));
  };
  const rows: [string, string][] = [];
  const shown = new Set<string>();
  const add = (key: string, label: string, cell: string | undefined) => {
    shown.add(key);
    if (cell !== undefined) rows.push([label, cell]);
  };
  add("id", "ID", code(meta.id));
  add("title", "Title", text(meta.title));
  add("type", "Type", meta.type);
  add("status", "Status", meta.status);
  const delivery = deliveryWord(meta);
  add(
    "delivery",
    "Delivery",
    delivery === null ? undefined : delivery.derived ? `${delivery.word}, because it is deprecated` : delivery.word,
  );
  add("owner", "Owner", text(meta.owner));
  add("visibility", "Visibility", meta.visibility);
  add("audiences", "Audiences", value(meta.audiences));
  add("revision", "Revision", meta.revision === undefined ? undefined : `${meta.revision}`);
  add("parent", "Parent", meta.parent === undefined ? undefined : ref(meta.parent));
  shown.add("links");
  for (const kind of LINK_KINDS) {
    const ids = kind === "parent" ? undefined : meta.links[kind];
    if (ids !== undefined && ids.length > 0) rows.push([LINK_LABELS[kind].written, ids.map(ref).join(", ")]);
  }
  const availability = meta.availability;
  add(
    "availability",
    "Availability",
    availability === undefined
      ? meta.type === "behavior" || meta.type === "knowledge"
        ? "none declared, so publication of anything about it fails closed"
        : undefined
      : `products ${value(availability.products)} · releases ${value(availability.releases)} · roles ${value(
          availability.roles,
        )} · editions ${value(availability.editions)} · flags ${value(availability.flags)}`,
  );
  add("reviewedBy", "Reviewed by", meta.reviewedBy === undefined ? undefined : text(meta.reviewedBy));
  add("reviewedAt", "Reviewed at", meta.reviewedAt === undefined ? undefined : text(meta.reviewedAt));
  // Core §7, ADR 0020: what the record states about its approval, in its own words; absent, nothing is claimed.
  add("approval", "Approval", meta.approval === undefined ? undefined : text(approvalSummary(meta.approval)));
  add(
    "formalizes",
    "Formalizes",
    meta.formalizes === undefined
      ? undefined
      : exportFormalizes(meta.formalizes)
          .map((entry) => text(formalizedSummary(entry)))
          .join("; "),
  );
  shown.add("tips");
  for (const [target, tip] of Object.entries(meta.tips ?? {})) rows.push([`Tip for ${ref(target)}`, text(tip)]);
  shown.add("slice");
  if (meta.slice !== undefined) {
    const slice = meta.slice;
    rows.push(["Slice kind", slice.kind], ["Domain", text(slice.domain)]);
    if (slice.rationale !== undefined) rows.push(["Rationale", text(slice.rationale)]);
    rows.push([slice.entrypoints.length === 1 ? "Entrypoint" : "Entrypoints", slice.entrypoints.map(code).join(", ")]);
    const layers = Object.keys(slice.layers).sort(compareStrings);
    if (layers.length > 0) {
      rows.push([
        "Layers",
        layers.map((layer) => `${text(layer)} ${(slice.layers[layer] ?? []).map(code).join(", ")}`).join("; "),
      ]);
    }
    if (slice.claims.length > 0) rows.push(["Claims", slice.claims.map((c) => `${c.kind} ${code(c.path)}`).join("; ")]);
    if (slice.usesResources.length > 0) rows.push(["Uses resources", slice.usesResources.map(code).join(", ")]);
  }
  shown.add("verification");
  if (meta.verification !== undefined) {
    const check = meta.verification;
    rows.push(["Method", check.method], ["Locator", code(check.locator)], ["Selector", code(check.selector)]);
    if (check.exercises !== undefined && check.exercises.length > 0) {
      rows.push(["Exercises", check.exercises.map(ref).join(", ")]);
    }
  }
  shown.add("measure");
  if (meta.measure !== undefined) {
    const measure = meta.measure;
    rows.push(["Metric", code(measure.metric)]);
    if (measure.direction !== undefined) rows.push(["Direction", measure.direction]);
    rows.push(
      ["Baseline", text(measure.baseline)],
      ["Target", text(measure.target)],
      ["Window", text(measure.window)],
      ["Source", text(measure.source)],
    );
  }
  shown.add("extensions");
  for (const [key, extension] of Object.entries(meta.extensions ?? {})) {
    rows.push([`Extension ${code(key)}`, value(extension)]);
  }
  add("spec", "Format", `spec ${code(meta.spec)} · profile ${code(meta.profile)}`);
  shown.add("profile");
  // Whatever else the frontmatter holds is shown as it is, so no field is left off the page.
  for (const [key, other] of Object.entries(meta)) if (!shown.has(key)) rows.push([code(key), value(other)]);
  for (const [key, other] of Object.entries(artifact.foreign)) rows.push([code(key), value(other)]);
  return table(["Field", "Value"], rows);
}

/** Every link another record writes to this one, which the graph derives; the record's own are in its card. */
function linkSection(model: Model, id: string): string[] {
  const entry = (other: string) => `${idLink(other, `${other}.html`)} ${text(model.get(other)?.meta.title ?? "")}`;
  const items: string[] = [];
  for (const kind of LINK_KINDS) {
    const sources = model.into(id, kind);
    if (sources.length > 0) items.push(`- **${LINK_LABELS[kind].derived}:** ${sources.map(entry).join("; ")}`);
  }
  return [
    "## Linked from other records",
    "",
    items.length === 0
      ? "No other record links to this one."
      : "The links other records write to this one, read the other way (Core §5).",
    "",
    ...items,
    ...(items.length === 0 ? [] : [""]),
  ];
}

function bundleEntry(a: ContextArtifact): string {
  const restricted = a.visibility === "restricted" ? ` ${badge("restricted", "danger")}` : "";
  return `${idLink(a.id, `${a.id}.html`)} ${text(a.title)} · ${a.type} · ${a.status}${restricted} · ${code(a.path)}`;
}

function emptyRole(role: ContextRole): string {
  switch (role) {
    case "owner":
      return "No slice implements this behavior, so no implementation owner is declared.";
    case "verification":
      return "No verification definition names this behavior, its rules or its scenarios.";
    case "rule":
      return "No rule governs this behavior.";
    default:
      return "No scenario illustrates this behavior.";
  }
}
