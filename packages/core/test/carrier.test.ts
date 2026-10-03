import assert from "node:assert/strict";
import { test } from "node:test";
import { headingText, plainCarrier } from "../src/index.ts";

test("frontmatter is the block between --- lines starting at line 1, and its YAML starts on line 2", () => {
  const input = plainCarrier("a.md", "---\nmarkset: 0\n---\n\n# Title\n");
  assert.deepEqual(input.frontmatter, { text: "markset: 0", line: 2 });
  assert.deepEqual(input.headings, [{ depth: 1, text: "Title", line: 5 }]);
  assert.deepEqual(input.syntax, []);
  assert.equal(input.path, "a.md");
});

test("a byte-order mark before the opening fence is allowed", () => {
  const input = plainCarrier("a.md", "﻿---\nmarkset: 0\n---\n# T\n");
  assert.deepEqual(input.frontmatter, { text: "markset: 0", line: 2 });
});

test("no fence on line 1, or no closing fence, is no frontmatter", () => {
  assert.equal(plainCarrier("a.md", "\n---\nmarkset: 0\n---\n").frontmatter, null);
  assert.equal(plainCarrier("a.md", "---\nmarkset: 0\n# T\n").frontmatter, null);
  assert.equal(plainCarrier("a.md", "# T\n").frontmatter, null);
});

test("headings inside fenced code are not headings", () => {
  const source = [
    "---",
    "a: 1",
    "---",
    "# One",
    "```",
    "# not a heading",
    "```",
    "~~~~ text",
    "## not either",
    "~~~",
    "## still inside: the closing fence is shorter",
    "~~~~~",
    "## Two",
    "````md",
    "```",
    "## inside: three backticks do not close four",
    "````",
    "## Three",
    "``` not-a-fence ` because the info string has a backtick",
    "## Four",
  ].join("\n");
  assert.deepEqual(
    plainCarrier("a.md", source).headings.map((h) => [h.depth, h.text, h.line]),
    [
      [1, "One", 4],
      [2, "Two", 13],
      [2, "Three", 18],
      [2, "Four", 20],
    ],
  );
});

test("ATX rules: at most three spaces of indent, a space after the hashes, at most six", () => {
  const source =
    "   ## Indented three\n    ## Indented four is code\n##No space\n####### Seven\n> ## Quoted\n###### Six";
  assert.deepEqual(
    plainCarrier("a.md", source).headings.map((h) => h.text),
    ["Indented three", "Six"],
  );
});

test("heading text drops closing hashes and inline markup", () => {
  assert.equal(headingText("Public contract"), "Public contract");
  assert.equal(headingText("*Public contract*"), "Public contract");
  assert.equal(headingText("_Public_ `contract` ##"), "Public contract");
  assert.equal(headingText("**Public** [contract](./c.md)"), "Public contract");
  assert.equal(headingText("snake_case_name"), "snake_case_name");
  assert.equal(headingText("C# ##"), "C#");
  assert.equal(headingText("##"), "");
});

test("CRLF documents carry the same headings and frontmatter", () => {
  const lf = plainCarrier("a.md", "---\na: 1\n---\n# T\n## S\n");
  const crlf = plainCarrier("a.md", "---\r\na: 1\r\n---\r\n# T\r\n## S\r\n");
  assert.deepEqual(crlf.headings, lf.headings);
  assert.deepEqual(crlf.frontmatter, lf.frontmatter);
});
