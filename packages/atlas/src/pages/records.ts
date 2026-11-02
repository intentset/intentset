/**
 * records.html: every record in the snapshot by type, in the Core's order from
 * product to decision, each linked to its page, where its text is. The one
 * place every record is listed, so no record's page is reached only by a link
 * from another page.
 */
import { ARTIFACT_TYPES, type ArtifactType } from "@intentset/core";
import type { Model } from "../model.ts";
import type { PageSource } from "../page.ts";
import { recordPath } from "../record-text.ts";
import { idLink, plural, text } from "../text.ts";

/** Each type as the Records page heads it, and as a record's page names where it is listed. */
export const TYPE_HEADINGS: Record<ArtifactType, string> = {
  product: "Products",
  intent: "Intents",
  outcome: "Outcomes",
  measure: "Measures",
  capability: "Capabilities",
  behavior: "Behaviors",
  rule: "Rules",
  scenario: "Scenarios",
  slice: "Slices",
  contract: "Contracts",
  verification: "Verifications",
  knowledge: "Knowledge",
  decision: "Decisions",
};

export function recordsPage(model: Model): PageSource {
  const present = ARTIFACT_TYPES.filter((type) => model.ofType(type).length > 0);
  const body: string[] = [
    "{.lead}",
    `Every record in this snapshot: ${plural(model.graph.artifacts.size, "record")} of ` +
      `${plural(present.length, "type")}, each on a page of its own with its text as written, its links and ` +
      "what the other review pages say about it.",
    "",
  ];
  if (present.length === 0) body.push("No records are in this snapshot.", "");
  for (const type of present) {
    const records = model.ofType(type);
    body.push(
      `{#${type}}`,
      `## ${TYPE_HEADINGS[type]} (${records.length})`,
      "",
      ...records.map((r) => `- ${idLink(r.meta.id, recordPath(r.meta.id))} ${text(r.meta.title)} · ${r.meta.status}`),
      "",
    );
  }
  return { path: "records.html", title: "Records", body };
}
