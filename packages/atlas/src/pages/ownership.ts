/**
 * ownership.html: engineering ownership (Core §10, VSA §3). Each slice with
 * what it implements, exposes, consumes and depends on, its path claims and
 * layers, and the shared resources the registries name for it; behaviors
 * nobody owns; and the architecture check when one was supplied. Without one
 * the page says that ownership is shown as declared, not as checked.
 */
import { type Artifact, compareStrings, type LinkKind } from "@intentset/core";
import type { Model } from "../model.ts";
import type { PageSource } from "../page.ts";
import { badge, code, idLink, link, ofTotal, plural, table, text } from "../text.ts";
import { diagnosticItem } from "./diagnostics.ts";

export function ownershipPage(model: Model): PageSource {
  const slices = model.ofType("slice");
  const behaviors = model.ofType("behavior");
  const unowned = behaviors.filter((b) => model.owners(b.meta.id).length === 0);
  const product = slices.filter((s) => s.meta.slice?.kind === "product").length;
  const body: string[] = [
    "{.lead}",
    `${plural(slices.length, "slice")} in this snapshot (${product} product, ${slices.length - product} technical). ` +
      `Behaviors with an owning slice: ${ofTotal(behaviors.length - unowned.length, behaviors.length, "behavior")} ` +
      "(links: a slice declares it in `implements`).",
    "",
  ];
  const architecture = model.input.architecture ?? null;
  if (architecture === null) {
    body.push(
      "> [!NOTE] No architecture check supplied",
      "> Ownership on this page is as the slice records declare it. Nothing here checks the claims against the " +
        "source files, imports or layers.",
      "",
    );
  }

  body.push("## Slices", "");
  if (slices.length === 0) body.push("No slice records are in this snapshot.", "");
  for (const slice of slices) body.push(...sliceSection(model, slice));

  body.push("## Behaviors without an owning slice", "");
  if (unowned.length === 0) {
    const all = ofTotal(behaviors.length, behaviors.length, "behavior");
    body.push(`None: ${all} ${behaviors.length === 1 ? "has" : "have"} an owning slice.`, "");
  } else {
    body.push(
      `${ofTotal(unowned.length, behaviors.length, "behavior")} have no slice implementing them.`,
      "",
      ...unowned.map(
        (b) => `- ${link(code(b.meta.id), `behaviors/${b.meta.id}.html`)} ${text(b.meta.title)} · ${b.meta.status}`,
      ),
      "",
    );
  }

  const resources = [...model.input.registries.resources].sort((a, b) => compareStrings(a.id, b.id));
  body.push("## Shared resources", "");
  if (resources.length === 0) body.push("The registries declare no shared resources.", "");
  else {
    body.push(
      `${plural(resources.length, "shared resource")} declared in the registries.`,
      "",
      ...table(
        ["Resource", "Path", "Owner", "Declared consumers"],
        resources.map((r) => [
          code(r.id),
          code(r.path),
          text(r.owner),
          r.consumers.length === 0
            ? "none"
            : [...r.consumers]
                .sort(compareStrings)
                .map((c) => idLink(c, model.get(c)?.meta.type === "slice" ? `#${c}` : null))
                .join(", "),
        ]),
      ),
      "",
    );
  }

  body.push("## Architecture check", "");
  if (architecture === null) body.push("No architecture check was supplied for this snapshot.", "");
  else {
    const keys = Object.keys(architecture.summary).sort(compareStrings);
    body.push(
      `Summary as the check reported it. ${plural(architecture.diagnostics.length, "diagnostic")} from the check, ` +
        `also listed on the ${link("diagnostics page", "diagnostics.html")}.`,
      "",
      ...table(
        ["Measure", "Value"],
        keys.map((key) => [text(key), summaryValue(architecture.summary[key])]),
      ),
      "",
      ...[...architecture.diagnostics].map(diagnosticItem),
      "",
    );
  }
  return { path: "ownership.html", title: "Engineering ownership", body };
}

const RELATIONS: readonly { kind: LinkKind; label: string }[] = [
  { kind: "implements", label: "Implements" },
  { kind: "exposes", label: "Exposes" },
  { kind: "consumes", label: "Consumes" },
  { kind: "dependsOn", label: "Depends on" },
  { kind: "informedBy", label: "Informed by" },
];

function sliceSection(model: Model, slice: Artifact): string[] {
  const id = slice.meta.id;
  const meta = slice.meta.slice;
  const facts = [
    "slice",
    meta === undefined ? "kind not declared" : `kind ${meta.kind}`,
    `status ${slice.meta.status}`,
    `owner ${text(slice.meta.owner)}`,
    ...(meta === undefined ? [] : [`domain ${text(meta.domain)}`]),
    code(slice.path),
  ];
  const lines = [
    `{#${id}}`,
    `### ${text(id)}: ${text(slice.meta.title)}`,
    "",
    "{.small .muted}",
    facts.join(" · "),
    "",
  ];
  const items: string[] = [];
  if (meta !== undefined) {
    items.push(
      `- **${meta.entrypoints.length === 1 ? "Entrypoint" : "Entrypoints"}:** ${meta.entrypoints.map(code).join(", ")}`,
    );
  }
  if (meta?.rationale !== undefined) items.push(`- **Rationale:** ${text(meta.rationale)}`);
  for (const { kind, label } of RELATIONS) {
    const targets = model.from(id, kind);
    const written = targets.map((t) => {
      const target = model.get(t) as Artifact;
      const href =
        target.meta.type === "behavior" ? `behaviors/${t}.html` : target.meta.type === "slice" ? `#${t}` : null;
      return `${idLink(t, href)} ${text(target.meta.title)}`;
    });
    items.push(`- **${label}:** ${written.length === 0 ? "none" : written.join("; ")}`);
  }
  const dependents = model.into(id, "dependsOn", "slice");
  items.push(
    `- **Depended on by:** ${dependents.length === 0 ? "none" : dependents.map((d) => idLink(d, `#${d}`)).join(", ")}`,
  );
  const resources = model.input.registries.resources
    .filter((r) => (meta?.usesResources ?? []).includes(r.id) || r.consumers.includes(id))
    .sort((a, b) => compareStrings(a.id, b.id));
  const undeclared = (meta?.usesResources ?? []).filter(
    (r) => !model.input.registries.resources.some((x) => x.id === r),
  );
  items.push(
    `- **Shared resources:** ${
      resources.length === 0 && undeclared.length === 0
        ? "none"
        : [
            ...resources.map((r) => `${code(r.id)} at ${code(r.path)}, owned by ${text(r.owner)}`),
            ...undeclared.map((r) => `${code(r)} ${badge("not in registries", "warn")}`),
          ].join("; ")
    }`,
  );
  lines.push(...items, "");

  if (meta !== undefined) {
    if (meta.claims.length === 0) lines.push("No path claims.", "");
    else {
      lines.push(
        ...table(
          ["Claim kind", "Path pattern"],
          meta.claims.map((c) => [c.kind, code(c.path)]),
        ),
        "",
      );
    }
    const layers = Object.keys(meta.layers).sort(compareStrings);
    if (layers.length > 0) {
      lines.push(
        ...table(
          ["Layer", "Path patterns"],
          layers.map((layer) => [text(layer), (meta.layers[layer] ?? []).map(code).join(", ")]),
        ),
        "",
      );
    }
  }
  return lines;
}

function summaryValue(value: unknown): string {
  if (Array.isArray(value)) return value.length === 0 ? "none" : value.map((v) => text(String(v))).join(", ");
  if (value === null || value === undefined) return "not reported";
  if (typeof value === "object") return code(JSON.stringify(value));
  return text(String(value));
}
