#!/usr/bin/env node
import { parseArgs } from "node:util";
import { parseYaml } from "@intentset/core";
import { drivers } from "./drivers.ts";
import { runSuite, suitePassed } from "./harness.ts";
import { formatJson, formatReport } from "./report.ts";

const { values } = parseArgs({
  options: {
    section: { type: "string", short: "s" },
    verbose: { type: "boolean", short: "v", default: false },
    json: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(`usage: intentset-conformance [--section <name>] [--verbose] [--json]

Validates every tests/*.json file against spec/conformance.schema.json, expands
each case from its baseline under examples/, runs it through the section's
driver and compares the aspects it states. Exit status is 1 when any aspect
fails or any file is malformed. Skipped aspects (no driver for the section, or
an aspect the driver does not yet produce) are reported but do not fail the run.`);
  process.exit(0);
}

const result = await runSuite({ drivers, parseYaml, section: values.section });
process.stdout.write(values.json ? formatJson(result) : `${formatReport(result, { verbose: values.verbose })}\n`);
process.exit(suitePassed(result) ? 0 : 1);
