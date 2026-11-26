/**
 * `intentset publish` (Core §9): the deny-by-default projection of reviewed
 * knowledge for one reader, every audience and role they hold given by
 * repeating --audience and --role (ADR 0029), on one release, as generated Markset
 * with provenance, optional HTML (a page, or under --html=fragment the page's
 * content without its title), the index a customer tool may read, the
 * help file a product's runtime reads, retrieval chunks that carry the
 * same filters, and the snapshot file, the one output that names the commit
 * and graph hash (publication §6, ADR 0021); --no-snapshot leaves it out, so
 * that what is written is the same bytes at any commit. Refuses outright when the
 * graph does not validate. Review pins are read as written: a real pin is a
 * literal hash, and the fixtures' `@current` is never bound here, so an
 * unbound one reads as changed. Writes only into the --out directory, which
 * must be new or empty and outside the documents' scope. --keep-under-review
 * publishes keepable knowledge marked under review (publication §3, ADR 0027),
 * written under `under-review/` and never chunked.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Visibility, sortDiagnostics } from "@intentset/core";
import {
  HELP_FILE,
  type HtmlRendering,
  type PublicationRequest,
  SNAPSHOT_FILE,
  UNDER_REVIEW_DIR,
  publish,
  toChunks,
} from "@intentset/publisher";
import { count, formatDiagnostic, type Io } from "../output.ts";
import { outputDirProblem, outputProblem } from "../outputs.ts";
import type { Session } from "../session.ts";

export interface PublishCliOptions {
  visibility?: string;
  /** Every --audience given; values are not split on commas. */
  audience?: string[];
  product?: string;
  release?: string;
  /** Every --role given; values are not split on commas. */
  role?: string[];
  edition?: string;
  flags: string[];
  authorizedInternal: boolean;
  authorizedRestricted: boolean;
  out?: string;
  /** `page` under --html or --html=page, `fragment` under --html=fragment; absent writes no HTML. */
  html?: string;
  publishedAt?: string;
  /** Write `snapshot.json`; false under --no-snapshot. */
  snapshot: boolean;
  /** Publish keepable knowledge marked under review, under `under-review/` (publication §3); false when absent. */
  keepUnderReview?: boolean;
}

const ISO_8601 = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$/;

export function publishUsageProblem(options: PublishCliOptions): string | null {
  if (options.out === undefined || options.out === "") return "--out <dir> is required";
  if (options.html !== undefined && options.html !== "page" && options.html !== "fragment") {
    return `--html takes page or fragment, or no value for a page; not "${options.html}"`;
  }
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
    ...(options.keepUnderReview === true ? { keepUnderReview: true } : {}),
    authorizedInternal: options.authorizedInternal,
    authorizedRestricted: options.authorizedRestricted,
  } as PublicationRequest;
  const published = publish(result.graph, repo.registries, request, {
    snapshot: { commit: snapshot.commit, graphHash: snapshot.graphHash },
    publishedAt: options.publishedAt ?? new Date().toISOString(),
    renderHtml: (options.html ?? false) as HtmlRendering,
  });

  const outputs = new Map<string, string>();
  if (published.index.request !== null) {
    // A document kept under review is written under under-review/, never beside the current ones (publication §2).
    for (const document of [...published.documents, ...published.keptUnderReview]) {
      const base = document.path.replace(/\.md$/, "");
      outputs.set(document.path, document.markset);
      if (document.html !== undefined) outputs.set(`${base}.html`, document.html);
      if (document.htmlFragment !== undefined) outputs.set(`${base}.fragment.html`, document.htmlFragment);
    }
    outputs.set("index.json", `${JSON.stringify(published.index, null, 2)}\n`);
    outputs.set(HELP_FILE, `${JSON.stringify(published.help, null, 2)}\n`);
    const chunks = toChunks(published.documents);
    outputs.set("chunks.jsonl", chunks.map((chunk) => `${JSON.stringify(chunk)}\n`).join(""));
    if (options.snapshot) outputs.set(SNAPSHOT_FILE, `${JSON.stringify(published.snapshot, null, 2)}\n`);
  }
  for (const name of outputs.keys()) {
    const problem = outputProblem(repo, join(dir, name));
    if (problem !== null) return fail(`--out ${options.out}: ${name} ${problem}; nothing was written.`);
  }
  if (outputs.size > 0) mkdirSync(dir, { recursive: true });
  if (published.keptUnderReview.length > 0) mkdirSync(join(dir, UNDER_REVIEW_DIR), { recursive: true });
  for (const [name, text] of outputs) writeFileSync(join(dir, name), text, { flag: "wx" });

  for (const d of sortDiagnostics(published.diagnostics)) io.stdout(formatDiagnostic(d));
  const index = published.index;
  const lines: string[] = [];
  if (index.request === null) {
    lines.push("The request was refused, so nothing was projected and nothing was written.");
    const hint = commaHint(options);
    if (hint !== null) io.stderr(`intentset publish: ${hint}\n`);
  } else {
    const r = index.request;
    lines.push(
      `Published ${count(index.published.length, "document")} for a ${r.visibility} projection: ${entitlement(r)}, edition ${r.edition}, flags ${r.flags.length === 0 ? "none" : r.flags.join(", ")}`,
      ...index.published.map((id) => `  ${id}`),
    );
    if (index.keptUnderReview.length > 0) {
      lines.push(
        `Kept under review (${index.keptUnderReview.length}), under ${UNDER_REVIEW_DIR}/: ${index.keptUnderReview.join(", ")}`,
      );
    }
    const held = published.help?.withheldForReview ?? [];
    if (held.length > 0) lines.push(`Rule tips held for review (${held.length}): ${held.join(", ")}`);
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

/** "audience teacher, PRD-X r1, role teacher", with each list bracketed when it holds more than one value. */
export function entitlement(request: {
  audience: readonly string[];
  product: string;
  release: string;
  role: readonly string[];
}): string {
  const named = (one: string, many: string, values: readonly string[]) =>
    values.length === 1 ? `${one} ${values[0]}` : `${many} [${values.join(", ")}]`;
  return `${named("audience", "audiences", request.audience)}, ${request.product} ${request.release}, ${named("role", "roles", request.role)}`;
}

/** For a refused request: a --role or --audience value holding a comma was one value, and here is how to give several. */
export function commaHint(options: { audience?: readonly string[]; role?: readonly string[] }): string | null {
  for (const name of ["role", "audience"] as const) {
    if ((options[name] ?? []).some((value) => value.includes(","))) {
      return `repeat --${name} for each ${name}; values are not split on commas`;
    }
  }
  return null;
}
