/**
 * records/<ID>.html: one record, whatever its type. Its text comes first, as
 * written and rendered (record-text.ts), because that is what the record says;
 * what the Atlas derives about it follows. A behavior's page then carries its
 * detail (Core §10): its context bundle, the same one `contextFor` gives an
 * agent, as one card per role; its claims and their evidence; its verification
 * definitions with their evidence status; and the knowledge that explains it
 * with its review status. Every other record lists its links, those written in
 * it and those written about it in other records, and what its type adds: a
 * verification's method and evidence, a knowledge record's review, a measure's
 * metric and target, a slice's kind and entrypoints.
 */
import {
  type Artifact,
  type ContextArtifact,
  type ContextRole,
  compareStrings,
  contextFor,
  LINK_KINDS,
  type LinkKind,
} from "@intentset/core";
import { reviewStatus } from "@intentset/publisher";
import { type Model, STATUS_WORDS } from "../model.ts";
import { MAP_SLOT_SOURCE, type PageSource } from "../page.ts";
import { type PageLink, recordPath, recordText } from "../record-text.ts";
import { badge, code, fenced, idLink, link, ofTotal, plural, series, table, text } from "../text.ts";
import { evidenceCell, latestRun, reviewCell } from "./shared.ts";

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
  capability: { page: "index.html", label: "the overview, with its behaviors and their coverage" },
  slice: { page: "ownership.html", label: "the ownership page, with its path claims, layers and shared resources" },
  verification: { page: "verification.html", label: "the verification page, among the claims it covers" },
  knowledge: { page: "publication.html", label: "the publication page, with what each projection would publish" },
};

export function recordPage(model: Model, artifact: Artifact, pageLink?: PageLink): PageSource {
  const { meta } = artifact;
  const id = meta.id;
  const ancestry = model.ancestry(id);
  const body: string[] = [
    "{.small .muted}",
    [
      meta.type,
      `status ${meta.status}`,
      `owner ${text(meta.owner)}`,
      `visibility ${meta.visibility}`,
      `audiences ${meta.audiences.map(text).join(", ")}`,
      code(artifact.path),
    ].join(" · "),
    "",
  ];

  // The text first, then the two fields that place the record: where it sits and where it is available.
  const written = recordText(model, artifact, pageLink);
  body.push("## The record", "");
  if ("html" in written) {
    if (written.html.trim() === "") body.push("The record has no text beyond its title.", "");
    else body.push(...MAP_SLOT_SOURCE, "");
  } else {
    body.push(
      `> [!WARNING] Shown as written`,
      `> The text of ${code(artifact.path)} does not parse as Markset (${written.unparsed.map(code).join(", ")}), ` +
        "so it is shown as source rather than rendered. The validation report has the details.",
      "",
      ...fenced(artifact.body, "markdown"),
      "",
    );
  }
  if (ancestry.length > 0) {
    // Full size, not small: its links are tap targets.
    body.push(
      `Navigation: ${[link("Overview", "../index.html"), ...ancestry.map((a) => idLink(a, `${a}.html`))].join(" › ")}`,
      "",
    );
  }
  if (meta.availability !== undefined || meta.type === "behavior" || meta.type === "knowledge") {
    body.push("{.small}", availabilityLine(meta.availability), "");
  }

  if (meta.type === "behavior") body.push(...behaviorSections(model, artifact));
  else body.push(...typeSections(model, artifact), ...linkSection(model, id));

  const shown = SHOWN_ON[meta.type];
  if (shown !== undefined) body.push("{.small}", `Also on ${link(text(shown.label), `../${shown.page}#${id}`)}.`, "");
  return {
    path: recordPath(id),
    title: `${id}: ${meta.title}`,
    body,
    ...("html" in written && written.html.trim() !== "" ? { html: written.html } : {}),
  };
}

/** A behavior's detail: its context bundle, its claims and their evidence, its verifications and its knowledge. */
function behaviorSections(model: Model, behavior: Artifact): string[] {
  const id = behavior.meta.id;
  const body: string[] = [];
  // The Atlas is an internal review view over the graph it is given, so the bundle includes restricted records.
  const bundle = contextFor(model.graph, id, { includeRestricted: true });
  const members = bundle?.artifacts.filter((a) => a.role !== "start") ?? [];
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

/** What a record's type adds to its fields: a verification's check, a knowledge record's review, and so on. */
function typeSections(model: Model, artifact: Artifact): string[] {
  const { meta } = artifact;
  const id = meta.id;
  switch (meta.type) {
    case "verification": {
      const check = meta.verification;
      const named = model.from(id, "verifies");
      return [
        "## Verification",
        "",
        `- **Method:** ${check === undefined ? "not declared" : check.method} · locator ${
          check === undefined ? "not declared" : code(check.locator)
        } · selector ${check === undefined ? "not declared" : code(check.selector)}`,
        `- **Verifies:** ${named.length === 0 ? "nothing" : named.map((c) => idLink(c, `${c}.html`)).join(", ")}`,
        `- **Evidence:** ${evidenceCell(model, id)}`,
        `- **Latest run:** ${latestRun(model, id)}`,
        "",
      ];
    }
    case "knowledge": {
      const tips = Object.entries(meta.tips ?? {});
      return [
        "## Review",
        "",
        `- **Review:** ${reviewCell(reviewStatus(model.graph, artifact))}`,
        ...(meta.reviewedBy === undefined && meta.reviewedAt === undefined
          ? []
          : [`- **Reviewed:** by ${text(meta.reviewedBy ?? "nobody named")}, ${text(meta.reviewedAt ?? "no date")}`]),
        ...tips.map(([target, tip]) => `- **Tip for ${idLink(target, `${target}.html`)}:** ${text(tip)}`),
        "",
      ];
    }
    case "measure": {
      const measure = meta.measure;
      if (measure === undefined) return [];
      return [
        "## Measure",
        "",
        `- **Metric:** ${code(measure.metric)}${measure.direction === undefined ? "" : `, to ${measure.direction}`}`,
        `- **Baseline:** ${text(measure.baseline)}`,
        `- **Target:** ${text(measure.target)}`,
        `- **Window:** ${text(measure.window)}`,
        `- **Source:** ${text(measure.source)}`,
        "",
      ];
    }
    case "slice": {
      const slice = meta.slice;
      if (slice === undefined) return [];
      return [
        "## Slice",
        "",
        `- **Kind:** ${slice.kind} · domain ${text(slice.domain)}`,
        `- **${slice.entrypoints.length === 1 ? "Entrypoint" : "Entrypoints"}:** ${slice.entrypoints.map(code).join(", ")}`,
        ...(slice.rationale === undefined ? [] : [`- **Rationale:** ${text(slice.rationale)}`]),
        "",
      ];
    }
    default:
      return [];
  }
}

/** Every link written in the record, then every link another record writes to it, which the graph derives. */
function linkSection(model: Model, id: string): string[] {
  const entry = (other: string) => `${idLink(other, `${other}.html`)} ${text(model.get(other)?.meta.title ?? "")}`;
  const items: string[] = [];
  for (const kind of LINK_KINDS) {
    const targets = model.from(id, kind);
    if (targets.length > 0) items.push(`- **${LINK_LABELS[kind].written}:** ${targets.map(entry).join("; ")}`);
  }
  for (const kind of LINK_KINDS) {
    const sources = model.into(id, kind);
    if (sources.length > 0) {
      items.push(`- **${LINK_LABELS[kind].derived}** (derived): ${sources.map(entry).join("; ")}`);
    }
  }
  return [
    "## Links",
    "",
    items.length === 0
      ? "No link is written in this record, and no other record links to it."
      : "Written in this record, then written in other records about it, which the graph derives (Core §5).",
    "",
    ...items,
    ...(items.length === 0 ? [] : [""]),
  ];
}

function availabilityLine(availability: Artifact["meta"]["availability"]): string {
  if (availability === undefined)
    return "Availability: none declared, so publication of anything about it fails closed.";
  const list = (values: string[]) => (values.length === 0 ? "none" : values.map(text).join(", "));
  return (
    `Availability: products ${list(availability.products)} · releases ${list(availability.releases)} · ` +
    `roles ${list(availability.roles)} · editions ${list(availability.editions)} · flags ${list(availability.flags)}`
  );
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

/** A claim's evidence in words: verified or not and why, or "not assessed" without evidence. */
function claimEvidence(model: Model, claim: string): string {
  if (!model.hasEvidence) return `${badge("not assessed", "neutral")} no run evidence supplied`;
  const coverage = model.coverageOf(claim);
  if (coverage === null) return `${badge("not assessed", "neutral")} not in the coverage report`;
  if (coverage.verifications.length === 0) return badge("not verified", "warn");
  const statuses = series(coverage.verifications.map((v) => `${code(v.id)} ${STATUS_WORDS[v.status].word}`));
  return coverage.verified
    ? `${badge("verified", "success")} ${statuses}`
    : `${badge("not verified", "warn")} ${statuses}`;
}
