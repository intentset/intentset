#!/usr/bin/env node
import { main } from "./main.ts";

// The first SIGINT or SIGTERM asks a long-running command (serve, mcp) to stop
// cleanly; the listener is removed as it fires, so a second one terminates.
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => controller.abort());

const code = await main(process.argv.slice(2), {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  cwd: process.cwd(),
  signal: controller.signal,
});
process.exitCode = code;
