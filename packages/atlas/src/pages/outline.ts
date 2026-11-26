/**
 * index.html: the outline, the Atlas's landing page (#159). The model as the hierarchy a person thinks in: each product,
 * the intents and outcomes it serves (with each outcome's measures), then each capability folded closed, holding its
 * behaviors, and beneath each behavior its rules, scenarios, owning slice, verifications and knowledge, each with its
 * state. Every fold's title carries its counts, rolled up from the behaviors beneath it, and each count names what it
 * counts. The folds are Markset's folding callouts, so the page needs no script and reads the same at any size: a
 * product with forty capabilities is forty closed lines until a reader opens one.
 */
import { type Artifact, type ArtifactType, compareStrings } from "@intentset/core";
import { reviewStatus } from "@intentset/publisher";
import type { Model } from "../model.ts";
import type { PageSource } from "../page.ts";
import { recordPath } from "../record-text.ts";
import { badge, idLink, link, ofTotal, plural, text } from "../text.ts";
import { claimBadge, deliveryWord, reviewBadge } from "./shared.ts";

/** The types the tree is built from, above the behaviors. */
const SPINE: readonly ArtifactType[] = ["product", "intent", "outcome", "capability"];

export function outlinePage(model: Model): PageSource {
  const behaviors = model.ofType("behavior");
  const capabilities = model.ofType("capability");
  const products = model.ofType("product");
  const body: string[] = [
    "{.lead}",
    "The model as a tree: each product, why it is changing and how that will be judged, then each capability, with " +
      "its behaviors folded inside it. Beneath each behavior are its rules, scenarios, owning slice, verifications " +
      "and knowledge, each with its state. Open a capability to see its behaviors; each fold says what is inside it.",
    "",
    `{.small}`,
    `${plural(products.length, "product")} · ${plural(capabilities.length, "capability", "capabilities")} · ` +
      `${plural(behaviors.length, "behavior")} · ${rollup(
        model,
        behaviors.map((b) => b.meta.id),
      )}`,
    "",
  ];
  if (!model.hasEvidence) {
    body.push(
      "> [!NOTE] No run evidence supplied",
      "> A claim's state here is whether a verification names it. Without run evidence nothing is shown as passing: " +
        "a named claim reads as not assessed, never as verified.",
      "",
    );
  }

  const roots = SPINE.flatMap((type) => model.ofType(type)).filter((a) => {
    const parent = a.meta.parent;
    return parent === undefined || !model.graph.artifacts.has(parent);
  });
  const seen = new Set<string>();
  if (roots.length === 0) body.push("No product, intent, outcome or capability records are in this snapshot.", "");
  for (const root of roots) body.push(...node(model, root, seen), "");

  const orphans = behaviors.filter((b) => model.get(b.meta.parent ?? "")?.meta.type !== "capability");
  if (orphans.length > 0) {
    body.push(
      "## Behaviors outside any capability",
      "",
      `${ofTotal(orphans.length, behaviors.length, "behavior")} have no capability as their navigation parent.`,
      "",
      ...orphans.flatMap((b) => behaviorItem(model, b)),
      "",
    );
  }
  body.push(
    "{.small}",
    `States: ${badge("verified", "success")} every verification that names the claim has a current pass; ` +
      `${badge("failing", "danger")} one failed or errored at this snapshot; ${badge("stale", "warn")} runs exist, ` +
      `none at this snapshot; ${badge("missing", "warn")} named, with no run recorded; ${badge("not linked", "warn")} ` +
      `no verification names it; ${badge("not assessed", "neutral")} no run evidence was supplied.`,
    "",
  );
  return { path: "index.html", title: "Outline", body };
}

/** Behaviors at or below a spine record, through `parent`, each counted once. */
function behaviorsUnder(model: Model, id: string, seen = new Set<string>()): string[] {
  if (seen.has(id)) return [];
  seen.add(id);
  const out: string[] = [];
  for (const child of model.into(id, "parent")) {
    const type = model.get(child)?.meta.type;
    if (type === "behavior") out.push(child);
    else if (type !== undefined && SPINE.includes(type)) out.push(...behaviorsUnder(model, child, seen));
  }
  return [...new Set(out)];
}

/** What a set of behaviors adds up to: owned, named by a verification, and, with evidence, verified. */
function rollup(model: Model, behaviors: string[]): string {
  const n = behaviors.length;
  const owned = behaviors.filter((b) => model.owners(b).length > 0).length;
  const linked = behaviors.filter((b) => model.linked(b)).length;
  const verified = model.hasEvidence
    ? `${ofTotal(behaviors.filter((b) => model.coverageOf(b)?.verified === true).length, n, "behavior")} verified (evidence)`
    : "verified: not assessed";
  return `${ofTotal(owned, n, "behavior")} with an owning slice · ${ofTotal(linked, n, "behavior")} named by a verification (links) · ${verified}`;
}

/**
 * One spine record. A product, intent or outcome is a heading, a level deeper each step down (to h4), with its status,
 * its counts and its children beneath it; a capability is a fold, closed, whose short title says what it is and how
 * many behaviors it holds, so a product with forty capabilities is forty lines until a reader opens one.
 */
function node(model: Model, artifact: Artifact, seen: Set<string>, depth = 2): string[] {
  const { id, type, title, status } = artifact.meta;
  if (seen.has(id)) return [];
  seen.add(id);
  const under = behaviorsUnder(model, id);
  const counts =
    under.length === 0 ? "no behaviors yet" : `${plural(under.length, "behavior")}: ${rollup(model, under)}`;
  const facts = `${status} · ${counts} · ${link("open its page", recordPath(id))}`;
  const inner: string[] = [];
  if (type === "outcome") {
    const measures = model.into(id, "parent", "measure");
    inner.push(
      measures.length === 0
        ? `Measures: ${badge("none", "warn")} nothing says how this outcome will be judged.`
        : `Measures: ${measures.map((m) => `${idLink(m, recordPath(m))} ${text(model.get(m)?.meta.title ?? "")}`).join("; ")}`,
      "",
    );
  }
  const children = model
    .into(id, "parent")
    .map((child) => model.get(child) as Artifact)
    .filter((child) => SPINE.includes(child.meta.type));
  const deeper = type === "capability" ? depth : Math.min(depth + 1, 4);
  for (const child of children) inner.push(...node(model, child, seen, deeper), "");
  const behaviors = model.into(id, "parent", "behavior").map((b) => model.get(b) as Artifact);
  for (const behavior of behaviors) inner.push(...behaviorItem(model, behavior));
  if (behaviors.length > 0) inner.push("");
  if (children.length === 0 && behaviors.length === 0) inner.push("Nothing sits under it yet.", "");
  if (type === "capability") {
    return [
      `> [!NOTE]- ${text(id)} · ${text(title)} · ${under.length === 0 ? "no behaviors yet" : plural(under.length, "behavior")}`,
      ...quote(trimEnd([facts, "", ...inner])),
    ];
  }
  return [
    `${"#".repeat(depth)} ${capitalize(type)} · ${text(id)}: ${text(title)}`,
    "",
    "{.small}",
    facts,
    "",
    ...trimEnd(inner),
  ];
}

/** One behavior as a list item, with its parts beneath it. */
function behaviorItem(model: Model, behavior: Artifact): string[] {
  const id = behavior.meta.id;
  const owners = model.owners(id);
  const rules = model.from(id, "governedBy", "rule");
  const scenarios = model.into(id, "illustrates", "scenario");
  const verifications = [...new Set(model.claimsOf(id).flatMap((c) => model.verificationsOf(c)))].sort(compareStrings);
  const knowledge = model.into(id, "explains", "knowledge");
  const ref = (other: string) => `${idLink(other, recordPath(other))} ${text(model.get(other)?.meta.title ?? "")}`;
  const delivery = deliveryWord(behavior.meta)?.word ?? "not stated";
  const part = (label: string, ids: string[], each: (id: string) => string, empty: string) =>
    `  - ${label}: ${ids.length === 0 ? empty : ids.map(each).join("; ")}`;
  return [
    `- ${ref(id)} · ${behavior.meta.status} · ${delivery} · ${claimBadge(model, id)} · ${link("trace", `${recordPath(id)}#trace`)}`,
    part("Rules", rules, (r) => `${ref(r)} ${claimBadge(model, r)}`, "none"),
    part("Scenarios", scenarios, (s) => `${ref(s)} ${claimBadge(model, s)}`, "none"),
    part("Owning slice", owners, ref, badge("no owner", "warn")),
    part("Verifications", verifications, ref, badge("none", "warn")),
    part(
      "Knowledge",
      knowledge,
      (k) => `${ref(k)} ${reviewBadge(reviewStatus(model.graph, model.get(k) as Artifact))}`,
      "none",
    ),
  ];
}

/** Lines quoted one level deeper, as a callout's body: an empty line stays a bare marker. */
function quote(lines: string[]): string[] {
  return lines.map((line) => (line === "" ? ">" : `> ${line}`));
}

function trimEnd(lines: string[]): string[] {
  const out = [...lines];
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
