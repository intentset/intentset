import assert from "node:assert/strict";
import { test } from "node:test";
import { YAML_MAX_BYTES, parseYaml, parseYamlDetailed } from "../src/index.ts";

function ok(text: string): Record<string, unknown> {
  const result = parseYaml(text);
  assert.equal(result.error, null, JSON.stringify(result.error));
  return result.value as Record<string, unknown>;
}

function rejects(text: string, pattern: RegExp, line: number): void {
  const result = parseYaml(text);
  assert.notEqual(result.error, null, `expected ${JSON.stringify(text)} to be rejected`);
  assert.match(result.error?.message ?? "", pattern);
  assert.equal(result.error?.line, line);
}

test("the carrier subset reads into JSON-compatible values", () => {
  const value = ok(
    [
      "markset: 0",
      "# a comment line",
      "intentset:",
      "  spec: '0.1'",
      '  title: "Schedule \\"an\\" assessment"',
      "  revision: 1  # trailing comment",
      "  ratio: 0.5",
      "  done: true",
      "  nothing: null",
      "  tilde: ~",
      "  empty:",
      "  audiences: [engineering, 'product', \"teacher\"]",
      "  flags: []",
      "  layers: {}",
      "  links:",
      "    governedBy:",
      "    - RULE-A",
      "    - RULE-B",
      "  claims:",
      "  - kind: source",
      "    path: src/**",
      "  - kind: backend",
      "    path: amplify/**",
      "  nested:",
      "    - [a, [b, c]]",
      "  date: 2026-10-02",
      "  colon: a:b",
    ].join("\n"),
  );
  assert.deepEqual(value, {
    markset: 0,
    intentset: {
      spec: "0.1",
      title: 'Schedule "an" assessment',
      revision: 1,
      ratio: 0.5,
      done: true,
      nothing: null,
      tilde: null,
      empty: null,
      audiences: ["engineering", "product", "teacher"],
      flags: [],
      layers: {},
      links: { governedBy: ["RULE-A", "RULE-B"] },
      claims: [
        { kind: "source", path: "src/**" },
        { kind: "backend", path: "amplify/**" },
      ],
      nested: [["a", ["b", "c"]]],
      date: "2026-10-02",
      colon: "a:b",
    },
  });
});

test("quoting decides the type: '0.1' and \"0.1\" are strings, 0.1 and 0 are numbers", () => {
  assert.deepEqual(ok("a: '0.1'\nb: \"0.1\"\nc: 0.1\nd: 0\ne: '0'\nf: -3\ng: 1e3\nh: 'it''s'"), {
    a: "0.1",
    b: "0.1",
    c: 0.1,
    d: 0,
    e: "0",
    f: -3,
    g: 1000,
    h: "it's",
  });
});

test("an empty or comment-only text is an empty mapping", () => {
  assert.deepEqual(ok(""), {});
  assert.deepEqual(ok("# nothing\n\n"), {});
});

test("everything outside the subset is an error with its line", () => {
  rejects("a: 1\na: 2", /Duplicate key `a`/, 2);
  rejects("x:\n  a: 1\n  b: 2\n  a: 3", /Duplicate key `a`/, 4);
  rejects("a: &anchor 1", /Anchors/, 1);
  rejects("a: 1\nb: *anchor", /Aliases/, 2);
  rejects("a: !!str 1", /Tags/, 1);
  rejects("a: !custom x", /Tags/, 1);
  rejects("base:\n  x: 1\nmerged:\n  <<: *base", /Merge keys/, 4);
  rejects("a: {b: 1}", /Flow mappings/, 1);
  rejects("a: [x, {b: 1}]", /Flow mappings/, 1);
  rejects("a: |\n  text", /Block scalars/, 1);
  rejects("a: >\n  text", /Block scalars/, 1);
  rejects("a: 1\n---\nb: 2", /document marker/, 2);
  rejects("a: 1\n...", /document marker/, 2);
  rejects("%YAML 1.2\na: 1", /directives/, 1);
  rejects("a:\n\tb: 1", /tab/, 2);
  rejects("a: .inf", /Non-finite/, 1);
  rejects("a: -.Inf", /Non-finite/, 1);
  rejects("a: .nan", /Non-finite/, 1);
  rejects("a: [x, .NaN]", /Non-finite/, 1);
  rejects("? complex\n: value", /Complex keys/, 1);
  rejects("- a\n- b", /must be a mapping/, 1);
  rejects("a: 'unterminated", /Unterminated quoted/, 1);
  rejects("a: [x, y", /Unterminated flow sequence/, 1);
  rejects("a: plain\n  continued", /multi-line plain scalars/, 2);
  rejects("a: b: c", /cannot contain `: `/, 1);
  rejects('a: "bad \\q escape"', /Unknown escape/, 1);
  rejects("a: 'x' trailing", /after a scalar/, 1);
});

test("nesting is limited to 16 levels, counting the root mapping", () => {
  const build = (depth: number) => {
    const lines: string[] = [];
    for (let i = 0; i < depth; i++) lines.push(`${"  ".repeat(i)}k${i}:${i === depth - 1 ? " leaf" : ""}`);
    return lines.join("\n");
  };
  ok(build(16));
  rejects(build(17), /deeper than 16/, 17);
  ok(`a: ${"[".repeat(15)}x${"]".repeat(15)}`);
  rejects(`a: ${"[".repeat(16)}x${"]".repeat(16)}`, /deeper than 16/, 1);
});

test("the line limit is 4096 and the size limit 256 KiB", () => {
  ok(Array.from({ length: 4096 }, (_, i) => `k${i}: ${i}`).join("\n"));
  rejects(Array.from({ length: 4097 }, (_, i) => `k${i}: ${i}`).join("\n"), /more than 4096 lines/, 4097);
  const pad = "x".repeat(1000);
  const under = Array.from({ length: 200 }, (_, i) => `k${i}: ${pad}`).join("\n");
  assert.ok(Buffer.byteLength(under) < YAML_MAX_BYTES);
  ok(under);
  const over = Array.from({ length: 300 }, (_, i) => `k${i}: ${pad}`).join("\n");
  assert.ok(Buffer.byteLength(over) > YAML_MAX_BYTES);
  rejects(over, /larger than 256 KiB/, 1);
});

test("positions are reported per key and item as JSON pointers", () => {
  const detail = parseYamlDetailed(
    "intentset:\n  id: X-1\n  links:\n    governedBy:\n    - R-1\n    - R-2\n  audiences: [a, b]",
  );
  assert.equal(detail.error, null);
  assert.equal(detail.lines.get("/intentset"), 1);
  assert.equal(detail.lines.get("/intentset/id"), 2);
  assert.equal(detail.lines.get("/intentset/links/governedBy/1"), 6);
  assert.equal(detail.lines.get("/intentset/audiences/1"), 7);
});

test("CRLF line endings read the same as LF", () => {
  assert.deepEqual(ok("a: 1\r\nb:\r\n- x\r\n"), { a: 1, b: ["x"] });
});
