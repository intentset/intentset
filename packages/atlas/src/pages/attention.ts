/**
 * attention.html: what needs a person (#159), as a work list rather than a picture. Drafts waiting for approval, by
 * type; claims with no current pass, split by why (failing, stale, missing a run, or named by no verification);
 * code no slice claims, from the architecture check when one was supplied; and knowledge held for review. Each group
 * names its count and what it counts over, each item links its record, and a group the inputs cannot decide says so
 * rather than reading as empty. Long groups fold closed, so the page stays a list of headings on a large model.
 */
import { ARTIFACT_TYPES, type Artifact, compareStrings } from "@intentset/core";
import { reviewStatus } from "@intentset/publisher";
import { CLAIM_TYPES, type Model } from "../model.ts";
import type { PageSource } from "../page.ts";
import { recordPath } from "../record-text.ts";
import { code, idLink, ofTotal, plural, text } from "../text.ts";
import { TYPE_HEADINGS } from "./records.ts";
import { type ClaimState, claimState, reviewCell } from "./shared.ts";

/** The architecture codes that report a file no slice claims (VSA009 for source, AMP004 for a backend file). */
const UNCLAIMED_CODES: ReadonlySet<string> = new Set(["VSA009", "AMP004"]);

/** The reasons a claim has no current pass, in the order the page lists them. */
const NO_PASS: readonly { state: ClaimState; heading: string; meaning: string }[] = [
  { state: "failing", heading: "Failing", meaning: "a verification failed or errored at this snapshot" },
  { state: "stale", heading: "Stale", meaning: "runs exist, but none at this snapshot, or the latest was skipped" },
  { state: "missing", heading: "Missing a run", meaning: "a verification names it and no run is recorded" },
  { state: "not linked", heading: "Named by no verification", meaning: "no verification definition names it" },
];

export function attentionPage(model: Model): PageSource {
  const all = [...model.graph.artifacts.values()].sort((a, b) => compareStrings(a.meta.id, b.meta.id));
  const drafts = all.filter((a) => a.meta.status === "draft");
  const claims = CLAIM_TYPES.flatMap((type) => model.ofType(type)).filter((c) => c.meta.status !== "retired");
  const states = new Map(claims.map((c) => [c.meta.id, claimState(model, c.meta.id)]));
  const knowledge = model.ofType("knowledge").filter((k) => k.meta.status !== "retired" && k.meta.status !== "draft");
  const held = knowledge.filter((k) => reviewStatus(model.graph, k).status !== "current");
  const body: string[] = [
    "{.lead}",
    "What is waiting on a person: records to approve, promises with no current pass, code no slice owns, and help held for review.",
    "",
    "Each group below says how many it holds and out of what.",
    "",
  ];

  body.push(
    "## Drafts waiting for approval",
    "",
    `${ofTotal(drafts.length, all.length, "record")} in this snapshot are drafts. Only a person approves a record.`,
    "",
  );
  for (const type of ARTIFACT_TYPES) {
    const ofType = drafts.filter((d) => d.meta.type === type);
    if (ofType.length === 0) continue;
    body.push(
      ...group(
        `${TYPE_HEADINGS[type]}: ${ofTotal(ofType.length, model.ofType(type).length, "record")} in draft`,
        ofType.map(entry),
      ),
    );
  }

  body.push(
    "## Claims with no current pass",
    "",
    `Claims are the behaviors, rules and scenarios that are not retired: ${claims.length} in this snapshot.`,
    "",
  );
  if (!model.hasEvidence) {
    body.push(
      "> [!NOTE] No run evidence supplied",
      "> Without run evidence no claim can be shown as passing, failing or stale, so only the claims no verification " +
        "names are listed. The rest are not assessed, which is not the same as passing.",
      "",
    );
  }
  for (const { state, heading, meaning } of NO_PASS) {
    if (!model.hasEvidence && state !== "not linked") continue;
    const ids = claims.filter((c) => states.get(c.meta.id) === state);
    body.push(...group(`${heading}: ${ofTotal(ids.length, claims.length, "claim")} (${meaning})`, ids.map(entry)));
  }
  if (!model.hasEvidence) {
    const unassessed = claims.filter((c) => states.get(c.meta.id) === "not assessed").length;
    body.push(`{.small}`, `Not assessed: ${ofTotal(unassessed, claims.length, "claim")}, named by a verification.`, "");
  }

  body.push("## Code no slice claims", "");
  const architecture = model.input.architecture ?? null;
  if (architecture === null) {
    body.push(
      "Not checked: no architecture check was supplied, so the Atlas cannot say which files no slice claims.",
      "",
    );
  } else {
    const unclaimed = architecture.diagnostics
      .filter((d) => UNCLAIMED_CODES.has(d.code) && d.artifact === null && d.path !== null)
      .map((d) => d.path as string);
    const files = [...new Set(unclaimed)].sort(compareStrings);
    body.push(
      `${plural(files.length, "file")} in the checked scope ${files.length === 1 ? "is" : "are"} claimed by no ` +
        "slice and lie in no shared, infrastructure or composition region (VSA009), or are backend files recorded " +
        "as no resource (AMP004).",
      "",
      ...(files.length === 0
        ? []
        : group(
            "Unclaimed files",
            files.map((f) => `- ${code(f)}`),
          )),
    );
  }

  body.push(
    "## Knowledge held for review",
    "",
    `${ofTotal(held.length, knowledge.length, "knowledge record")} past draft ${knowledge.length === 1 ? "is" : "are"} held: ` +
      "a source it explains changed since its review, or the review is incomplete. Publication leaves it out until a " +
      "person reviews it again.",
    "",
  );
  if (held.length > 0) {
    body.push(
      ...held.flatMap((k) => [
        `- ${idLink(k.meta.id, recordPath(k.meta.id))} ${text(k.meta.title)} · ${reviewCell(reviewStatus(model.graph, k))}`,
      ]),
      "",
    );
  }
  return { path: "attention.html", title: "Needs attention", body };
}

/** A group: listed as it is when short, folded closed when long, its title saying what it holds. */
function group(title: string, items: string[]): string[] {
  if (items.length === 0) return [`{.small}`, `${title}.`, ""];
  if (items.length <= 10) return [`### ${title}`, "", ...items, ""];
  return [`> [!NOTE]- ${title}`, ...items.map((item) => `> ${item}`), ""];
}

function entry(artifact: Artifact): string {
  const owner = artifact.meta.owner;
  return `- ${idLink(artifact.meta.id, recordPath(artifact.meta.id))} ${text(artifact.meta.title)} · ${artifact.meta.type} · owner ${text(owner)}`;
}
