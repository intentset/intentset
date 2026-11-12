/**
 * `intentset list` (spec/list.md, ADR 0016): the records that match a selector, from the repository's tree or from
 * an export, as a table, as the `intentset/list/0.1` result, or as IDs. The options compile to the selector `select`
 * in core reads, or `--where` gives it whole. Never writes. Exit 0 whenever it answered, a failed validation included
 * (the result says so); 1 with --check when a record matched or is undetermined; 2 for an invocation error.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COUNT_FIELDS,
  type CountField,
  exportListMeta,
  type ListOutput,
  listOutput,
  readExport,
  readSelector,
  type Selector,
  type SelectorProblem,
  select,
} from "@intentset/core";
import { count, type Io, json, snapshotLine } from "../output.ts";
import type { Session } from "../session.ts";
import { validationSummary } from "./shared.ts";

export const LIST_FORMATS = ["table", "json", "ids"] as const;
export type ListFormat = (typeof LIST_FORMATS)[number];

/** Each field option and the selector field it fills. */
const FIELD_OPTIONS: Record<string, string> = {
  id: "ids",
  type: "types",
  status: "statuses",
  delivery: "deliveries",
  owner: "owners",
  audience: "audiences",
  visibility: "visibilities",
  under: "under",
  "has-extension": "hasExtension",
  describing: "describing",
  claims: "claims",
};

/** Each availability option and the dimension it fills. */
const AVAILABILITY_OPTIONS: Record<string, string> = {
  product: "products",
  release: "releases",
  "not-release": "notReleases",
  role: "roles",
  edition: "editions",
  flag: "flags",
};

/** Every option that adds to the selector, `--has` included. */
export const SELECTOR_OPTIONS = [...Object.keys(FIELD_OPTIONS), ...Object.keys(AVAILABILITY_OPTIONS), "has"];

export interface ListOptions {
  /** The selector options as given, in order, each repetition kept. */
  given: Array<{ name: string; value: string }>;
  where?: string;
  from?: string;
  countBy?: string;
  format?: string;
  json: boolean;
  check: boolean;
  includeRestricted: boolean;
}

const HAS_SHAPE =
  "write it as [some:|none:|all:]<out|in>:<kind>[=<status>,...], such as out:governedBy=draft or none:in:verifies";

/**
 * The checks that need no repository, so a typo costs nothing: the format, the count field, and the selector,
 * compiled from the options or read from --where. Returns the selector and format, or a message.
 */
export function listUsageProblem(
  options: ListOptions,
  io: Io,
): { problem: string } | { selector: Selector; format: ListFormat; countBy: CountField | null } {
  const format = options.format ?? (options.json ? "json" : "table");
  if (!(LIST_FORMATS as readonly string[]).includes(format)) {
    return { problem: `--format ${format}: the formats are ${LIST_FORMATS.join(", ")}` };
  }
  if (options.json && format !== "json") {
    return { problem: `--json is --format json; it does not combine with --format ${format}` };
  }
  if (options.countBy !== undefined && !(COUNT_FIELDS as readonly string[]).includes(options.countBy)) {
    return { problem: `--count-by ${options.countBy}: the fields are ${COUNT_FIELDS.join(", ")}` };
  }
  if (options.from !== undefined && options.includeRestricted) {
    return { problem: "--include-restricted reads the tree; an export withheld what it withheld when it was written" };
  }

  let value: unknown;
  let where: ((problem: SelectorProblem) => string) | undefined;
  if (options.where !== undefined) {
    if (options.given.length > 0) {
      const first = options.given[0].name;
      return { problem: `--where gives the whole selector; it does not combine with --${first}` };
    }
    const file = options.where;
    try {
      value = JSON.parse(readFileSync(resolve(io.cwd, file), "utf8"));
    } catch (error) {
      return { problem: `--where ${file}: ${(error as Error).message}` };
    }
    where = (p) => `--where ${file}: ${p.pointer === "" ? "the selector" : p.pointer}: ${p.message}`;
  } else {
    const compiled = compile(options.given);
    if ("problem" in compiled) return compiled;
    value = compiled.selector;
    where = (p) => `${optionFor(p.pointer)}: ${p.message}`;
  }
  const read = readSelector(value);
  if (!read.ok) return { problem: read.problems.map(where).join("\n  ") };
  return {
    selector: read.selector,
    format: format as ListFormat,
    countBy: (options.countBy ?? null) as CountField | null,
  };
}

/** The options as a selector: a value may be a comma-separated list (one path for --claims), and repeats add values. */
function compile(given: ListOptions["given"]): { selector: Record<string, unknown> } | { problem: string } {
  const selector: Record<string, unknown> = {};
  const availability: Record<string, string[]> = {};
  const links: unknown[] = [];
  const add = (target: Record<string, unknown>, key: string, values: string[]) => {
    target[key] = [...((target[key] as string[] | undefined) ?? []), ...values];
  };
  for (const { name, value } of given) {
    const values = name === "claims" ? [value] : value.split(",").map((part) => part.trim());
    if (name === "has") {
      const link = parseHas(value);
      if (link === null) return { problem: `--has ${value}: ${HAS_SHAPE}` };
      links.push(link);
    } else if (Object.hasOwn(AVAILABILITY_OPTIONS, name)) {
      add(availability, AVAILABILITY_OPTIONS[name], values);
    } else {
      add(selector, FIELD_OPTIONS[name], values);
    }
  }
  if (Object.keys(availability).length > 0) selector.availability = availability;
  if (links.length > 0) selector.links = links;
  return { selector };
}

/** `[quantifier:]direction:kind[=status,...]`; the parts are checked by readSelector, the shape here. */
function parseHas(value: string): Record<string, unknown> | null {
  const equals = value.indexOf("=");
  const head = equals === -1 ? value : value.slice(0, equals);
  const parts = head.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => part === "")) return null;
  const [quantifier, direction, kind] = parts.length === 3 ? parts : ["some", ...parts];
  const link: Record<string, unknown> = { direction, kind, quantifier };
  if (equals !== -1)
    link.match = {
      statuses: value
        .slice(equals + 1)
        .split(",")
        .map((part) => part.trim()),
    };
  return link;
}

/** The option a compiled selector's pointer came from, for a message in the command line's words. */
function optionFor(pointer: string): string {
  const [, field, second] = pointer.split("/");
  if (field === "links") return "--has";
  if (field === "availability") {
    return `--${Object.keys(AVAILABILITY_OPTIONS).find((name) => AVAILABILITY_OPTIONS[name] === second) ?? "availability"}`;
  }
  return `--${Object.keys(FIELD_OPTIONS).find((name) => FIELD_OPTIONS[name] === field) ?? field}`;
}

/** The list from the repository's tree, over the session's validation. */
export function listCommand(
  session: Session,
  checked: { selector: Selector; format: ListFormat; countBy: CountField | null },
  options: ListOptions,
  io: Io,
): number {
  const { repo, result, snapshot } = session;
  const selection = select(result.graph, checked.selector, {
    includeRestricted: options.includeRestricted,
    registries: repo.registries,
  });
  const v = validationSummary(session, session.level);
  const output = listOutput(
    selection,
    {
      source: "tree",
      snapshot: {
        repository: repo.config.repository,
        commit: snapshot.commit,
        ...(snapshot.commitUnavailable === undefined ? {} : { commitUnavailable: snapshot.commitUnavailable }),
        uncommitted: snapshot.uncommitted === true,
        graphHash: snapshot.graphHash,
      },
      validation: { level: session.level, status: v.status, errors: v.errors, warnings: v.warnings },
    },
    checked.countBy,
  );
  return print(output, checked.format, options, io, "the repository's tree");
}

/** The list from an export, read as a consumer reads one (spec/export.md §5), with no repository I/O. */
export function listFromExportCommand(
  checked: { selector: Selector; format: ListFormat; countBy: CountField | null },
  options: ListOptions & { from: string },
  io: Io,
): number {
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(resolve(io.cwd, options.from));
  } catch (error) {
    io.stderr(`intentset list: --from ${options.from}: ${(error as Error).message}\n`);
    return 2;
  }
  // The file is one the caller named, so its size is not a reason to refuse it.
  const read = readExport(bytes, { maxBytes: Math.max(bytes.length, 1) });
  if (!read.ok) {
    const problems = read.problems.slice(0, 5).map((p) => `  ${p.pointer || "/"} ${p.message}`);
    io.stderr(`intentset list: --from ${options.from} is not an export this reader accepts (${read.category}):\n`);
    io.stderr(`${problems.join("\n")}\n`);
    return 2;
  }
  const output = listOutput(
    select(read.envelope, checked.selector),
    { source: "export", ...exportListMeta(read.envelope) },
    checked.countBy,
  );
  return print(output, checked.format, options, io, `the export ${options.from}`);
}

function print(output: ListOutput, format: ListFormat, options: ListOptions, io: Io, source: string): number {
  if (format === "json") io.stdout(json(output));
  else if (format === "ids") {
    io.stdout(output.rows.map((row) => `${row.id}\n`).join(""));
    for (const line of cautions(output)) io.stderr(`intentset list: ${line}\n`);
  } else io.stdout(renderTable(output, source));
  const flagged = output.counts.matched + output.counts.undetermined;
  return options.check && flagged > 0 ? 1 : 0;
}

/** What a reader of bare IDs should know, said on stderr so it never lands in a captured list. */
function cautions(output: ListOutput): string[] {
  const lines: string[] = [];
  const { counts, validation } = output;
  if (counts.undetermined > 0) {
    lines.push(
      `${count(counts.undetermined, "record")} undetermined, because the answer depends on a link to a withheld artifact: ${output.undetermined.join(", ")}`,
    );
  }
  if (validation.status === "fail") {
    lines.push(
      `validation failed at ${validation.level} with ${count(validation.errors, "error")}, so the graph may be incomplete; run \`intentset validate\`.`,
    );
  }
  return [...lines, ...output.notes];
}

function renderTable(output: ListOutput, source: string): string {
  const { counts, validation, snapshot } = output;
  const lines = [
    snapshotLine({
      commit: snapshot.commit,
      ...(snapshot.commitUnavailable === undefined ? {} : { commitUnavailable: snapshot.commitUnavailable }),
      uncommitted: snapshot.uncommitted,
      graphHash: snapshot.graphHash,
    }),
    `Source: ${source}${snapshot.generatedAt === undefined ? "" : `, generated ${snapshot.generatedAt}`}`,
    `Validation: ${validation.status} at ${validation.level}, ${count(validation.errors, "error")}, ${count(validation.warnings, "warning")}` +
      (validation.status === "fail" ? ". The graph may be incomplete; run `intentset validate`." : ""),
    `Selector: ${describeSelector(output.selector)}`,
    `Considered ${counts.considered} (${counts.withheld} withheld), matched ${counts.matched}, undetermined ${counts.undetermined}`,
    "",
  ];
  if (output.countBy !== null) {
    const groups = output.countBy.groups.map((group) => [group.value ?? "(none)", String(group.count)]);
    lines.push(...columns([[output.countBy.field, "count"], ...groups], [false, true]));
    if (output.countBy.multiValued) {
      lines.push(
        "",
        `A record counts once under each ${output.countBy.field} it names, so the counts can sum to more than ${counts.matched}.`,
      );
    }
  } else if (output.rows.length === 0) {
    lines.push("No record matches.");
  } else {
    const rows = output.rows.map((row) => [row.id, row.type, row.status, row.owner, row.title]);
    lines.push(...columns([["ID", "type", "status", "owner", "title"], ...rows], []));
  }
  if (output.undetermined.length > 0) {
    lines.push(
      "",
      `Undetermined, because the answer depends on a link to a withheld artifact (${output.undetermined.length}):`,
      ...output.undetermined.map((id) => `  ${id}`),
    );
  }
  if (output.notes.length > 0) lines.push("", ...output.notes.map((note) => `Note: ${note}`));
  return `${lines.join("\n")}\n`;
}

/** Columns padded to their widest cell, the last left ragged; `right` aligns a column to the right. */
function columns(table: string[][], right: boolean[]): string[] {
  const widths = table[0].map((_, i) => Math.max(...table.map((row) => row[i].length)));
  return table.map((row) =>
    row
      .map((cell, i) => {
        if (i === row.length - 1 && !right[i]) return cell;
        return right[i] ? cell.padStart(widths[i]) : cell.padEnd(widths[i]);
      })
      .join("  "),
  );
}

/** The normalized selector in a line: fields joined with "and", values with "or". */
export function describeSelector(selector: Selector): string {
  const parts: string[] = [];
  const values = (list: readonly string[]) => list.join(" or ");
  for (const [field, label] of [
    ["ids", "id"],
    ["types", "type"],
    ["statuses", "status"],
    ["deliveries", "delivery"],
    ["owners", "owner"],
    ["audiences", "audience"],
    ["visibilities", "visibility"],
    ["under", "under"],
    ["hasExtension", "extension"],
  ] as const) {
    const list = selector[field];
    if (list !== undefined) parts.push(`${label} ${values(list)}`);
  }
  for (const [name, dimension] of Object.entries(AVAILABILITY_OPTIONS)) {
    const list = selector.availability?.[dimension as keyof NonNullable<Selector["availability"]>];
    if (list !== undefined) parts.push(`${name.replace("-", " ")} ${values(list)}`);
  }
  for (const link of selector.links ?? []) {
    const match = link.match === undefined ? "" : ` matching ${describeSelector(link.match)}`;
    parts.push(`${link.quantifier} ${link.direction} ${link.kind}${match}`);
  }
  if (selector.describing !== undefined) parts.push(`describing ${values(selector.describing)}`);
  if (selector.claims !== undefined) parts.push(`claiming ${values(selector.claims)}`);
  return parts.length === 0 ? "every record" : parts.join(", and ");
}
