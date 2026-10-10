/**
 * The help runtime against the file the publisher writes: the two agree on
 * the shape, a bad file is refused whole, and binding puts each tip on the
 * control that names its behavior and reports what has no tip yet.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { graphHash, plainCarrier, readRegistries, validate } from "@intentset/core";
import { bindReviewPins, publish } from "@intentset/publisher";
import {
  BEHAVIOR_ATTRIBUTE,
  HELP_PROFILE,
  type Help,
  KNOWLEDGE_ATTRIBUTE,
  type TipElement,
  bindTips,
  helpForPage,
  readHelp,
  tipFor,
} from "../src/index.ts";

const example = resolve(import.meta.dirname, "..", "..", "..", "examples", "scheduling");
const TIP = "Pick a published assessment, a class you manage and a future release time.";
const RULE_TIP = "The release time must be in the future.";

/** The example with its knowledge approved, reviewed against current pins, and carrying two tips. */
function publishExample() {
  const inputs = readdirSync(example)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
      let source = readFileSync(join(example, name), "utf8");
      if (name === "KB-ASMT-SCHEDULE.md") {
        source = source.replace(
          "  status: draft\n",
          "  status: approved\n  reviewedBy: team-assessment\n  reviewedAt: '2026-09-30'\n",
        );
        source = source.replace(
          "    flags: []\n---",
          `    flags: []\n  tips:\n    BEH-ASMT-SCHEDULE: ${TIP}\n    RULE-ASMT-FUTURE: ${RULE_TIP}\n  extensions:\n    intentset.org/review:\n      sources:\n        BEH-ASMT-SCHEDULE: '@current'\n        RULE-ASMT-AUTH: '@current'\n        RULE-ASMT-FUTURE: '@current'\n---`,
        );
      }
      return plainCarrier(name, source);
    });
  const registries = readRegistries(
    readFileSync(join(example, "registries.yaml"), "utf8"),
    "registries.yaml",
  ).registries;
  const result = validate(inputs, registries);
  assert.deepEqual(
    result.diagnostics.filter((d) => d.severity === "error"),
    [],
  );
  const graph = bindReviewPins(result.graph);
  return publish(
    graph,
    registries,
    {
      visibility: "customer",
      audience: "teacher",
      product: "PRD-LANTERN",
      release: "pilot-1",
      role: "teacher",
      edition: "standard",
      flags: [],
    },
    { snapshot: { commit: null, graphHash: graphHash(graph) }, publishedAt: "2026-01-01T00:00:00Z" },
  );
}

function helpFromPublisher(): Help {
  const published = publishExample();
  assert.deepEqual(published.index.published, ["KB-ASMT-SCHEDULE"]);
  const read = readHelp(`${JSON.stringify(published.help, null, 2)}\n`);
  assert.deepEqual(read.problems, []);
  assert.ok(read.ok);
  return read.help;
}

test("BEH-HELP-TIPS: the file the publisher writes reads back, as text and as bytes, and carries the tips", () => {
  const help = helpFromPublisher();
  assert.equal(help.profile, HELP_PROFILE);
  assert.deepEqual(Object.keys(help.tips), ["BEH-ASMT-SCHEDULE", "RULE-ASMT-FUTURE"]);
  assert.deepEqual(help.knowledge, [
    { id: "KB-ASMT-SCHEDULE", title: "Prepare a scheduled student assessment", path: "KB-ASMT-SCHEDULE.md" },
  ]);
  const bytes = new TextEncoder().encode(JSON.stringify(help));
  const read = readHelp(bytes);
  assert.ok(read.ok);
  assert.deepEqual(read.help, help);
  assert.deepEqual(readHelp(JSON.parse(JSON.stringify(help))).ok, true);
});

test("tipFor and helpForPage: the tip, its article, each ID once, and what has no tip", () => {
  const help = helpFromPublisher();
  assert.deepEqual(tipFor(help, "BEH-ASMT-SCHEDULE"), {
    id: "BEH-ASMT-SCHEDULE",
    text: TIP,
    knowledge: "KB-ASMT-SCHEDULE",
    article: help.knowledge[0],
  });
  assert.equal(tipFor(help, "BEH-NOT-THERE"), null);
  assert.equal(tipFor(help, "constructor"), null, "a prototype name is not a tip");
  const page = helpForPage(help, ["RULE-ASMT-FUTURE", "BEH-ASMT-SCHEDULE", "BEH-ASMT-SCHEDULE", "CAP-ASMT-ASSIGN"]);
  assert.deepEqual(
    page.tips.map((tip) => tip.id),
    ["RULE-ASMT-FUTURE", "BEH-ASMT-SCHEDULE"],
  );
  assert.deepEqual(page.knowledge, help.knowledge);
  assert.deepEqual(page.missing, ["CAP-ASMT-ASSIGN"]);
});

test("BEH-HELP-TIPS: a file with any problem is refused whole, and every problem is named", () => {
  const help = helpFromPublisher();
  const broken = (edit: (value: Record<string, unknown>) => void) => {
    const value = JSON.parse(JSON.stringify(help)) as Record<string, unknown>;
    edit(value);
    return readHelp(value);
  };
  assert.deepEqual(readHelp("{").ok, false);
  assert.deepEqual(readHelp("[]").problems, ["the help file is not a JSON object"]);
  const profile = broken((v) => {
    v.profile = "intentset/publication/0.1";
  });
  assert.deepEqual(profile.problems, ['profile is "intentset/publication/0.1", not intentset/help/0.1']);
  const orphan = broken((v) => {
    (v.tips as Record<string, unknown>)["BEH-ASMT-SCHEDULE"] = { text: TIP, knowledge: "KB-ELSEWHERE" };
  });
  assert.deepEqual(orphan.problems, [
    "tips.BEH-ASMT-SCHEDULE names knowledge KB-ELSEWHERE, which the file does not list",
  ]);
  const several = broken((v) => {
    v.derived = false;
    v.audience = 3;
    (v.tips as Record<string, unknown>).lowercase = { text: "", knowledge: "KB-ASMT-SCHEDULE" };
  });
  assert.equal(several.ok, false);
  assert.deepEqual(several.problems, [
    "derived is not true",
    "audience must be a string",
    'tips key "lowercase" is not an ID',
    "tips.lowercase has an empty text",
  ]);
  const unsorted = broken((v) => {
    (v.knowledge as unknown[]).unshift({ id: "KB-ZZZ-LAST", title: "Z", path: "KB-ZZZ-LAST.md" });
  });
  assert.deepEqual(unsorted.problems, ["knowledge is not sorted by id at KB-ASMT-SCHEDULE"]);
});

/** A test double for the part of a DOM element the binder touches. */
class Fake implements TipElement {
  readonly attributes = new Map<string, string>();
  constructor(attributes: Record<string, string>) {
    for (const [name, value] of Object.entries(attributes)) this.attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }
}

function root(elements: Fake[], attribute = BEHAVIOR_ATTRIBUTE) {
  return {
    selectors: [] as string[],
    querySelectorAll(selectors: string) {
      this.selectors.push(selectors);
      return elements.filter((element) => element.hasAttribute(attribute));
    },
  };
}

test("BEH-HELP-TIPS: bindTips puts each tip on its control, keeps an existing title, and reports the IDs with no tip", () => {
  const help = helpFromPublisher();
  const schedule = new Fake({ [BEHAVIOR_ATTRIBUTE]: "BEH-ASMT-SCHEDULE" });
  const titled = new Fake({ [BEHAVIOR_ATTRIBUTE]: "BEH-ASMT-SCHEDULE", title: "Schedule" });
  const rule = new Fake({ [BEHAVIOR_ATTRIBUTE]: "RULE-ASMT-FUTURE" });
  const untipped = new Fake({ [BEHAVIOR_ATTRIBUTE]: "CAP-ASMT-ASSIGN" });
  const empty = new Fake({ [BEHAVIOR_ATTRIBUTE]: "" });
  const plain = new Fake({ id: "nothing" });
  const host = root([schedule, titled, rule, untipped, empty, plain]);
  const binding = bindTips(host, help);
  assert.deepEqual(host.selectors, ["[data-behavior]"]);
  assert.deepEqual(binding, { bound: ["BEH-ASMT-SCHEDULE", "RULE-ASMT-FUTURE"], missing: ["CAP-ASMT-ASSIGN"] });
  assert.equal(schedule.getAttribute("title"), TIP);
  assert.equal(schedule.getAttribute(KNOWLEDGE_ATTRIBUTE), "KB-ASMT-SCHEDULE");
  assert.equal(titled.getAttribute("title"), "Schedule", "an authored title is not overwritten");
  assert.equal(titled.getAttribute(KNOWLEDGE_ATTRIBUTE), "KB-ASMT-SCHEDULE");
  assert.equal(rule.getAttribute("title"), RULE_TIP);
  assert.equal(untipped.hasAttribute("title"), false);
  assert.equal(plain.attributes.size, 1);
  // Binding again changes nothing.
  assert.deepEqual(bindTips(host, help), binding);
  assert.equal(schedule.getAttribute("title"), TIP);
});

test("bindTips takes another attribute and another renderer", () => {
  const help = helpFromPublisher();
  const control = new Fake({ "data-feature": "RULE-ASMT-FUTURE" });
  const rendered: string[] = [];
  const binding = bindTips(root([control], "data-feature"), help, {
    attribute: "data-feature",
    render: (element, tip) => {
      rendered.push(`${tip.id}: ${tip.text} (${tip.article?.title})`);
      element.setAttribute("aria-description", tip.text);
    },
  });
  assert.deepEqual(binding, { bound: ["RULE-ASMT-FUTURE"], missing: [] });
  assert.deepEqual(rendered, [
    "RULE-ASMT-FUTURE: The release time must be in the future. (Prepare a scheduled student assessment)",
  ]);
  assert.equal(control.getAttribute("aria-description"), RULE_TIP);
  assert.equal(control.hasAttribute("title"), false);
});
