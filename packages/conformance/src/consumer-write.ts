/**
 * `pnpm run fixtures:consumer`: write the consumer fixtures to tests/consumer/,
 * removing any file there the build no longer makes. Run it after a change to
 * the export, the example or the fixtures' recipe, and commit the result.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildConsumerFixtures, CONSUMER_DIR } from "./consumer.ts";

const built = buildConsumerFixtures();
mkdirSync(CONSUMER_DIR, { recursive: true });
for (const name of readdirSync(CONSUMER_DIR)) if (!built.has(name)) rmSync(join(CONSUMER_DIR, name));
for (const [name, text] of built) writeFileSync(join(CONSUMER_DIR, name), text);
console.log(`wrote ${built.size} files to tests/consumer/`);
