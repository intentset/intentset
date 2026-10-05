/**
 * Install the published packages into an empty project and use them, as a
 * consumer would. Everything else runs inside the workspace, where a sibling
 * is always the local copy; this is the one check that sees what a consumer's
 * install resolves. It installs with pnpm, whose strict layout also catches a
 * package that imports something it does not declare.
 *
 *   node test/consumer/smoke.ts --packed              pack each package and install the tarballs
 *   node test/consumer/smoke.ts --registry <version>  install that version from the registry
 *
 * The release workflow runs --packed before it publishes and --registry after.
 * Markset learned why with tiptap 0.3.1, which passed every packed check and
 * still failed installed, because the registry served an older sibling.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const release = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts.release as string;
const PACKAGES = [...release.matchAll(/--filter (@intentset\/[a-z-]+)/gu)].map((m) => m[1]);

/** The architecture package's peer, which a consumer supplies: TypeScript 7, for its scanner (ADR 0007). */
const PEERS = ["typescript@7"];

// pnpm run hands a "--" on to the script, where npm swallowed it, and a release
// asked the registry for version "--" for twenty minutes before this filtered it.
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const mode = args[0];
const version = args[1] ?? "";
const project = mkdtempSync(join(tmpdir(), "intentset-consumer-"));
const run = (command: string, args: string[], cwd = project) =>
  execFileSync(command, args, { cwd, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" });

try {
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
  // A release is installed minutes after it is published, inside pnpm's
  // default 24-hour hold on new versions, so the hold is lifted here.
  const settings = ["minimumReleaseAge: 0"];
  let specs: string[];
  if (mode === "--packed") {
    const packs = join(project, "packs");
    mkdirSync(packs);
    for (const name of PACKAGES) run("pnpm", ["--filter", name, "pack", "--pack-destination", packs], root);
    const tarballs = readdirSync(packs).map((file) => join(packs, file));
    specs = tarballs;
    // A packed package asks for its siblings by version range, and an
    // unreleased version is not on the registry yet, so every reference to a
    // sibling is pointed at its tarball rather than resolved.
    settings.push(
      "overrides:",
      ...PACKAGES.map((name) => {
        const file = tarballs.find((t) => t.includes(`${name.slice(1).replace("/", "-")}-`));
        if (!file) throw new Error(`no tarball for ${name}`);
        return `  "${name}": "file:${file}"`;
      }),
    );
  } else if (mode === "--registry" && /^\d+\.\d+\.\d+(-[\w.]+)?$/u.test(version)) {
    specs = PACKAGES.map((name) => `${name}@${version}`);
  } else {
    throw new Error("usage: smoke.ts --packed | --registry <version>");
  }
  writeFileSync(join(project, "pnpm-workspace.yaml"), `${settings.join("\n")}\n`);
  // The registry can take many minutes to serve every version it just accepted.
  for (let attempt = 1; ; attempt++) {
    try {
      run("pnpm", ["add", "--prefer-offline=false", "--reporter=silent", ...specs, ...PEERS]);
      break;
    } catch (error) {
      if (mode !== "--registry" || attempt === 40) throw error;
      console.log(`consumer: the registry does not have every package yet; waiting (attempt ${attempt})`);
      execFileSync("sleep", ["30"]);
    }
  }
  copyFileSync(join(import.meta.dirname, "consumer.mjs"), join(project, "consumer.mjs"));
  process.stdout.write(run("node", ["consumer.mjs"]));
  // Again under the development condition, which is how a consumer's dev server
  // (Vite, Vitest, Next) resolves every package, micromark's asserting build
  // included. Markset 0.3.3 passed every production run and threw on any link here.
  process.stdout.write(run("node", ["--conditions=development", "consumer.mjs"]));
} finally {
  rmSync(project, { recursive: true, force: true });
}
