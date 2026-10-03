/**
 * behaviors/<ID>.html: one behavior in detail (Core §10). Its context bundle,
 * the same one `contextFor` gives an agent, as one card per role; its claims
 * and their evidence; its verification definitions with their evidence
 * status; the knowledge that explains it with its review status; and its own
 * text, verbatim and inert.
 */
import { type Artifact, type ContextArtifact, type ContextRole, compareStrings, contextFor } from "@intentset/core";
import { reviewStatus } from "@intentset/publisher";
import { type Model, STATUS_WORDS } from "../model.ts";
import type { PageSource } from "../page.ts";
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

export function behaviorPage(model: Model, behavior: Artifact): PageSource {
  const id = behavior.meta.id;
  const path = `behaviors/${id}.html`;
  const { meta } = behavior;
  const ancestry = model.ancestry(id);
  const body: string[] = [
    "{.small .muted}",
    [
      "behavior",
      `status ${meta.status}`,
      `owner ${text(meta.owner)}`,
      `visibility ${meta.visibility}`,
      `audiences ${meta.audiences.map(text).join(", ")}`,
      code(behavior.path),
    ].join(" · "),
    "",
    `Navigation: ${[link("Overview", "../index.html"), ...ancestry.map((a) => ancestorLink(model, a))].join(" › ")}`,
    "",
    availabilityLine(meta.availability),
    "",
  ];

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
  for (const role of Object.keys(ROLE_HEADINGS) as Exclude<ContextRole, "start">[]) {
    const inRole = members.filter((a) => a.role === role);
    if (inRole.length === 0 && !ALWAYS.has(role)) continue;
    const tone = inRole.length === 0 ? (EMPTY_TONE[role] ?? "neutral") : "neutral";
    body.push(`:::card[${ROLE_HEADINGS[role]} (${inRole.length})]{tone=${tone}}`);
    if (inRole.length === 0) body.push(emptyRole(role));
    else body.push(...inRole.map((a) => `- ${bundleEntry(a)}`));
    body.push(":::", "");
  }

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
          `${code(claim)} ${text(artifact.meta.title)}`,
          artifact.meta.type,
          artifact.meta.status,
          verifications.length === 0
            ? badge("not linked", "warn")
            : verifications.map((v) => idLink(v, `../verification.html#${v}`)).join(", "),
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
            `${idLink(v, `../verification.html#${v}`)} ${text(artifact.meta.title)}`,
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
            `${idLink(k, `../publication.html#${k}`)} ${text(artifact.meta.title)}`,
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

  body.push(
    "## Record text",
    "",
    `The body of ${code(behavior.path)} as written, shown as source and never interpreted.`,
    "",
    ...fenced(behavior.body, "markdown"),
    "",
  );
  return { path, title: `${id}: ${meta.title}`, body };
}

function ancestorLink(model: Model, id: string): string {
  const type = model.get(id)?.meta.type;
  return type === "capability" ? idLink(id, `../index.html#${id}`) : code(id);
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
  const href =
    a.type === "behavior"
      ? `${a.id}.html`
      : a.type === "slice"
        ? `../ownership.html#${a.id}`
        : a.type === "verification"
          ? `../verification.html#${a.id}`
          : a.type === "knowledge"
            ? `../publication.html#${a.id}`
            : a.type === "capability"
              ? `../index.html#${a.id}`
              : null;
  const restricted = a.visibility === "restricted" ? ` ${badge("restricted", "danger")}` : "";
  return `${idLink(a.id, href)} ${text(a.title)} · ${a.type} · ${a.status}${restricted} · ${code(a.path)}`;
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
