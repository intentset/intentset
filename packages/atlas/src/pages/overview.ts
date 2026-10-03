/**
 * index.html: the product and capability overview (Core §10). The navigation
 * spine from each product down to its capabilities, then each capability's
 * behaviors with their status, owning slice, and claim counts: link counts
 * from the graph, current-pass counts only from supplied evidence. Every
 * count names its denominator and what it measures.
 */
import { type Artifact, type ArtifactType, hasErrors } from "@intentset/core";
import type { Model } from "../model.ts";
import type { PageSource } from "../page.ts";
import { badge, code, idLink, link, ofTotal, plural, table, text } from "../text.ts";

const SPINE: readonly ArtifactType[] = ["product", "intent", "outcome", "capability"];

export function overviewPage(model: Model): PageSource {
  const behaviors = model.ofType("behavior");
  const capabilities = model.ofType("capability");
  const total = model.graph.artifacts.size;
  const owned = behaviors.filter((b) => model.owners(b.meta.id).length > 0).length;
  const linked = behaviors.filter((b) => model.linked(b.meta.id)).length;
  const errors = model.input.diagnostics.filter((d) => d.severity === "error").length;
  const warnings = model.input.diagnostics.length - errors;

  const verified = behaviors.filter((b) => model.coverageOf(b.meta.id)?.verified === true).length;
  const body: string[] = [
    "{.lead}",
    `A derived overview of ${plural(total, "artifact")} in this snapshot: the navigation spine from each product to ` +
      "its capabilities, and each capability's behaviors with their owners and coverage. Link counts say a " +
      "verification definition names a claim; evidence counts say every such definition has a current pass at " +
      "this snapshot. Neither is a percentage, and neither stands in for the other.",
    "",
    ":::metrics",
    ...table(
      ["Measure", "Count", "Denominator and what it measures"],
      [
        ["Behaviors", `${behaviors.length} of ${total}`, "of all artifacts in the snapshot"],
        ["Capabilities", `${capabilities.length} of ${total}`, "of all artifacts in the snapshot"],
        ["Behaviors with an owning slice", `${owned} of ${behaviors.length}`, "of behaviors; links (implements)"],
        ["Behaviors named by a verification", `${linked} of ${behaviors.length}`, "of behaviors; links (verifies)"],
        model.hasEvidence
          ? [
              "Behaviors with current passing evidence",
              `${verified} of ${behaviors.length}`,
              "of behaviors; evidence at this snapshot",
            ]
          : ["Behaviors with current passing evidence", "not assessed", "no run evidence supplied"],
        [
          "Errors",
          `${errors} of ${errors + warnings}`,
          `of diagnostics; ${hasErrors(model.input.diagnostics) ? "validation fails" : "validation passes"}`,
        ],
      ],
    ),
    ":::",
    "",
  ];
  if (!model.hasEvidence) {
    body.push(
      "> [!NOTE] No run evidence supplied",
      "> Coverage on these pages is link coverage only: which claims a verification definition names. A " +
        "definition is not evidence, so nothing here says that any check passed.",
      "",
    );
  }

  body.push("## Product spine", "");
  const roots = SPINE.flatMap((type) => model.ofType(type)).filter((a) => {
    const parent = a.meta.parent;
    return parent === undefined || !model.graph.artifacts.has(parent);
  });
  if (roots.length === 0) body.push("No product, intent, outcome or capability records are in this snapshot.", "");
  else {
    body.push(...spine(model, roots, new Set()), "");
  }

  body.push("## Capabilities", "");
  if (capabilities.length === 0) body.push("No capability records are in this snapshot.", "");
  for (const capability of capabilities) body.push(...capabilitySection(model, capability));

  const orphans = behaviors.filter((b) => model.get(b.meta.parent ?? "")?.meta.type !== "capability");
  if (orphans.length > 0) {
    body.push(
      "## Behaviors outside any capability",
      "",
      `${ofTotal(orphans.length, behaviors.length, "behavior")} have no capability as their navigation parent.`,
      "",
      ...behaviorTable(model, orphans),
      "",
    );
  }
  return { path: "index.html", title: "Product and capability overview", body };
}

/** A nested list of spine artifacts under their navigation parents, with a visited set. */
function spine(model: Model, items: Artifact[], seen: Set<string>, depth = 0): string[] {
  const pad = "  ".repeat(depth);
  const lines: string[] = [];
  for (const item of items) {
    const id = item.meta.id;
    if (seen.has(id)) continue;
    seen.add(id);
    const href = item.meta.type === "capability" ? `index.html#${id}` : null;
    lines.push(`${pad}- ${idLink(id, href)} ${text(item.meta.title)} · ${item.meta.type} · ${item.meta.status}`);
    const children = model
      .into(id, "parent")
      .map((child) => model.get(child) as Artifact)
      .filter((child) => SPINE.includes(child.meta.type));
    lines.push(...spine(model, children, seen, depth + 1));
  }
  return lines;
}

function capabilitySection(model: Model, capability: Artifact): string[] {
  const id = capability.meta.id;
  const behaviors = model.into(id, "parent", "behavior").map((b) => model.get(b) as Artifact);
  const parent = capability.meta.parent;
  const facts = [
    "capability",
    `status ${capability.meta.status}`,
    `owner ${text(capability.meta.owner)}`,
    parent === undefined ? "no parent" : `parent ${code(parent)}`,
    code(capability.path),
  ];
  const lines = [
    `{#${id}}`,
    `### ${text(id)}: ${text(capability.meta.title)}`,
    "",
    "{.small .muted}",
    facts.join(" · "),
    "",
  ];
  if (behaviors.length === 0) {
    lines.push("No behavior has this capability as its navigation parent.", "");
    return lines;
  }
  const linked = behaviors.filter((b) => model.linked(b.meta.id)).length;
  const verified = model.hasEvidence
    ? `Verified at this snapshot: ${ofTotal(
        behaviors.filter((b) => model.coverageOf(b.meta.id)?.verified === true).length,
        behaviors.length,
        "behavior",
      )} (evidence).`
    : "Verified: not assessed, because no run evidence was supplied.";
  lines.push(
    `Named by a verification: ${ofTotal(linked, behaviors.length, "behavior")} (links). ${verified}`,
    "",
    ...behaviorTable(model, behaviors),
    "",
  );
  return lines;
}

/** One row per behavior: status, owner, and its claims (itself, rules, scenarios) linked and verified. */
function behaviorTable(model: Model, behaviors: Artifact[]): string[] {
  const rows = behaviors.map((behavior) => {
    const id = behavior.meta.id;
    const owners = model.owners(id);
    const claims = model.claimsOf(id);
    const linked = claims.filter((claim) => model.linked(claim)).length;
    const verified = model.hasEvidence
      ? ofTotal(claims.filter((claim) => model.coverageOf(claim)?.verified === true).length, claims.length, "claim")
      : "not assessed";
    return [
      `${link(code(id), `behaviors/${id}.html`)} ${text(behavior.meta.title)}`,
      behavior.meta.status,
      owners.length === 0 ? badge("no owner", "warn") : owners.map((o) => idLink(o, `ownership.html#${o}`)).join(", "),
      ofTotal(linked, claims.length, "claim"),
      verified,
    ];
  });
  return table(["Behavior", "Status", "Owning slice", "Claims linked (links)", "Claims verified (evidence)"], rows);
}
