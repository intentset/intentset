/**
 * `intentset publish` (Core §9): the deny-by-default projection of reviewed
 * knowledge for one audience, release and entitlement, as generated Markset
 * with provenance, optional HTML, the index a customer tool may read, and
 * retrieval chunks that carry the same filters. Refuses outright when the
 * graph does not validate. Review pins are read as written: a real pin is a
 * literal hash, and the fixtures' `@current` is never bound here, so an
 * unbound one reads as changed. Writes only into the --out directory, which
 * must be new or empty and outside the documents' scope.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Visibility, sortDiagnostics } from "@intentset/core";
import { type PublicationRequest, publish, toChunks } from "@intentset/publisher";
import { count, formatDiagnostic, type Io } from "../output.ts";
import { outputDirProblem, outputProblem } from "../outputs.ts";
import type { Session } from "../session.ts";

export interface PublishCliOptions {
  visibility?: string;
  audience?: string;
  product?: string;
  release?: string;
  role?: string;
  edition?: string;
  flags: string[];
  authorizedInternal: boolean;
  authorizedRestricted: boolean;
  out?: string;
  html: boolean;
  publishedAt?: string;
}

const ISO_8601 = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$/;

export function publishUsageProblem(options: PublishCliOptions): string | null {
  if (options.out === undefined || options.out === "") return "--out <dir> is required";
  if (options.publishedAt !== undefined && !ISO_8601.test(options.publishedAt)) {
    return `--published-at ${options.publishedAt}: give an ISO 8601 time such as 2026-10-02T12:00:00Z`;
  }
  return null;
}

export function publishCommand(session: Session, options: PublishCliOptions, io: Io): number {
  const fail = (message: string) => {
    io.stderr(`intentset publish: ${message}\n`);
    return 2;
  };
  const { repo, result, snapshot } = session;
  if (!result.ok) {
    for (const d of session.diagnostics) io.stdout(formatDiagnostic(d));
    io.stderr(
      `intentset publish: refused: validation at ${session.level} has ${count(session.errors, "error")}, and nothing is published from a graph that does not validate.\n`,
    );
    return 1;
  }
  const dir = resolve(io.cwd, options.out as string);
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    return fail(`--out ${options.out} is not empty; publish into a new or empty directory so nothing stale survives.`);
  }
  const where = outputDirProblem(repo, dir);
  if (where !== null) return fail(`--out ${options.out} ${where}.`);

  // The request exactly as given: a dimension left out stays out, and the publisher refuses it (no implicit wildcard).
  const request = {
    visibility: options.visibility as Visibility,
    audience: options.audience,
    product: options.product,
    release: options.release,
    role: options.role,
    edition: options.edition,
    flags: options.flags,
    authorizedInternal: options.authorizedInternal,
    authorizedRestricted: options.authorizedRestricted,
  } as PublicationRequest;
  const published = publish(result.graph, repo.registries, request, {
    snapshot: { commit: snapshot.commit, graphHash: snapshot.graphHash },
    publishedAt: options.publishedAt ?? new Date().toISOString(),
    renderHtml: options.html,
  });

  const outputs = new Map<string, string>();
  if (published.index.request !== null) {
    for (const document of published.documents) {
      outputs.set(`${document.id}.md`, document.markset);
      if (document.html !== undefined) outputs.set(`${document.id}.html`, document.html);
    }
    outputs.set("index.json", `${JSON.stringify(published.index, null, 2)}\n`);
    const chunks = toChunks(published.documents);
    outputs.set("chunks.jsonl", chunks.map((chunk) => `${JSON.stringify(chunk)}\n`).join(""));
  }
  for (const name of outputs.keys()) {
    const problem = outputProblem(repo, join(dir, name));
    if (problem !== null) return fail(`--out ${options.out}: ${name} ${problem}; nothing was written.`);
  }
  if (outputs.size > 0) mkdirSync(dir, { recursive: true });
  for (const [name, text] of outputs) writeFileSync(join(dir, name), text, { flag: "wx" });

  for (const d of sortDiagnostics(published.diagnostics)) io.stdout(formatDiagnostic(d));
  const index = published.index;
  const lines: string[] = [];
  if (index.request === null) {
    lines.push("The request was refused, so nothing was projected and nothing was written.");
  } else {
    const r = index.request;
    lines.push(
      `Published ${count(index.published.length, "document")} for a ${r.visibility} projection: audience ${r.audience}, ${r.product} ${r.release}, role ${r.role}, edition ${r.edition}, flags ${r.flags.length === 0 ? "none" : r.flags.join(", ")}`,
      ...index.published.map((id) => `  ${id}`),
    );
    const reasons = Object.keys(index.excludedCounts);
    lines.push(
      `Excluded, among what this projection may see (${reasons.length === 0 ? "none" : reasons.map((reason) => `${reason} ${index.excludedCounts[reason]}`).join(", ")})`,
      `Snapshot: ${snapshot.commit === null ? `no commit (${snapshot.commitUnavailable})` : `commit ${snapshot.commit}`}, graph ${snapshot.graphHash}`,
      `Wrote ${[...outputs.keys()].map((name) => join(options.out as string, name)).join(", ")}`,
    );
  }
  io.stdout(`${lines.join("\n")}\n`);
  return published.ok ? 0 : 1;
}
