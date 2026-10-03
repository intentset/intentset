/**
 * publication.html: publication readiness (Core §9, §10). For each knowledge
 * artifact, its visibility, audiences, availability and review status, and
 * which of the four projections would admit it. That last is the publisher's
 * own `project`, run once per projection with a request built from the
 * knowledge's own availability, so the page cannot disagree with what
 * `publish` would select. References and titles are checked only when
 * documents are generated, which this page does not do, and it says so.
 */
import { type Artifact, compareStrings, VISIBILITIES, type Visibility } from "@intentset/core";
import { PROJECTION_ADMITS, type PublicationRequest, project, reviewStatus } from "@intentset/publisher";
import type { Model } from "../model.ts";
import type { PageSource } from "../page.ts";
import { badge, code, link, ofTotal, series, table, text } from "../text.ts";
import { reviewCell } from "./shared.ts";

interface Readiness {
  /** Per projection: null when it would admit the knowledge, else the reason it would not. */
  results: Record<Visibility, string | null>;
  /** The request each projection was checked with, or null when none could be built. */
  request: Omit<PublicationRequest, "visibility"> | null;
}

export function publicationPage(model: Model): PageSource {
  const knowledge = model.ofType("knowledge");
  const readiness = new Map(knowledge.map((k) => [k.meta.id, readinessOf(model, k)]));
  const current = knowledge.filter((k) => reviewStatus(model.graph, k).status === "current").length;
  const admitted = knowledge.filter((k) =>
    VISIBILITIES.some((v) => readiness.get(k.meta.id)?.results[v] === null),
  ).length;
  const body: string[] = [
    "{.lead}",
    "Which projection would publish each knowledge artifact, checked by the publisher's own projection: deny by " +
      "default, every availability dimension intersected, drafts and retired records excluded, and review " +
      "current against the sources it explains. Each projection is checked with one request built from the " +
      "knowledge's own audiences and availability, taking the first value of each list in code-unit order. References and titles are checked only when " +
      "documents are generated, so a projection that admits a record here can still refuse its document.",
    "",
    `Knowledge artifacts: ${knowledge.length}. Review current: ${ofTotal(current, knowledge.length, "knowledge artifact")}. ` +
      `Admitted by at least one projection: ${ofTotal(admitted, knowledge.length, "knowledge artifact")}.`,
    "",
    ...table(
      ["Projection", "Admits visibility", "Authorization the request carries"],
      VISIBILITIES.map((v) => [
        v,
        PROJECTION_ADMITS[v].join(", "),
        v === "internal" ? "internal" : v === "restricted" ? "internal and restricted" : "none needed",
      ]),
    ),
    "",
  ];
  if (knowledge.length === 0) body.push("No knowledge records are in this snapshot.", "");

  for (const artifact of knowledge) {
    const id = artifact.meta.id;
    const { meta } = artifact;
    const state = readiness.get(id) as Readiness;
    const explains = model.from(id, "explains");
    const availability = meta.availability;
    body.push(
      `{#${id}}`,
      `## ${text(id)}: ${text(meta.title)}`,
      "",
      "{.small .muted}",
      ["knowledge", `status ${meta.status}`, `owner ${text(meta.owner)}`, code(artifact.path)].join(" · "),
      "",
      `- **Visibility:** ${meta.visibility}`,
      `- **Audiences:** ${meta.audiences.map(text).join(", ")}`,
      `- **Availability:** ${
        availability === undefined
          ? `${badge("none declared", "warn")} every projection excludes it; publication fails closed`
          : [
              `products ${list(availability.products)}`,
              `releases ${list(availability.releases)}`,
              `roles ${list(availability.roles)}`,
              `editions ${list(availability.editions)}`,
              `flags ${list(availability.flags)}`,
            ].join(" · ")
      }`,
      `- **Review:** ${reviewCell(reviewStatus(model.graph, artifact))}`,
      `- **Explains:** ${
        explains.length === 0
          ? "nothing"
          : explains
              .map((e) => (model.get(e)?.meta.type === "behavior" ? link(code(e), `behaviors/${e}.html`) : code(e)))
              .join(", ")
      }`,
      "",
      ...table(
        ["Projection", "Admits", "Result"],
        VISIBILITIES.map((v) => {
          const reason = state.results[v];
          return [
            v,
            PROJECTION_ADMITS[v].join(", "),
            reason === null ? badge("would publish", "success") : `${badge("excluded", "neutral")} ${text(reason)}`,
          ];
        }),
      ),
      "",
    );
    if (state.request !== null) {
      const r = state.request;
      body.push(
        "{.small .muted}",
        `Checked as audience ${text(r.audience)}, product ${code(r.product)}, release ${text(r.release)}, ` +
          `role ${text(r.role)}, edition ${text(r.edition)}, flags ${list(r.flags)}.`,
        "",
      );
    }
  }
  return { path: "publication.html", title: "Publication readiness", body };
}

function list(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.map(text).join(", ");
}

/** Run the projection for each visibility with a request made from the knowledge's own first values. */
function readinessOf(model: Model, artifact: Artifact): Readiness {
  const { meta } = artifact;
  const availability = meta.availability;
  const first = (values: readonly string[] | undefined) =>
    values === undefined ? undefined : [...values].sort(compareStrings)[0];
  const audience = first(meta.audiences);
  const product = first(availability?.products);
  const release = first(availability?.releases);
  const role = first(availability?.roles);
  const edition = first(availability?.editions);
  const results = {} as Record<Visibility, string | null>;
  if (
    availability === undefined ||
    audience === undefined ||
    product === undefined ||
    release === undefined ||
    role === undefined ||
    edition === undefined
  ) {
    for (const v of VISIBILITIES)
      results[v] = availability === undefined ? "availability-missing" : "availability incomplete";
    return { results, request: null };
  }
  const base = {
    audience,
    product,
    release,
    role,
    edition,
    flags: [...availability.flags].sort(compareStrings),
    ids: [meta.id],
  };
  for (const visibility of VISIBILITIES) {
    const request: PublicationRequest = {
      visibility,
      ...base,
      ...(visibility === "internal" || visibility === "restricted" ? { authorizedInternal: true } : {}),
      ...(visibility === "restricted" ? { authorizedRestricted: true } : {}),
    };
    const projection = project(model.graph, model.input.registries, request, {
      snapshot: { commit: model.input.snapshot.commit, graphHash: model.input.snapshot.graphHash },
    });
    if (projection.request === null) {
      const refused = projection.diagnostics.map((d) => d.message);
      results[visibility] = `request refused: ${series(refused)}`;
    } else if (projection.eligible.some((a) => a.meta.id === meta.id)) {
      results[visibility] = null;
    } else {
      results[visibility] = projection.excluded.find((e) => e.id === meta.id)?.reason ?? "not selected";
    }
  }
  return { results, request: base };
}
