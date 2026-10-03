/**
 * Coverage (Core §8, §10; invariants 3 and 6). Behaviors, rules and scenarios
 * are each claims that need their own coverage: a passing behavior does not
 * cover its rules or its scenarios. Two things are counted and never merged:
 * link coverage (a verification definition names the claim in `verifies`) and
 * current-pass coverage (every applicable verification linked to the claim has
 * a pass at the snapshot). Manual and automated are counted separately again.
 * Every count travels with its snapshot and denominator, and nothing is ever
 * reduced to a single percentage.
 */
import { type Graph, incomingEdges, type Level, LEVELS, type Status } from "@intentset/core";
import type { Classification, EvidenceStatus } from "./classify.ts";
import { compareStrings } from "./diagnostic.ts";

export const CLAIM_TYPES = ["behavior", "rule", "scenario"] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export interface ClaimCounts {
  behaviors: number;
  rules: number;
  scenarios: number;
}

export interface LinkedVerification {
  id: string;
  method: "automated" | "manual";
  status: EvidenceStatus;
}

export interface MethodCoverage {
  /** At least one verification of this method names the claim. */
  linked: boolean;
  /** At least one does, and every one that does has a current pass. */
  verified: boolean;
}

export interface ClaimCoverage {
  id: string;
  type: ClaimType;
  path: string;
  /** The claim's lifecycle status: an editorial claim, never a test result (Core §7). */
  lifecycle: Status;
  /** True when the level asks for evidence (L3 and above) and the claim is not a draft. */
  required: boolean;
  /** Applicable verifications naming this claim in `verifies`, by ID. Retired verifications are not applicable. */
  verifications: LinkedVerification[];
  linked: boolean;
  /** At least one applicable verification, and every one of them is a current pass. */
  verified: boolean;
  manual: MethodCoverage;
  automated: MethodCoverage;
}

export interface Unresolved {
  /** What could not be checked: an artifact ID, or a word for a repository-wide gap such as "scope". */
  subject: string;
  reason: string;
}

export interface CoverageReport {
  snapshot: Classification["snapshot"];
  level: Level;
  /** What each count measures, stated with the counts so no reader has to infer it. */
  measures: { linked: string; verified: string };
  /** Behaviors, rules and scenarios that are not retired: the denominator of every count below. */
  denominator: ClaimCounts;
  /** Claims outside the denominator, and why. */
  excluded: { retired: ClaimCounts };
  linked: ClaimCounts;
  verified: ClaimCounts;
  manual: { linked: ClaimCounts; verified: ClaimCounts };
  automated: { linked: ClaimCounts; verified: ClaimCounts };
  /** One entry per claim in the denominator, by ID. */
  perClaim: ClaimCoverage[];
  /** What could not be checked. Never read as pass. */
  unresolved: Unresolved[];
}

export interface CoverageOptions {
  level?: Level;
}

const PLURAL: Record<ClaimType, keyof ClaimCounts> = { behavior: "behaviors", rule: "rules", scenario: "scenarios" };

export function zeroCounts(): ClaimCounts {
  return { behaviors: 0, rules: 0, scenarios: 0 };
}

/** Core §8: link coverage and current-pass coverage of every behavior, rule and scenario, counted separately. */
export function coverage(graph: Graph, classification: Classification, options: CoverageOptions = {}): CoverageReport {
  const level = options.level ?? "L1";
  const evidenceRequired = LEVELS.indexOf(level) >= LEVELS.indexOf("L3");
  const report: CoverageReport = {
    snapshot: classification.snapshot,
    level,
    measures: {
      linked: "links: claims named in verifies by at least one applicable verification definition",
      verified: "evidence: claims whose every applicable verification has a current pass at the snapshot",
    },
    denominator: zeroCounts(),
    excluded: { retired: zeroCounts() },
    linked: zeroCounts(),
    verified: zeroCounts(),
    manual: { linked: zeroCounts(), verified: zeroCounts() },
    automated: { linked: zeroCounts(), verified: zeroCounts() },
    perClaim: [],
    unresolved: [],
  };

  for (const id of [...graph.artifacts.keys()].sort(compareStrings)) {
    const artifact = graph.artifacts.get(id);
    if (artifact === undefined) continue;
    const type = artifact.meta.type;
    if (type !== "behavior" && type !== "rule" && type !== "scenario") continue;
    const key = PLURAL[type];
    if (artifact.meta.status === "retired") {
      report.excluded.retired[key]++;
      continue;
    }
    report.denominator[key]++;

    const verifications: LinkedVerification[] = [];
    const sources = incomingEdges(graph, id, "verifies").map((edge) => edge.from);
    for (const source of [...new Set(sources)].sort(compareStrings)) {
      const verification = graph.artifacts.get(source);
      if (verification === undefined || verification.meta.type !== "verification") continue;
      if (verification.meta.status === "retired") continue;
      const evidence = classification.verifications[source];
      verifications.push({
        id: source,
        method: verification.meta.verification?.method ?? evidence?.method ?? "automated",
        status: evidence?.status ?? "unresolved",
      });
    }

    const byMethod = (method: "automated" | "manual"): MethodCoverage => {
      const linked = verifications.filter((v) => v.method === method);
      return {
        linked: linked.length > 0,
        verified: linked.length > 0 && linked.every((v) => v.status === "current-pass"),
      };
    };
    const claim: ClaimCoverage = {
      id,
      type,
      path: artifact.path,
      lifecycle: artifact.meta.status,
      required: evidenceRequired && artifact.meta.status !== "draft",
      verifications,
      linked: verifications.length > 0,
      verified: verifications.length > 0 && verifications.every((v) => v.status === "current-pass"),
      manual: byMethod("manual"),
      automated: byMethod("automated"),
    };
    report.perClaim.push(claim);
    if (claim.linked) report.linked[key]++;
    if (claim.verified) report.verified[key]++;
    for (const method of ["manual", "automated"] as const) {
      if (claim[method].linked) report[method].linked[key]++;
      if (claim[method].verified) report[method].verified[key]++;
    }
  }

  if (classification.snapshot.scope === null) {
    report.unresolved.push({
      subject: "scope",
      reason: "no product and release were requested, so records of every scope were considered",
    });
  }
  for (const id of Object.keys(classification.verifications)) {
    const evidence = classification.verifications[id];
    if (evidence.status === "unresolved")
      report.unresolved.push({ subject: id, reason: evidence.note ?? "evidence could not be classified" });
  }
  report.unresolved.sort(compareUnresolved);
  return report;
}

export function compareUnresolved(a: Unresolved, b: Unresolved): number {
  return compareStrings(a.subject, b.subject) || compareStrings(a.reason, b.reason);
}
