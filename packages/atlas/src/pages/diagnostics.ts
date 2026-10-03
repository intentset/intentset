/**
 * diagnostics.html: every diagnostic the inputs carry, grouped by origin,
 * with Markset's syntax diagnostics in a section of their own (invariant 5:
 * Markset and Intentset diagnostics are never one undifferentiated list).
 * Validation, architecture and evidence diagnostics are merged, duplicates
 * dropped, and sorted by core's order.
 */
import { canonicalJson, compareStrings, type Diagnostic, type Origin, sortDiagnostics } from "@intentset/core";
import type { Model } from "../model.ts";
import type { PageSource } from "../page.ts";
import { badge, code, plural, text } from "../text.ts";

const INTENTSET_ORIGINS: readonly { origin: Origin; heading: string }[] = [
  { origin: "profile", heading: "Profile" },
  { origin: "graph", heading: "Graph" },
  { origin: "architecture", heading: "Architecture" },
  { origin: "evidence", heading: "Evidence" },
  { origin: "publication", heading: "Publication" },
  { origin: "render", heading: "Render" },
];

/** Validation diagnostics plus those of the architecture and evidence reports, each once, in core's order. */
export function allDiagnostics(model: Model): Diagnostic[] {
  const seen = new Set<string>();
  const out: Diagnostic[] = [];
  for (const d of [
    ...model.input.diagnostics,
    ...(model.input.architecture?.diagnostics ?? []),
    ...(model.input.evidence?.classification.diagnostics ?? []),
  ]) {
    const key = canonicalJson(d);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return sortDiagnostics(out);
}

export function diagnosticsPage(model: Model): PageSource {
  const all = allDiagnostics(model);
  const errors = all.filter((d) => d.severity === "error").length;
  const syntax = all.filter((d) => d.origin === "syntax");
  const body: string[] = [
    "{.lead}",
    `${plural(all.length, "diagnostic")} in this snapshot: ${errors} of ${all.length} ${errors === 1 ? "is an error" : "are errors"} ` +
      `and ${all.length - errors} of ${all.length} ${all.length - errors === 1 ? "is a warning" : "are warnings"}. ` +
      "Markset syntax diagnostics are listed apart from Intentset's own, and a document that renders is not " +
      "thereby conformant.",
    "",
    `## Markset syntax (${syntax.length})`,
    "",
    ...(syntax.length === 0 ? ["None."] : syntax.map(diagnosticItem)),
    "",
    `## Intentset (${all.length - syntax.length})`,
    "",
  ];
  const known = new Set<string>(["syntax", ...INTENTSET_ORIGINS.map((o) => o.origin)]);
  const groups = [
    ...INTENTSET_ORIGINS,
    // An origin this page does not know is still shown, under its own name, rather than dropped.
    ...[...new Set(all.map((d) => d.origin).filter((o) => !known.has(o)))]
      .sort(compareStrings)
      .map((origin) => ({ origin, heading: origin })),
  ];
  for (const { origin, heading } of groups) {
    const members = all.filter((d) => d.origin === origin);
    body.push(
      `### ${text(heading)} (${members.length})`,
      "",
      ...(members.length === 0 ? ["None."] : members.map(diagnosticItem)),
      "",
    );
  }
  return { path: "diagnostics.html", title: "Diagnostics", body };
}

/** One diagnostic as a list item: code, severity in words, where, what, and what to do. */
export function diagnosticItem(d: Diagnostic): string {
  const where =
    d.path === null ? "repository" : code(d.location === undefined ? d.path : `${d.path}:${d.location.line}`);
  const parts = [
    `**${text(d.code)}**`,
    badge(d.severity, d.severity === "error" ? "danger" : "warn"),
    where,
    ...(d.artifact === null ? [] : [code(d.artifact)]),
    ...(d.field === undefined ? [] : [`field ${code(d.field)}`]),
  ];
  return `- ${parts.join(" · ")}: ${text(d.message)} *Remediation:* ${text(d.remediation)}`;
}
