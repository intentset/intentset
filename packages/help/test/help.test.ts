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
  type Reader,
  TIP_ATTRIBUTE,
  type TipObserver,
  UNDER_REVIEW_ATTRIBUTE,
  type WatchElement,
  articles,
  bindTips,
  helpForPage,
  readHelp,
  reviewStateFor,
  servedTo,
  tipFor,
  watchTips,
} from "../src/index.ts";

const example = resolve(import.meta.dirname, "..", "..", "..", "examples", "scheduling");
const TIP = "Pick a published assessment, a class you manage and a future release time.";
const RULE_TIP = "The release time must be in the future.";

/**
 * The example as it is: its knowledge is approved, reviewed against its sources as they are, and carries the two tips
 * above (since 2026-10-11; until then this test wrote them into the record itself, and no reader of the example saw one).
 */
function publishExample() {
  const inputs = readdirSync(example)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => plainCarrier(name, readFileSync(join(example, name), "utf8")));
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

test("BEH-HELP-READER: a help file carries no snapshot, and a file with one is refused as a member the table does not give", () => {
  const written = JSON.parse(JSON.stringify(publishExample().help)) as Record<string, unknown>;
  assert.equal(Object.hasOwn(written, "snapshot"), false);
  assert.ok(readHelp(written).ok);
  assert.deepEqual(readHelp({ ...written, snapshot: { commit: null, graphHash: "a".repeat(64) } }).problems, [
    'the file has a member "snapshot" the help file does not define',
  ]);
});

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
    v.profile = "intentset/publication/0.3";
  });
  assert.deepEqual(profile.problems, ['profile is "intentset/publication/0.3", not intentset/help/0.3']);
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
    "audience must be a non-empty list of strings, sorted, without repeats",
    'tips key "lowercase" is not an ID',
    "tips.lowercase has an empty text",
  ]);
  const unsorted = broken((v) => {
    (v.knowledge as unknown[]).unshift({ id: "KB-ZZZ-LAST", title: "Z", path: "KB-ZZZ-LAST.md" });
  });
  assert.deepEqual(unsorted.problems, ["knowledge is not sorted by id at KB-ASMT-SCHEDULE"]);
});

test("BEH-HELP-READER: readHelp reads audience, roles and flags as sorted lists and refuses any other form", () => {
  const help = helpFromPublisher();
  assert.deepEqual(help.audience, ["teacher"]);
  assert.deepEqual(help.availability.role, ["teacher"]);
  assert.deepEqual(help.availability.flags, []);
  const read = (edit: (value: Record<string, unknown> & { availability: Record<string, unknown> }) => void) => {
    const value = JSON.parse(JSON.stringify(help));
    edit(value);
    return readHelp(value).problems;
  };
  const AUDIENCE = "audience must be a non-empty list of strings, sorted, without repeats";
  const AVAILABILITY =
    "availability must carry product, release and edition, a non-empty sorted list of roles without repeats, and a sorted list of flags without repeats";
  assert.deepEqual(
    read((v) => {
      v.audience = ["product", "teacher"];
      v.availability.role = ["administrator", "teacher"];
      v.availability.flags = ["alpha", "beta"];
    }),
    [],
  );
  assert.deepEqual(
    read((v) => {
      v.audience = "teacher";
    }),
    [AUDIENCE],
  );
  assert.deepEqual(
    read((v) => {
      v.audience = [];
    }),
    [AUDIENCE],
  );
  assert.deepEqual(
    read((v) => {
      v.audience = ["teacher", "product"];
    }),
    [AUDIENCE],
  );
  assert.deepEqual(
    read((v) => {
      v.audience = ["teacher", "teacher"];
    }),
    [AUDIENCE],
  );
  assert.deepEqual(
    read((v) => {
      v.audience = ["teacher", 3];
    }),
    [AUDIENCE],
  );
  for (const role of ["teacher", [], ["teacher", "administrator"], ["teacher", "teacher"], [null]]) {
    assert.deepEqual(
      read((v) => {
        v.availability.role = role;
      }),
      [AVAILABILITY],
      JSON.stringify(role),
    );
  }
  for (const flags of [["beta", "alpha"], ["beta", "beta"], "beta", [7]]) {
    assert.deepEqual(
      read((v) => {
        v.availability.flags = flags;
      }),
      [AVAILABILITY],
      JSON.stringify(flags),
    );
  }
});

test("BEH-HELP-READER: readHelp refuses a member the table does not give, at the top, in availability, a knowledge entry or a tip", () => {
  const help = helpFromPublisher();
  const read = (edit: (value: Record<string, unknown> & Help) => void) => {
    const value = JSON.parse(JSON.stringify(help));
    edit(value);
    return readHelp(value).problems;
  };
  assert.deepEqual(
    read((v) => {
      (v as Record<string, unknown>).surfaces = {};
    }),
    ['the file has a member "surfaces" the help file does not define'],
  );
  assert.deepEqual(
    read((v) => {
      (v.availability as Record<string, unknown>).region = "eu";
    }),
    ['availability has a member "region" the help file does not define'],
  );
  assert.deepEqual(
    read((v) => {
      (v.knowledge[0] as unknown as Record<string, unknown>).lead = true;
    }),
    ['knowledge[0] has a member "lead" the help file does not define'],
  );
  assert.deepEqual(
    read((v) => {
      (v.tips["BEH-ASMT-SCHEDULE"] as unknown as Record<string, unknown>).since = "2026-01-01";
    }),
    ['tips.BEH-ASMT-SCHEDULE has a member "since" the help file does not define'],
  );
  assert.deepEqual(
    read((v) => {
      delete (v as Partial<Help>).tips;
    }),
    ["the file has no tips", "tips must be an object keyed by ID"],
  );
});

test("BEH-HELP-READER: servedTo holds only for a reader cleared for the projection who holds everything the file names", () => {
  const help: Pick<Help, "projection" | "audience" | "availability"> = {
    projection: "customer",
    audience: ["product", "teacher"],
    availability: {
      product: "PRD-LANTERN",
      release: "pilot-1",
      role: ["administrator", "teacher"],
      edition: "standard",
      flags: ["beta"],
    },
  };
  const reader: Reader = {
    visibilities: ["public", "customer"],
    audiences: ["product", "teacher"],
    roles: ["administrator", "teacher"],
    product: "PRD-LANTERN",
    release: "pilot-1",
    edition: "standard",
    flags: ["beta"],
  };
  assert.equal(servedTo(help, reader), true);
  assert.equal(
    servedTo(help, {
      ...reader,
      roles: ["teacher", "student", "administrator"],
      audiences: ["teacher", "product", "x"],
    }),
    true,
    "a reader who holds more than the file names",
  );
  assert.equal(servedTo(help, { ...reader, roles: ["teacher"] }), false, "one role missing");
  assert.equal(servedTo(help, { ...reader, audiences: ["teacher"] }), false, "one audience missing");
  assert.equal(servedTo(help, { ...reader, flags: [] }), false, "one flag missing");
  assert.equal(
    servedTo({ ...help, audience: [] }, { ...reader, audiences: [], roles: [] }),
    false,
    "an empty audience list is malformed and serves no one",
  );
  assert.equal(
    servedTo({ ...help, availability: { ...help.availability, role: [] } }, { ...reader, audiences: [], roles: [] }),
    false,
    "an empty role list is malformed and serves no one",
  );
  assert.equal(
    servedTo({ ...help, availability: { ...help.availability, flags: [] } }, { ...reader, flags: [] }),
    true,
    "an empty flag list names no flag to hold",
  );
  assert.equal(servedTo(help, { ...reader, product: "PRD-OTHER" }), false, "another product");
  assert.equal(servedTo(help, { ...reader, release: "pilot-2" }), false, "another release");
  assert.equal(servedTo(help, { ...reader, edition: "district" }), false, "another edition");
  assert.equal(servedTo(help, { ...reader, visibilities: ["public"] }), false, "not cleared for the projection");
  assert.equal(
    servedTo({ ...help, projection: "internal" }, reader),
    false,
    "an internal file whose other values match a customer",
  );
});

/** A test double for the part of a DOM element the binder touches. */
class Fake implements WatchElement {
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
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  snapshot(): Record<string, string> {
    return Object.fromEntries([...this.attributes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
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

test("BEH-HELP-TIPS: bindTips puts each tip on its control as data, sets no title, and reports the IDs with no tip", () => {
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
  assert.deepEqual(binding, {
    bound: ["BEH-ASMT-SCHEDULE", "RULE-ASMT-FUTURE"],
    missing: ["CAP-ASMT-ASSIGN"],
    pendingReview: [],
  });
  assert.deepEqual(schedule.snapshot(), {
    [BEHAVIOR_ATTRIBUTE]: "BEH-ASMT-SCHEDULE",
    [KNOWLEDGE_ATTRIBUTE]: "KB-ASMT-SCHEDULE",
    [TIP_ATTRIBUTE]: TIP,
  });
  assert.equal(schedule.hasAttribute("title"), false, "the default render sets nothing a browser displays");
  assert.equal(titled.getAttribute("title"), "Schedule", "an authored title is left alone");
  assert.equal(titled.getAttribute(TIP_ATTRIBUTE), TIP);
  assert.equal(rule.getAttribute(TIP_ATTRIBUTE), RULE_TIP);
  assert.equal(untipped.attributes.size, 1);
  assert.equal(plain.attributes.size, 1);
  // Binding again changes nothing.
  assert.deepEqual(bindTips(host, help), binding);
  assert.equal(schedule.attributes.size, 3);
});

/** A test double for a MutationObserver: the test fires it by hand, as the DOM would on a change. */
class FakeObserver implements TipObserver {
  static last: FakeObserver | null = null;
  observed: { target: unknown; options: unknown } | null = null;
  disconnected = false;
  readonly callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
    FakeObserver.last = this;
  }
  observe(target: unknown, options: unknown): void {
    this.observed = { target, options };
  }
  disconnect(): void {
    this.disconnected = true;
  }
  fire(): void {
    if (!this.disconnected) this.callback();
  }
}

/** A frame scheduler the test advances by hand. */
function frames() {
  const queue = new Map<number, () => void>();
  let next = 1;
  return {
    queue,
    cancelled: [] as number[],
    request(callback: () => void): number {
      queue.set(next, callback);
      return next++;
    },
    cancel(handle: number) {
      this.cancelled.push(handle);
      queue.delete(handle);
    },
    run() {
      const due = [...queue.values()];
      queue.clear();
      for (const callback of due) callback();
    },
  };
}

function watchHost(elements: Fake[]) {
  const host = root(elements);
  const frame = frames();
  const options = {
    MutationObserver: FakeObserver,
    requestFrame: (callback: () => void) => frame.request(callback),
    cancelFrame: (handle: number) => frame.cancel(handle),
  };
  return { host, frame, options };
}

test("BEH-HELP-WATCH: watchTips binds at once, observes only its root, and rebinds once per frame however many changes", () => {
  const help = helpFromPublisher();
  const schedule = new Fake({ [BEHAVIOR_ATTRIBUTE]: "BEH-ASMT-SCHEDULE" });
  const elements = [schedule];
  const { host, frame, options } = watchHost(elements);
  const watch = watchTips(host, help, options);
  const observer = FakeObserver.last as FakeObserver;
  assert.deepEqual(observer.observed, {
    target: host,
    options: { subtree: true, childList: true, attributes: true, attributeFilter: [BEHAVIOR_ATTRIBUTE] },
  });
  assert.deepEqual(watch.coverage(), { bound: ["BEH-ASMT-SCHEDULE"], missing: [], pendingReview: [] });
  assert.equal(schedule.getAttribute(TIP_ATTRIBUTE), TIP);

  const rule = new Fake({ [BEHAVIOR_ATTRIBUTE]: "RULE-ASMT-FUTURE" });
  const untipped = new Fake({ [BEHAVIOR_ATTRIBUTE]: "CAP-ASMT-ASSIGN" });
  elements.push(rule, untipped);
  observer.fire();
  observer.fire();
  observer.fire();
  assert.equal(frame.queue.size, 1, "three changes, one pass scheduled");
  assert.equal(rule.hasAttribute(TIP_ATTRIBUTE), false, "nothing binds before the frame");
  frame.run();
  assert.equal(rule.getAttribute(TIP_ATTRIBUTE), RULE_TIP);
  assert.deepEqual(watch.coverage(), {
    bound: ["BEH-ASMT-SCHEDULE", "RULE-ASMT-FUTURE"],
    missing: ["CAP-ASMT-ASSIGN"],
    pendingReview: [],
  });
  assert.equal(host.selectors.length, 2, "one query to bind, one per frame");
  observer.fire();
  assert.equal(frame.queue.size, 1, "a change after the frame schedules the next one");
  watch.dispose();
});

test("BEH-HELP-WATCH: watchTips renders each element once, unrenders one that changes behavior or leaves the root", () => {
  const help = helpFromPublisher();
  const schedule = new Fake({ [BEHAVIOR_ATTRIBUTE]: "BEH-ASMT-SCHEDULE" });
  const leaving = new Fake({ [BEHAVIOR_ATTRIBUTE]: "RULE-ASMT-FUTURE" });
  const elements = [schedule, leaving];
  const { frame, host, options } = watchHost(elements);
  const log: string[] = [];
  const watch = watchTips(host, help, {
    ...options,
    render: (element, tip) => {
      log.push(`render ${tip.id}`);
      element.setAttribute("aria-description", tip.text);
    },
    unrender: (element, tip) => {
      log.push(`unrender ${tip.id}`);
      (element as Fake).removeAttribute("aria-description");
    },
  });
  const observer = FakeObserver.last as FakeObserver;
  assert.deepEqual(log, ["render BEH-ASMT-SCHEDULE", "render RULE-ASMT-FUTURE"]);
  elements.splice(1, 1);
  schedule.setAttribute(BEHAVIOR_ATTRIBUTE, "RULE-ASMT-FUTURE");
  observer.fire();
  frame.run();
  assert.deepEqual(log.slice(2), [
    "unrender BEH-ASMT-SCHEDULE",
    "unrender RULE-ASMT-FUTURE",
    "render RULE-ASMT-FUTURE",
  ]);
  assert.equal(leaving.hasAttribute("aria-description"), false);
  assert.equal(schedule.getAttribute("aria-description"), RULE_TIP);
  observer.fire();
  frame.run();
  assert.equal(log.length, 5, "a pass that finds nothing new renders nothing");
  watch.dispose();
  assert.deepEqual(log.slice(5), ["unrender RULE-ASMT-FUTURE"]);
  assert.equal(schedule.hasAttribute("aria-description"), false);
});

test("BEH-HELP-WATCH: dispose stops watching, cancels a pending pass and leaves the DOM as it found it", () => {
  const help = helpFromPublisher();
  const schedule = new Fake({ [BEHAVIOR_ATTRIBUTE]: "BEH-ASMT-SCHEDULE", title: "Schedule" });
  const rule = new Fake({ [BEHAVIOR_ATTRIBUTE]: "RULE-ASMT-FUTURE" });
  const untipped = new Fake({ [BEHAVIOR_ATTRIBUTE]: "CAP-ASMT-ASSIGN" });
  const authored = new Fake({
    [BEHAVIOR_ATTRIBUTE]: "RULE-ASMT-FUTURE",
    [TIP_ATTRIBUTE]: "an authored tip",
    [KNOWLEDGE_ATTRIBUTE]: "KB-AUTHORED",
  });
  const all = [schedule, rule, untipped, authored];
  const before = all.map((element) => element.snapshot());
  const { frame, host, options } = watchHost([...all]);
  const watch = watchTips(host, help, options);
  const observer = FakeObserver.last as FakeObserver;
  assert.notDeepEqual(schedule.snapshot(), before[0]);
  assert.equal(authored.getAttribute(TIP_ATTRIBUTE), RULE_TIP);
  observer.fire();
  const handle = [...frame.queue.keys()][0];
  watch.dispose();
  assert.equal(observer.disconnected, true);
  assert.deepEqual(frame.cancelled, [handle]);
  assert.deepEqual(
    all.map((element) => element.snapshot()),
    before,
    "the default attributes are put back as they were, values set before the watch included, and nothing else is touched",
  );
  assert.deepEqual(watch.coverage(), { bound: [], missing: [], pendingReview: [] });
  watch.dispose();
  frame.run();
  assert.deepEqual(
    all.map((element) => element.snapshot()),
    before,
  );
});

test("BEH-HELP-WATCH: a render of the product's own with no unrender is left in place, and the default attributes are not touched", () => {
  const help = helpFromPublisher();
  const schedule = new Fake({ [BEHAVIOR_ATTRIBUTE]: "BEH-ASMT-SCHEDULE", [TIP_ATTRIBUTE]: "authored" });
  const { host, options } = watchHost([schedule]);
  const watch = watchTips(host, help, {
    ...options,
    render: (element, tip) => element.setAttribute("aria-description", tip.text),
  });
  watch.dispose();
  assert.equal(schedule.getAttribute("aria-description"), TIP);
  assert.equal(schedule.getAttribute(TIP_ATTRIBUTE), "authored");
});

test("BEH-HELP-WATCH: a dispose from inside render stops the pass, and a first pass that throws undoes what it rendered", () => {
  const help = helpFromPublisher();
  const first = new Fake({ [BEHAVIOR_ATTRIBUTE]: "BEH-ASMT-SCHEDULE" });
  const second = new Fake({ [BEHAVIOR_ATTRIBUTE]: "RULE-ASMT-FUTURE" });
  const elements = [first];
  const { frame, host, options } = watchHost(elements);
  const log: string[] = [];
  let disposeNow: () => void = () => {};
  const watch = watchTips(host, help, {
    ...options,
    render: (_element, tip) => {
      log.push(`render ${tip.id}`);
      if (tip.id === "RULE-ASMT-FUTURE") disposeNow();
    },
    unrender: (_element, tip) => log.push(`unrender ${tip.id}`),
  });
  disposeNow = () => watch.dispose();
  elements.push(second, new Fake({ [BEHAVIOR_ATTRIBUTE]: "BEH-ASMT-SCHEDULE" }));
  (FakeObserver.last as FakeObserver).fire();
  frame.run();
  assert.deepEqual(log, [
    "render BEH-ASMT-SCHEDULE",
    "render RULE-ASMT-FUTURE",
    "unrender BEH-ASMT-SCHEDULE",
    "unrender RULE-ASMT-FUTURE",
  ]);

  const a = new Fake({ [BEHAVIOR_ATTRIBUTE]: "BEH-ASMT-SCHEDULE" });
  const b = new Fake({ [BEHAVIOR_ATTRIBUTE]: "RULE-ASMT-FUTURE" });
  const throwing = watchHost([a, b]);
  const rendered: string[] = [];
  assert.throws(
    () =>
      watchTips(throwing.host, help, {
        ...throwing.options,
        render: (element, tip) => {
          if (tip.id === "RULE-ASMT-FUTURE") throw new Error("render failed");
          rendered.push(tip.id);
          element.setAttribute("aria-description", tip.text);
        },
        unrender: (element, tip) => {
          rendered.push(`undone ${tip.id}`);
          (element as Fake).removeAttribute("aria-description");
        },
      }),
    /render failed/u,
  );
  assert.deepEqual(rendered, ["BEH-ASMT-SCHEDULE", "undone BEH-ASMT-SCHEDULE"]);
  assert.equal(a.hasAttribute("aria-description"), false);
  assert.equal((FakeObserver.last as FakeObserver).observed, null, "nothing is observed after a failed first pass");
});

test("BEH-HELP-WATCH: a custom requestFrame never gets the default cancelAnimationFrame", () => {
  const help = helpFromPublisher();
  const scope = globalThis as { cancelAnimationFrame?: (handle: number) => void };
  const saved = scope.cancelAnimationFrame;
  const cancelled: number[] = [];
  scope.cancelAnimationFrame = (handle) => cancelled.push(handle);
  try {
    const { frame, host } = watchHost([new Fake({ [BEHAVIOR_ATTRIBUTE]: "BEH-ASMT-SCHEDULE" })]);
    const watch = watchTips(host, help, {
      MutationObserver: FakeObserver,
      requestFrame: (callback) => frame.request(callback),
    });
    (FakeObserver.last as FakeObserver).fire();
    watch.dispose();
    assert.deepEqual(cancelled, []);
    frame.run();
    assert.deepEqual(
      watch.coverage(),
      { bound: [], missing: [], pendingReview: [] },
      "the uncancelled pass does nothing",
    );
  } finally {
    if (saved === undefined) delete scope.cancelAnimationFrame;
    else scope.cancelAnimationFrame = saved;
  }
});

test("BEH-HELP-WATCH: watchTips without a MutationObserver or a frame scheduler says which it needs, and binds nothing", () => {
  const help = helpFromPublisher();
  const schedule = new Fake({ [BEHAVIOR_ATTRIBUTE]: "BEH-ASMT-SCHEDULE" });
  const before = schedule.snapshot();
  const { host } = watchHost([schedule]);
  assert.throws(() => watchTips(host, help, { requestFrame: () => 0 }), /needs a MutationObserver/u);
  assert.deepEqual(schedule.snapshot(), before);
  assert.throws(
    () => watchTips(host, help, { MutationObserver: FakeObserver, requestFrame: undefined }),
    /needs requestAnimationFrame/u,
  );
  assert.deepEqual(schedule.snapshot(), before);
  assert.deepEqual(host.selectors, [], "the root was not even queried");
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
  assert.deepEqual(binding, { bound: ["RULE-ASMT-FUTURE"], missing: [], pendingReview: [] });
  assert.deepEqual(rendered, [
    "RULE-ASMT-FUTURE: The release time must be in the future. (Prepare a scheduled student assessment)",
  ]);
  assert.equal(control.getAttribute("aria-description"), RULE_TIP);
  assert.equal(control.hasAttribute("title"), false);
});

/** The example published with its knowledge kept under review (ADR 0027): its behavior tip marked, its rule tip held. */
function keptHelp(): Help {
  const inputs = readdirSync(example)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
      let text = readFileSync(join(example, name), "utf8");
      if (name === "KB-ASMT-SCHEDULE.md") {
        text = text
          .replace(/BEH-ASMT-SCHEDULE: '[0-9a-f]{64}'/, `BEH-ASMT-SCHEDULE: '${"0".repeat(64)}'`)
          .replace("    sources:\n", "    self: '@current'\n    gates: '@current'\n    sources:\n");
      }
      return plainCarrier(name, text);
    });
  const registries = readRegistries(
    readFileSync(join(example, "registries.yaml"), "utf8"),
    "registries.yaml",
  ).registries;
  const graph = bindReviewPins(validate(inputs, registries).graph);
  const published = publish(
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
      keepUnderReview: true,
    },
    { snapshot: { commit: null, graphHash: graphHash(graph) }, publishedAt: "2026-01-01T00:00:00Z" },
  );
  assert.deepEqual(published.index.keptUnderReview, ["KB-ASMT-SCHEDULE"]);
  const read = readHelp(`${JSON.stringify(published.help, null, 2)}\n`);
  assert.deepEqual(read.problems, []);
  assert.ok(read.ok);
  return read.help;
}

test("BEH-HELP-TIPS: a file with help under review is read, and its marks must agree", () => {
  const help = keptHelp();
  assert.deepEqual(help.withheldForReview, ["RULE-ASMT-FUTURE"]);
  assert.deepEqual(help.knowledge[0], {
    id: "KB-ASMT-SCHEDULE",
    title: "Prepare a scheduled student assessment",
    path: "under-review/KB-ASMT-SCHEDULE.md",
    underReview: true,
  });
  const read = (edit: (value: Record<string, unknown> & Help) => void) => {
    const value = JSON.parse(JSON.stringify(help));
    edit(value);
    return readHelp(value).problems;
  };
  assert.deepEqual(
    read((v) => {
      delete (v.tips["BEH-ASMT-SCHEDULE"] as Partial<Help["tips"][string]>).underReview;
    }),
    ["tips.BEH-ASMT-SCHEDULE is not under review and knowledge KB-ASMT-SCHEDULE is"],
  );
  assert.deepEqual(
    read((v) => {
      (v.knowledge[0] as unknown as Record<string, unknown>).underReview = false;
    }),
    [
      "knowledge[0].underReview is present and not true",
      "tips.BEH-ASMT-SCHEDULE is under review and knowledge KB-ASMT-SCHEDULE is not",
    ],
  );
  assert.deepEqual(
    read((v) => {
      v.knowledge[0].path = "KB-ASMT-SCHEDULE.md";
    }),
    ["knowledge[0] is under review and its path does not begin with under-review/"],
  );
  assert.deepEqual(
    read((v) => {
      v.withheldForReview = ["BEH-ASMT-SCHEDULE"];
    }),
    ["withheldForReview names BEH-ASMT-SCHEDULE, which is also a key of tips"],
  );
  assert.deepEqual(
    read((v) => {
      delete (v as Partial<Help>).withheldForReview;
    }),
    ["the file has no withheldForReview", "withheldForReview must be a list of strings, sorted, without repeats"],
  );
});

test("BEH-HELP-TIPS: help under review is left out by default and returned marked under include, never counted missing", () => {
  const help = keptHelp();
  assert.equal(reviewStateFor(help, "BEH-ASMT-SCHEDULE"), "under-review");
  assert.equal(reviewStateFor(help, "RULE-ASMT-FUTURE"), "held-back");
  assert.equal(reviewStateFor(help, "CAP-ASMT-ASSIGN"), "none");
  assert.equal(reviewStateFor(helpFromPublisher(), "BEH-ASMT-SCHEDULE"), "current");

  assert.equal(tipFor(help, "BEH-ASMT-SCHEDULE"), null);
  assert.equal(tipFor(help, "RULE-ASMT-FUTURE", { underReviewHelp: "include" }), null, "a held-back tip has no text");
  const included = tipFor(help, "BEH-ASMT-SCHEDULE", { underReviewHelp: "include" });
  assert.equal(included?.underReview, true);
  assert.equal(included?.article?.path, "under-review/KB-ASMT-SCHEDULE.md");

  assert.deepEqual(articles(help), { knowledge: [], pendingReview: ["KB-ASMT-SCHEDULE"] });
  assert.deepEqual(
    articles(help, { underReviewHelp: "include" }).knowledge.map((k) => k.id),
    ["KB-ASMT-SCHEDULE"],
  );

  const ids = ["BEH-ASMT-SCHEDULE", "RULE-ASMT-FUTURE", "CAP-ASMT-ASSIGN"];
  const page = helpForPage(help, ids);
  assert.deepEqual([page.tips, page.knowledge, page.missing], [[], [], ["CAP-ASMT-ASSIGN"]]);
  assert.deepEqual(page.pendingReview, ["BEH-ASMT-SCHEDULE", "RULE-ASMT-FUTURE"]);
  const shown = helpForPage(help, ids, { underReviewHelp: "include" });
  assert.deepEqual(
    shown.tips.map((tip) => [tip.id, tip.underReview]),
    [["BEH-ASMT-SCHEDULE", true]],
  );
  assert.deepEqual(shown.pendingReview, ["BEH-ASMT-SCHEDULE", "RULE-ASMT-FUTURE"]);
  assert.deepEqual(shown.missing, ["CAP-ASMT-ASSIGN"]);

  const schedule = new Fake({ [BEHAVIOR_ATTRIBUTE]: "BEH-ASMT-SCHEDULE" });
  const rule = new Fake({ [BEHAVIOR_ATTRIBUTE]: "RULE-ASMT-FUTURE", [TIP_ATTRIBUTE]: "authored" });
  const host = root([schedule, rule]);
  assert.deepEqual(bindTips(host, help), {
    bound: [],
    missing: [],
    pendingReview: ["BEH-ASMT-SCHEDULE", "RULE-ASMT-FUTURE"],
  });
  assert.equal(schedule.attributes.size, 1, "under exclude nothing is rendered");
  assert.equal(rule.getAttribute(TIP_ATTRIBUTE), "authored", "and nothing is removed");
  assert.deepEqual(bindTips(host, help, { underReviewHelp: "include" }), {
    bound: ["BEH-ASMT-SCHEDULE"],
    missing: [],
    pendingReview: ["BEH-ASMT-SCHEDULE", "RULE-ASMT-FUTURE"],
  });
  assert.deepEqual(schedule.snapshot(), {
    [BEHAVIOR_ATTRIBUTE]: "BEH-ASMT-SCHEDULE",
    [KNOWLEDGE_ATTRIBUTE]: "KB-ASMT-SCHEDULE",
    [TIP_ATTRIBUTE]: TIP,
    [UNDER_REVIEW_ATTRIBUTE]: "true",
  });
});

test("BEH-HELP-WATCH: a watch renders the under-review mark, restores its prior value on dispose, and copies pendingReview", () => {
  const help = keptHelp();
  const schedule = new Fake({ [BEHAVIOR_ATTRIBUTE]: "BEH-ASMT-SCHEDULE", [UNDER_REVIEW_ATTRIBUTE]: "authored" });
  const before = schedule.snapshot();
  const { host, options } = watchHost([schedule]);
  const watch = watchTips(host, help, { ...options, underReviewHelp: "include" });
  assert.equal(schedule.getAttribute(UNDER_REVIEW_ATTRIBUTE), "true");
  const coverage = watch.coverage();
  assert.deepEqual(coverage, { bound: ["BEH-ASMT-SCHEDULE"], missing: [], pendingReview: ["BEH-ASMT-SCHEDULE"] });
  coverage.pendingReview.push("X-Y");
  assert.deepEqual(watch.coverage().pendingReview, ["BEH-ASMT-SCHEDULE"], "coverage is a copy");
  watch.dispose();
  assert.deepEqual(schedule.snapshot(), before, "the page is left as the watch found it");
  assert.deepEqual(watch.coverage(), { bound: [], missing: [], pendingReview: [] });
});
