/**
 * `surfaces` (VSA §3, ADR 0028) is not one of a slice's binding fields (Core §8): changing it moves the slice's content
 * hash, as any edit to the record does, and moves no verification's subject. Core does not depend on the verification
 * package, so the two are checked together here, where the root links every workspace package.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { plainCarrier, readRegistries, validate } from "@intentset/core";
import { sliceBinding } from "@intentset/verification";

const dir = resolve(import.meta.dirname, "..", "examples", "scheduling");
const registries = readRegistries(readFileSync(join(dir, "registries.yaml"), "utf8"), "registries.yaml").registries;

function graphWith(surface: string) {
  const inputs = readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
      let text = readFileSync(join(dir, name), "utf8");
      if (name === "SLICE-ASMT-SCHEDULE.md") {
        text = text
          .replace(
            "    - RES-ASSESSMENT-DATA\n",
            `    - RES-ASSESSMENT-DATA\n    surfaces:\n      ${surface}:\n        knowledge: [KB-ASMT-SCHEDULE]\n`,
          )
          .replace(
            "  links:\n",
            "  availability:\n    products: [PRD-LANTERN]\n    releases: [pilot-1]\n    roles: [teacher]\n    editions: [standard]\n    flags: []\n  links:\n",
          );
      }
      return plainCarrier(name, text);
    });
  const result = validate(inputs, registries);
  assert.deepEqual(result.diagnostics, []);
  return result.graph;
}

test("BEH-SURFACES, BEH-EVIDENCE-CURRENT: a change to surfaces alone moves the slice's content hash and no subject's binding", () => {
  const one = graphWith("lantern-web:/assessments/schedule");
  const other = graphWith("lantern-web:/assessments/other");
  const id = "SLICE-ASMT-SCHEDULE";
  assert.notEqual(one.artifacts.get(id)?.contentHash, other.artifacts.get(id)?.contentHash);
  assert.deepEqual(sliceBinding(one, id), sliceBinding(other, id));
});
