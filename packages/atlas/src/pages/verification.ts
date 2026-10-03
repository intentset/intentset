/**
 * verification.html: coverage and evidence (Core §8, §10; invariants 3 and
 * 6). Claims are behaviors, rules and scenarios that are not retired, and are
 * the denominator of every count. Two things are counted and never merged:
 * links (a verification definition names the claim) and evidence (every
 * applicable definition has a current pass at this snapshot). Manual and
 * automated are counted apart. Every status is a word on the page. Without
 * run evidence the page says so and shows link coverage only.
 */
import { type Artifact, compareStrings } from "@intentset/core";
import { CLAIM_TYPES, type Model, STATUS_ORDER, STATUS_WORDS } from "../model.ts";
import type { PageSource } from "../page.ts";
import { badge, code, idLink, link, ofTotal, plural, table, text } from "../text.ts";
import type { ClaimCounts } from "../types.ts";
import { evidenceCell, latestRun } from "./shared.ts";

export function verificationPage(model: Model): PageSource {
  const evidence = model.input.evidence ?? null;
  const verifications = model.ofType("verification");
  const claims = CLAIM_TYPES.flatMap((type) => model.ofType(type)).sort((a, b) => compareStrings(a.meta.id, b.meta.id));
  const current = claims.filter((c) => c.meta.status !== "retired");
  const body: string[] = [
    "{.lead}",
    "Definitions are not evidence. Each count below names its denominator, the claims (behaviors, rules and " +
      "scenarios) that are not retired, and what it measures: **links**, where a verification definition names " +
      "the claim, or **evidence**, where every applicable definition has a current pass at this snapshot. Only a " +
      "pass at this commit and graph hash is current. No count is reduced to a percentage.",
    "",
  ];

  if (evidence === null) {
    body.push(
      "> [!NOTE] No run evidence supplied",
      "> This page shows link coverage only. Nothing on it says that any check passed, and no claim is counted " +
        "as verified.",
      "",
    );
  } else if (evidence.classification.snapshot.graphHash !== model.input.snapshot.graphHash) {
    body.push(
      "> [!CAUTION] Evidence classified against another snapshot",
      `> The run evidence was classified at graph hash ${text(evidence.classification.snapshot.graphHash.slice(0, 12))}, ` +
        "not this snapshot's. Its statuses describe that snapshot, not this one.",
      "",
    );
  }

  // Link counts come from the graph, so they are the same with or without evidence.
  const denominator = count(current, () => true);
  const linked = count(current, (c) => model.linked(c.meta.id));
  const byMethod = (method: "manual" | "automated") =>
    count(current, (c) =>
      model.verificationsOf(c.meta.id).some((v) => model.get(v)?.meta.verification?.method === method),
    );
  const retired = count(
    claims.filter((c) => c.meta.status === "retired"),
    () => true,
  );
  const of = (n: ClaimCounts) => [
    `${n.behaviors} of ${denominator.behaviors}`,
    `${n.rules} of ${denominator.rules}`,
    `${n.scenarios} of ${denominator.scenarios}`,
  ];
  const rows: string[][] = [
    [
      "Denominator: claims not retired",
      `${denominator.behaviors}`,
      `${denominator.rules}`,
      `${denominator.scenarios}`,
      "records in snapshot",
    ],
    ["Linked by any definition", ...of(linked), "links"],
    ["Linked by a manual definition", ...of(byMethod("manual")), "links"],
    ["Linked by an automated definition", ...of(byMethod("automated")), "links"],
  ];
  if (evidence === null) {
    rows.push([
      "Verified at this snapshot",
      "not assessed",
      "not assessed",
      "not assessed",
      "no run evidence supplied",
    ]);
  } else {
    const coverage = evidence.coverage;
    rows.push(
      ["Verified at this snapshot", ...of(coverage.verified), "evidence (current pass)"],
      ["Verified by manual definitions", ...of(coverage.manual.verified), "evidence (current pass)"],
      ["Verified by automated definitions", ...of(coverage.automated.verified), "evidence (current pass)"],
    );
  }
  body.push(
    "## Coverage",
    "",
    ":::figure[Claim coverage at this snapshot. Each cell is a count of the claims of that type that are not retired.]",
    ...table(["Count", "Behaviors", "Rules", "Scenarios", "Measures"], rows),
    ":::",
    "",
    `Retired claims are outside the denominator: ${retired.behaviors} behaviors, ${retired.rules} rules, ` +
      `${retired.scenarios} scenarios.`,
    "",
  );

  body.push("## Evidence status of verification definitions", "");
  if (evidence === null) {
    body.push(
      `No run evidence supplied, so 0 of ${plural(verifications.length, "verification definition")} ` +
        `${verifications.length === 1 ? "has" : "have"} been assessed. With run records, each would read as one of these:`,
      "",
      ...STATUS_ORDER.map(
        (s) => `- ${badge(STATUS_WORDS[s].word, STATUS_WORDS[s].tone)} ${text(STATUS_WORDS[s].meaning)}`,
      ),
      "",
    );
  } else {
    const statuses = verifications.map((v) => model.evidenceOf(v.meta.id)?.status ?? "unresolved");
    body.push(
      ...STATUS_ORDER.map((s) => {
        const n = statuses.filter((status) => status === s).length;
        return `- ${badge(STATUS_WORDS[s].word, STATUS_WORDS[s].tone)} ${ofTotal(n, verifications.length, "verification definition")}: ${text(STATUS_WORDS[s].meaning)}`;
      }),
      "",
      `Run records set aside: ${evidence.classification.ignoredOutOfScope} for another product or release, ` +
        `${evidence.classification.unknown.length} naming no verification in this graph, ` +
        `${evidence.classification.rejected.length} that cannot be evidence for the definition they name.`,
      "",
    );
  }

  body.push(
    "## Claims",
    "",
    `Required at level ${text(model.input.snapshot.level)}: evidence is required from L3, and never for a draft.`,
    "",
    ...table(
      ["Claim", "Type", "Status", "Required", "Verification definitions", "Linked (links)", "Verified (evidence)"],
      current.map((claim) => claimRow(model, claim)),
    ),
    "",
  );

  body.push("## Verification definitions", "");
  if (verifications.length === 0) body.push("No verification definitions are in this snapshot.", "");
  for (const verification of verifications) body.push(...verificationSection(model, verification));

  body.push("## What could not be checked", "");
  const unresolved = evidence?.coverage.unresolved ?? [];
  if (evidence === null) body.push("Evidence could not be checked: no run evidence was supplied.", "");
  else if (unresolved.length === 0) body.push("Nothing: every verification definition was classified.", "");
  else body.push(...unresolved.map((u) => `- ${code(u.subject)}: ${text(u.reason)}`), "");
  return { path: "verification.html", title: "Verification status", body };
}

function count(artifacts: Artifact[], keep: (a: Artifact) => boolean): ClaimCounts {
  const counts: ClaimCounts = { behaviors: 0, rules: 0, scenarios: 0 };
  for (const artifact of artifacts) {
    if (!keep(artifact)) continue;
    if (artifact.meta.type === "behavior") counts.behaviors++;
    else if (artifact.meta.type === "rule") counts.rules++;
    else if (artifact.meta.type === "scenario") counts.scenarios++;
  }
  return counts;
}

function claimRow(model: Model, claim: Artifact): string[] {
  const id = claim.meta.id;
  const verifications = model.verificationsOf(id);
  const coverage = model.coverageOf(id);
  const verified = !model.hasEvidence
    ? badge("not assessed", "neutral")
    : coverage === null
      ? `${badge("not assessed", "neutral")} not in the coverage report`
      : coverage.verified
        ? badge("verified", "success")
        : badge("not verified", "warn");
  const listed = verifications.map((v) => {
    const method = model.get(v)?.meta.verification?.method ?? "method not declared";
    const status = model.evidenceOf(v)?.status;
    const word = status === undefined ? "" : ` ${STATUS_WORDS[status].word}`;
    return `${idLink(v, `#${v}`)} ${method}${word}`;
  });
  return [
    `${claim.meta.type === "behavior" ? link(code(id), `behaviors/${id}.html`) : code(id)} ${text(claim.meta.title)}`,
    claim.meta.type,
    claim.meta.status,
    model.evidenceRequired(claim.meta.status) ? "yes" : "no",
    listed.length === 0 ? "none" : listed.join(", "),
    verifications.length > 0 ? badge("linked", "success") : badge("not linked", "warn"),
    verified,
  ];
}

function verificationSection(model: Model, verification: Artifact): string[] {
  const id = verification.meta.id;
  const meta = verification.meta.verification;
  const named = model.from(id, "verifies");
  const evidence = model.evidenceOf(id);
  const items = [
    `- **Method:** ${meta === undefined ? "not declared" : meta.method} · locator ${
      meta === undefined ? "not declared" : code(meta.locator)
    } · selector ${meta === undefined ? "not declared" : code(meta.selector)}`,
    `- **Verifies:** ${
      named.length === 0
        ? "nothing"
        : named
            .map((c) => (model.get(c)?.meta.type === "behavior" ? link(code(c), `behaviors/${c}.html`) : code(c)))
            .join(", ")
    }`,
    `- **Evidence:** ${evidenceCell(model, id)}`,
    `- **Latest run:** ${latestRun(model, id)}`,
  ];
  if (evidence !== null) {
    const at = evidence.atSnapshot;
    items.push(
      `- **Runs:** ${plural(evidence.history.length, "record")} in scope; at this snapshot ${at.pass} pass, ` +
        `${at.fail} fail, ${at.skip} skip, ${at.error} error; ${evidence.outOfScope} for another product or release`,
    );
  }
  return [
    `{#${id}}`,
    `### ${text(id)}: ${text(verification.meta.title)}`,
    "",
    "{.small .muted}",
    [
      `verification`,
      `status ${verification.meta.status}`,
      `owner ${text(verification.meta.owner)}`,
      code(verification.path),
    ].join(" · "),
    "",
    ...items,
    "",
  ];
}
