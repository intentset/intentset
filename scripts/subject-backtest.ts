/**
 * The back-test of ADR 0013's subject binding over a repository's history.
 *
 *   node --conditions=intentset-source scripts/subject-backtest.ts \
 *     [--repo ../streamlane] [--ref origin/main] [--commits 300] \
 *     [--out docs/adoption/subject-binding-backtest.md] [--cache <file>] [--from-cache]
 *
 * For each of the last N first-parent commits of `--ref` (oldest to newest) it
 * checks the commit out in a temporary worktree of the repository (created
 * under its `.claude/worktrees` and removed afterwards; nothing else in that
 * repository is touched), reads the commit's own records and configuration
 * with the in-repo packages exactly as `intentset graph` does (the Markset
 * carrier, `.intentset/config.yaml`, the registries, `.intentset/architecture.yaml`),
 * resolves every slice's claimed files with the architecture package's
 * `buildModel`, and computes `computeSubject` (packages/verification/src/subject.ts)
 * for every automated verification. It then reports, in Markdown:
 *
 *   a. per commit, how many verifications' subjects changed against the
 *      previous commit, and so the share a subject binding keeps current (a
 *      commit or graph-hash binding keeps none: every record is stale at the
 *      next commit, and at every commit that changes the model);
 *   b. the closure size per slice and per verification at the newest commit;
 *   c. files that change in many commits and belong to no slice: the
 *      candidates for `evidence.globalInputs`;
 *   d. a replay of every `fix` commit (subject starting "fix") that changed
 *      code (a file in a slice, backend, shared, composition or unowned
 *      region, not a test): of the verifications the commit itself touched
 *      (a behavior, rule or scenario they verify changed: "strong"; or only
 *      their test file changed: "weak", since one spec file serves several
 *      verifications), did the subject move through code alone, and for
 *      end-to-end tests, would it have moved only if `exercises` named the
 *      slice that owns the touched file.
 *
 * Four variants of the hash are run and reported side by side:
 *   claims      ADR 0013 as written: the claimed files of the included slices
 *               (the tests a slice claims included), no global inputs;
 *   +globals    the same plus GLOBAL_CANDIDATES below: the lockfile, the root
 *               package.json, the TypeScript configurations, toolchain version
 *               files and the workflows, those present and claimed by no slice;
 *   +lean       the same with LEAN_CANDIDATES only: the lockfile, the workspace
 *               file, the TypeScript configurations and version files;
 *   prod+lean   +lean, with the slices' test files left out (the verification's
 *               own test file stays in as `test`);
 *   +res        +lean, with the files of the registry resources each slice lists in
 *               `usesResources` added to that slice's files (the backend a web
 *               slice talks to, which no slice claims).
 * The replay (d) reports +lean, and +res beside it.
 *
 * File content is represented by git's blob id: a blob id is the content's
 * hash, so it moves exactly when the bytes move, and it costs one `git
 * ls-files` per commit instead of a read of every file. Nothing is
 * invented: every figure in the report is computed in the run, and the
 * report says which commits and which options produced it. The numbers are
 * not stable across histories, so the report is a dated record, not a gate.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  ARCHITECTURE_CONFIG_PATH,
  buildModel,
  matchAny,
  readArchitectureConfig,
  resolveConfig,
} from "@intentset/architecture";
import { type Graph, validate } from "@intentset/core";
import { computeSubject, includedSlices, movedParts, type Subject, verifiedBehaviors } from "@intentset/verification";
import { loadRepository } from "../packages/cli/src/repository.ts";

/** Files, present at the root or in the workflows and claimed by no slice, mixed into every subject in the +globals variants. */
const GLOBAL_CANDIDATES = [
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^package\.json$/,
  /^tsconfig[^/]*\.json$/,
  /^\.(node-version|nvmrc|tool-versions)$/,
  /^\.github\/workflows\/[^/]+\.ya?ml$/,
];

/** The narrower set: what changes the build of every slice and nothing else (no root package.json, no workflows). */
const LEAN_CANDIDATES = [
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^tsconfig[^/]*\.json$/,
  /^\.(node-version|nvmrc|tool-versions)$/,
];

/** The fix PRs the report details beside #891, chosen after reading the all-fixes table. */
const DETAILED_PRS = [891, 666, 678, 650, 653, 828];
/** #891's two named behaviors: their verifications are replayed whether or not the commit touched their tests. */
const FORCED: Record<number, string[]> = { 891: ["BEH-DEPMAP-LIMITS", "BEH-ORG-REQUEST-TEAM-UNREAD"] };

const VARIANTS = ["claims", "+globals", "+lean", "prod+lean", "+res"] as const;
type Variant = (typeof VARIANTS)[number];

interface VInfo {
  id: string;
  locator: string;
  e2e: boolean;
}

interface State {
  sha: string;
  graph: Graph;
  graphHash: string;
  verifs: Map<string, VInfo>;
  hashes: Record<Variant, Map<string, string>>;
  subjects: Map<string, Subject>;
  subjectsRes: Map<string, Subject>;
  oids: Map<string, string>;
  sliceFiles: Map<string, string[]>;
  sliceFilesRes: Map<string, string[]>;
  owner: (path: string) => string | null;
  region: (path: string) => string;
  isTest: (path: string) => boolean;
  globals: string[];
  lean: string[];
}

interface FixVerification {
  id: string;
  e2e: boolean;
  why: string;
  /** A behavior, rule or scenario the verification verifies changed in the commit; otherwise only its test file did. */
  strong: boolean;
  moved: boolean;
  kinds: string[];
  codeMoved: boolean;
  codeSlices: string[];
  /** Owners of the touched code files that are not in the verification's included slices. */
  outside: string[];
  /** Touched code files the subject does not hash: owned by a slice outside the closure, or claimed by none. */
  unseen: number;
  seen: number;
  /** With the used resources' files hashed (+res): whether a claimed or resource file moved, and the touched files still unseen. */
  codeMovedRes: boolean;
  unseenRes: number;
}
interface FixReplay {
  pr: number | null;
  sha: string;
  title: string;
  codeFiles: { path: string; owner: string }[];
  verifications: FixVerification[];
}

interface Results {
  ref: string;
  head: string;
  commits: { sha: string; date: string; title: string }[];
  perCommit: {
    sha: string;
    total: number;
    created: number;
    changed: Record<Variant, number>;
    changedE2e: number;
    totalE2e: number;
    graphHashChanged: boolean;
  }[];
  survival: Record<Variant, { n: number; kept: number | null }[]>;
  closure: { slice: string; closure: number; files: number }[];
  verificationSize: { id: string; slices: number; files: number; e2e: boolean }[];
  headCounts: { verifications: number; e2e: number; slices: number };
  headGlobals: string[];
  headLean: string[];
  unowned: { path: string; commits: number; region: string }[];
  unownedGroups: { group: string; files: number; commits: number }[];
  unownedRegions: { region: string; files: number; commits: number }[];
  /** Commits that changed each file of the +globals set (as present at the time). */
  globalChanges: { path: string; commits: number }[];
  /** Steps that changed a non-test code file in a slice or any other code region; of those, steps that changed one no slice claims; steps that changed an e2e support file (not a spec). */
  codeSteps: { code: number; unclaimedCode: number; e2eSupport: number };
  /** (+lean) subject moves, counted per verification and step: by the kind of part that moved, and by the slice whose claimed file moved. */
  causes: {
    moves: number;
    byKind: Record<string, number>;
    only: Record<string, number>;
    bySlice: { slice: string; moves: number }[];
  };
  fixes: FixReplay[];
  fixesTotal: number;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 29 });
}

function lsFiles(root: string): Map<string, string> {
  const out = git(root, "ls-files", "-s", "-z");
  const files = new Map<string, string>();
  for (const line of out.split("\0")) {
    if (line === "") continue;
    const tab = line.indexOf("\t");
    const [mode, oid] = line.slice(0, tab).split(" ");
    if (mode === "120000" || mode === "160000") continue;
    files.set(line.slice(tab + 1), oid);
  }
  return files;
}

function build(root: string, sha: string): State {
  const repo = loadRepository(root, "markset");
  const graph = validate(repo.inputs, repo.registries, { level: "L2" }).graph;
  let arch = resolveConfig();
  try {
    arch = resolveConfig(readArchitectureConfig(readFileSync(join(root, ARCHITECTURE_CONFIG_PATH), "utf8")).config);
  } catch {
    // No architecture configuration: the default ignore and test lists stand.
  }
  const oids = new Map<string, string>();
  for (const [path, oid] of lsFiles(root)) {
    if (!matchAny([...repo.config.ignore, ...arch.ignore], path)) oids.set(path, oid);
  }
  const model = buildModel(graph, repo.registries, new Map([...oids.keys()].map((p) => [p, ""])), arch);
  const sliceFiles = new Map<string, string[]>();
  for (const slice of model.slices) sliceFiles.set(slice.id, [...new Set(slice.claimFiles.flat())].sort());
  const owner = (path: string) => model.claimOwners.get(path)?.[0]?.slice ?? model.testOwner(path);
  const globals = [...oids.keys()]
    .filter((p) => GLOBAL_CANDIDATES.some((re) => re.test(p)) && owner(p) === null)
    .sort();
  const lean = globals.filter((p) => LEAN_CANDIDATES.some((re) => re.test(p)));

  const verifs = new Map<string, VInfo>();
  for (const [id, artifact] of graph.artifacts) {
    const v = artifact.meta.verification;
    if (artifact.meta.type !== "verification" || v === undefined || v.method !== "automated") continue;
    verifs.set(id, { id, locator: v.locator, e2e: /(^|\/)e2e\/|\.spec\.[tj]sx?$/.test(v.locator) });
  }
  const readFile = (path: string) => {
    const oid = oids.get(path);
    return oid === undefined ? undefined : Buffer.from(oid);
  };
  const prodFiles = new Map<string, string[]>();
  for (const [id, files] of sliceFiles)
    prodFiles.set(
      id,
      files.filter((f) => !model.isTest(f)),
    );
  const hashes: State["hashes"] = {
    claims: new Map(),
    "+globals": new Map(),
    "+lean": new Map(),
    "prod+lean": new Map(),
    "+res": new Map(),
  };
  const resourceFiles = new Map(model.resources.map((info) => [info.resource.id, info.files]));
  const sliceFilesRes = new Map<string, string[]>();
  for (const slice of model.slices) {
    const extra = slice.meta.usesResources.flatMap((id) => resourceFiles.get(id) ?? []);
    sliceFilesRes.set(slice.id, [...new Set([...(sliceFiles.get(slice.id) ?? []), ...extra])].sort());
  }
  const subjects = new Map<string, Subject>();
  const subjectsRes = new Map<string, Subject>();
  for (const id of verifs.keys()) {
    hashes.claims.set(id, computeSubject({ graph, verificationId: id, readFile, sliceFiles, globalInputs: [] }).hash);
    hashes["+globals"].set(
      id,
      computeSubject({ graph, verificationId: id, readFile, sliceFiles, globalInputs: globals }).hash,
    );
    const withLean = computeSubject({ graph, verificationId: id, readFile, sliceFiles, globalInputs: lean });
    hashes["+lean"].set(id, withLean.hash);
    subjects.set(id, withLean);
    hashes["prod+lean"].set(
      id,
      computeSubject({ graph, verificationId: id, readFile, sliceFiles: prodFiles, globalInputs: lean }).hash,
    );
    const withRes = computeSubject({
      graph,
      verificationId: id,
      readFile,
      sliceFiles: sliceFilesRes,
      globalInputs: lean,
    });
    hashes["+res"].set(id, withRes.hash);
    subjectsRes.set(id, withRes);
  }
  return {
    sha,
    graph,
    graphHash: hashGraph(graph),
    verifs,
    hashes,
    subjects,
    subjectsRes,
    oids,
    sliceFiles,
    sliceFilesRes,
    owner,
    region: (path) => {
      const r = model.regionOf(path);
      return r.owner === undefined ? r.kind : `${r.kind}:${r.owner}`;
    },
    isTest: model.isTest,
    globals,
    lean,
  };
}

import { graphHash as hashGraph } from "@intentset/core";

const percentile = (sorted: number[], p: number): number =>
  sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
const sortedNumbers = (xs: number[]) => [...xs].sort((a, b) => a - b);
const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`);

function run(options: { repo: string; ref: string; commits: number }): Results {
  const repo = resolve(options.repo);
  const shas = git(repo, "rev-list", "--first-parent", "-n", String(options.commits), options.ref)
    .trim()
    .split("\n")
    .reverse();
  const worktree = join(repo, ".claude", "worktrees", "intentset-subject-backtest");
  git(repo, "worktree", "add", "-q", "--detach", "--force", worktree, shas[0]);
  const commits: Results["commits"] = [];
  const perCommit: Results["perCommit"] = [];
  const unowned = new Map<string, { commits: number; region: string }>();
  const fixes: FixReplay[] = [];
  const groups = new Map<string, { files: Set<string>; commits: Set<number> }>();
  const regions = new Map<string, { files: Set<string>; commits: Set<number> }>();
  const globalChanges = new Map<string, number>();
  const codeSteps = { code: 0, unclaimedCode: 0, e2eSupport: 0 };
  const causes = {
    moves: 0,
    byKind: {} as Record<string, number>,
    only: {} as Record<string, number>,
    bySlice: new Map<string, number>(),
  };
  const note = (map: typeof groups, key: string, file: string, i: number) => {
    const entry = map.get(key) ?? { files: new Set<string>(), commits: new Set<number>() };
    entry.files.add(file);
    entry.commits.add(i);
    map.set(key, entry);
  };
  const series: Record<Variant, Map<string, (string | undefined)[]>> = {
    claims: new Map(),
    "+globals": new Map(),
    "+lean": new Map(),
    "prod+lean": new Map(),
    "+res": new Map(),
  };
  let prev: State | null = null;
  let last: State | null = null;
  try {
    for (const [i, sha] of shas.entries()) {
      git(worktree, "checkout", "-q", "--detach", "--force", sha);
      const [date, title] = git(repo, "log", "-1", "--format=%ad%x00%s", "--date=short", sha).trim().split("\0");
      commits.push({ sha, date, title });
      const state = build(worktree, sha);
      process.stderr.write(`${i + 1}/${shas.length} ${sha.slice(0, 9)} ${state.verifs.size} verifications\n`);

      for (const variant of VARIANTS) {
        for (const [id, hash] of state.hashes[variant]) {
          const list = series[variant].get(id) ?? [];
          list[i] = hash;
          series[variant].set(id, list);
        }
      }

      const changedFiles = git(repo, "diff", "--name-only", "-z", `${sha}^`, sha)
        .split("\0")
        .filter((p) => p !== "");
      for (const file of changedFiles) {
        if (state.globals.includes(file)) globalChanges.set(file, (globalChanges.get(file) ?? 0) + 1);
        if (!file.startsWith("product/model/") && state.oids.has(file) && state.owner(file) === null) {
          note(groups, file.split("/").slice(0, -1).slice(0, 4).join("/") || "(root)", file, i);
          note(regions, state.region(file), file, i);
        }
        if (file.startsWith("product/model/") || !state.oids.has(file) || state.owner(file) !== null) continue;
        const entry = unowned.get(file) ?? { commits: 0, region: state.region(file) };
        entry.commits++;
        unowned.set(file, entry);
      }

      if (i > 0) {
        const live = changedFiles.filter((f) => state.oids.has(f) && !f.startsWith("product/model/"));
        const code = live.filter((f) => !state.isTest(f) && state.region(f) !== "external");
        if (code.length > 0) codeSteps.code++;
        if (code.some((f) => state.owner(f) === null)) codeSteps.unclaimedCode++;
        if (live.some((f) => /(^|\/)e2e\//.test(f) && !/\.spec\.[tj]sx?$/.test(f))) codeSteps.e2eSupport++;
      }
      if (prev !== null) {
        const p: State = prev;
        const changed: Record<Variant, number> = { claims: 0, "+globals": 0, "+lean": 0, "prod+lean": 0, "+res": 0 };
        let common = 0;
        let created = 0;
        let changedE2e = 0;
        let totalE2e = 0;
        for (const id of state.verifs.keys()) {
          if (!p.verifs.has(id)) {
            created++;
            continue;
          }
          common++;
          if (state.hashes["+lean"].get(id) !== p.hashes["+lean"].get(id)) {
            const moved = movedParts(p.subjects.get(id) as Subject, state.subjects.get(id) as Subject);
            const kinds = [...new Set(moved.map((m) => m.split(" ")[0]))].sort();
            causes.moves++;
            for (const k of kinds) causes.byKind[k] = (causes.byKind[k] ?? 0) + 1;
            if (kinds.length === 1) causes.only[kinds[0]] = (causes.only[kinds[0]] ?? 0) + 1;
            const slicesMoved = new Set(
              moved.filter((m) => m.startsWith("slice-file ")).map((m) => /\(([^)]+)\)$/.exec(m)?.[1] ?? ""),
            );
            for (const sl of slicesMoved) causes.bySlice.set(sl, (causes.bySlice.get(sl) ?? 0) + 1);
          }
          const e2e = state.verifs.get(id)?.e2e === true;
          if (e2e) totalE2e++;
          for (const variant of VARIANTS) {
            if (state.hashes[variant].get(id) !== p.hashes[variant].get(id)) {
              changed[variant]++;
              if (variant === "+lean" && e2e) changedE2e++;
            }
          }
        }
        perCommit.push({
          sha,
          total: common,
          created,
          changed,
          changedE2e,
          totalE2e,
          graphHashChanged: state.graphHash !== p.graphHash,
        });
        if (/^fix/.test(title)) {
          const replay = replayFix(p, state, changedFiles, title, sha);
          if (replay !== null) fixes.push(replay);
        }
      }
      prev = state;
      last = state;
    }
  } finally {
    try {
      git(repo, "worktree", "remove", "--force", worktree);
    } catch {
      // Left for `git worktree prune`.
    }
  }
  if (last === null) throw new Error("no commits");
  const head = last as State;

  const survival = {} as Results["survival"];
  for (const variant of VARIANTS) {
    const horizons = [1, 2, 5, 10, 25, 50];
    survival[variant] = horizons.map((n) => {
      let eligible = 0;
      let kept = 0;
      for (const list of series[variant].values()) {
        for (let i = 0; i + n < list.length; i++) {
          if (list[i] === undefined) continue;
          eligible++;
          let ok = true;
          for (let j = i + 1; j <= i + n && ok; j++) ok = list[j] === list[i];
          if (ok) kept++;
        }
      }
      return { n, kept: eligible === 0 ? null : kept / eligible };
    });
  }

  const closure: Results["closure"] = [];
  const dependsOn = (id: string) =>
    (head.graph.out.get(id) ?? []).filter((e) => e.kind === "dependsOn").map((e) => e.to);
  for (const [id, files] of head.sliceFiles) {
    const seen = new Set<string>([id]);
    const queue = [id];
    while (queue.length > 0) {
      for (const next of dependsOn(queue.pop() as string)) {
        if (!seen.has(next) && head.sliceFiles.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    const all = new Set<string>(files);
    for (const s of seen) for (const f of head.sliceFiles.get(s) ?? []) all.add(f);
    closure.push({ slice: id, closure: seen.size, files: all.size });
  }
  closure.sort((a, b) => b.files - a.files || b.closure - a.closure || (a.slice < b.slice ? -1 : 1));

  const verificationSize: Results["verificationSize"] = [];
  for (const [id, info] of head.verifs) {
    const slices = includedSlices(head.graph, id);
    const files = new Set<string>();
    for (const s of slices.keys()) for (const f of head.sliceFiles.get(s) ?? []) files.add(f);
    verificationSize.push({ id, slices: slices.size, files: files.size, e2e: info.e2e });
  }

  return {
    ref: options.ref,
    head: head.sha,
    commits,
    perCommit,
    survival,
    closure,
    verificationSize,
    headCounts: {
      verifications: head.verifs.size,
      e2e: [...head.verifs.values()].filter((v) => v.e2e).length,
      slices: head.sliceFiles.size,
    },
    headGlobals: head.globals,
    headLean: head.lean,
    unowned: [...unowned]
      .map(([path, v]) => ({ path, ...v }))
      .sort((a, b) => b.commits - a.commits || (a.path < b.path ? -1 : 1)),
    unownedGroups: [...groups]
      .map(([group, v]) => ({ group, files: v.files.size, commits: v.commits.size }))
      .sort((a, b) => b.commits - a.commits || (a.group < b.group ? -1 : 1)),
    unownedRegions: [...regions]
      .map(([region, v]) => ({ region, files: v.files.size, commits: v.commits.size }))
      .sort((a, b) => b.commits - a.commits || (a.region < b.region ? -1 : 1)),
    globalChanges: [...globalChanges]
      .map(([path, commits]) => ({ path, commits }))
      .sort((a, b) => b.commits - a.commits || (a.path < b.path ? -1 : 1)),
    codeSteps,
    causes: {
      moves: causes.moves,
      byKind: causes.byKind,
      only: causes.only,
      bySlice: [...causes.bySlice]
        .map(([slice, moves]) => ({ slice, moves }))
        .sort((a, b) => b.moves - a.moves || (a.slice < b.slice ? -1 : 1))
        .slice(0, 12),
    },
    fixes,
    fixesTotal: commits.slice(1).filter((c) => /^fix/.test(c.title)).length,
  };
}

/**
 * One `fix` commit: the verifications it touched (their test file, a record
 * they verify, or, for the forced PRs, the named behaviors' verifications),
 * and whether each one's subject moved through code. Null when the commit
 * changed no code (a model, help or documentation fix).
 */
function replayFix(prev: State, cur: State, changed: string[], title: string, sha: string): FixReplay | null {
  const changedSet = new Set(changed);
  const code = changed.filter((f) => cur.oids.has(f) && !cur.isTest(f) && cur.region(f) !== "external");
  if (code.length === 0) return null;
  const pr = Number(/\(#(\d+)\)\s*$/.exec(title)?.[1] ?? "") || null;
  const codeFiles = code.map((path) => ({
    path,
    owner: cur.owner(path) ?? prev.owner(path) ?? `unclaimed (${cur.region(path)})`,
  }));
  const verifications: FixVerification[] = [];
  const forced = new Set(pr === null ? [] : (FORCED[pr] ?? []));
  for (const [id, info] of cur.verifs) {
    if (!prev.verifs.has(id)) continue;
    const reasons: string[] = [];
    let strong = false;
    if (changedSet.has(info.locator)) reasons.push("its test file changed");
    const behaviors = verifiedBehaviors(cur.graph, id);
    const targets = new Set<string>(behaviors);
    for (const e of cur.graph.out.get(id) ?? []) if (e.kind === "verifies") targets.add(e.to);
    for (const t of targets) {
      const path = cur.graph.artifacts.get(t)?.path;
      if (path !== undefined && changedSet.has(path)) {
        reasons.push(`${t} changed`);
        strong = true;
      }
    }
    if (behaviors.some((b) => forced.has(b))) {
      reasons.push("named by the brief");
      strong = true;
    }
    if (reasons.length === 0) continue;
    const before = prev.subjects.get(id) as Subject;
    const after = cur.subjects.get(id) as Subject;
    const moved = movedParts(before, after);
    const kinds = [...new Set(moved.map((m) => m.split(" ")[0]))].sort();
    const codeSlices = [
      ...new Set(moved.filter((m) => m.startsWith("slice-file ")).map((m) => /\(([^)]+)\)$/.exec(m)?.[1] ?? "")),
    ].sort();
    const included = includedSlices(cur.graph, id);
    const outside = [
      ...new Set(codeFiles.map((f) => f.owner).filter((o) => !o.startsWith("unclaimed") && !included.has(o))),
    ].sort();
    const unseen = codeFiles.filter((f) => !included.has(f.owner)).length;
    const seenRes = new Set([...included.keys()].flatMap((sl) => cur.sliceFilesRes.get(sl) ?? []));
    const movedRes = movedParts(prev.subjectsRes.get(id) as Subject, cur.subjectsRes.get(id) as Subject);
    verifications.push({
      codeMovedRes: movedRes.some((m) => m.startsWith("slice-file ")),
      unseenRes: codeFiles.filter((f) => !seenRes.has(f.path)).length,
      id,
      unseen,
      seen: codeFiles.length - unseen,
      e2e: info.e2e,
      why: reasons.join("; "),
      strong,
      moved: after.hash !== before.hash,
      kinds,
      codeMoved: codeSlices.length > 0,
      codeSlices,
      outside,
    });
  }
  return { pr, sha, title, codeFiles, verifications };
}

function render(r: Results): string {
  const lines: string[] = [];
  const out = (s = "") => lines.push(s);
  const n = r.perCommit.length;
  out("# Subject binding back-test (ADR 0013, stage 1)");
  out();
  out(
    `Generated by \`scripts/subject-backtest.ts\` over Streamlane's last ${r.commits.length} first-parent commits of \`${r.ref}\`, ` +
      `${r.commits[0].sha.slice(0, 9)} (${r.commits[0].date}) to ${r.head.slice(0, 9)} (${r.commits[r.commits.length - 1].date}), ` +
      `at ${n} commit-to-commit steps. Every figure comes from that run; the hash is \`computeSubject\` of ` +
      "`packages/verification/src/subject.ts`, with file content represented by git's blob id.",
  );
  out();
  out(
    `At the newest commit the model has ${r.headCounts.verifications} automated verifications (${r.headCounts.e2e} end-to-end, ` +
      `by a locator under \`e2e/\` or a \`.spec\` file) and ${r.headCounts.slices} slices with claims. ` +
      "Five variants of the hash are run: **claims** (ADR 0013 as written, no global inputs), **+globals** (the same plus the lockfile, root `package.json`, TypeScript configurations, toolchain version files and workflows that no slice claims) **+lean** (only the lockfile, the workspace file, the TypeScript configurations and toolchain version files), **prod+lean** (+lean, leaving the slices' test files out of the hash; the verification's own test file stays in) and **+res** (+lean, with the files of the registry resources each slice lists in `usesResources` added to that slice's files).",
  );
  out();

  out("## a. How much evidence a subject binding keeps current per commit");
  out();
  out(
    "A commit binding, or a graph-hash binding, invalidates every record at every commit: 0% kept. Below, the share of verifications whose subject did not change from the previous commit, over commits at which the verification existed in both. Early commits have few slices and few verifications, so the later windows are the honest ones.",
  );
  out();
  const windows: [string, number, number][] = [["all steps", 0, n]];
  const third = Math.floor(n / 3);
  windows.push(
    [`oldest third (steps 1-${third})`, 0, third],
    [`middle third`, third, 2 * third],
    [`newest third (steps ${2 * third + 1}-${n})`, 2 * third, n],
  );
  out(
    "| Window | Variant | Commits | Verifications compared (median) | Changed per commit: median | p90 | max | Kept current per commit: median | p10 (worst decile) | Commits that changed none |",
  );
  out("|---|---|---|---|---|---|---|---|---|---|");
  for (const [name, from, to] of windows) {
    const slice = r.perCommit.slice(from, to).filter((c) => c.total > 0);
    if (slice.length === 0) continue;
    for (const variant of VARIANTS) {
      const changed = sortedNumbers(slice.map((c) => c.changed[variant]));
      const kept = sortedNumbers(slice.map((c) => (100 * (c.total - c.changed[variant])) / c.total));
      const none = slice.filter((c) => c.changed[variant] === 0).length;
      out(
        `| ${name} | ${variant} | ${slice.length} | ${percentile(sortedNumbers(slice.map((c) => c.total)), 50)} | ${percentile(changed, 50)} | ${percentile(changed, 90)} | ${changed[changed.length - 1]} | ${percentile(kept, 50).toFixed(1)}% | ${percentile(kept, 10).toFixed(1)}% | ${none} (${pct(none, slice.length)}) |`,
      );
    }
  }
  out();
  const gh = r.perCommit.filter((c) => c.graphHashChanged).length;
  out(
    `The graph hash changed at ${gh} of ${n} steps (${pct(gh, n)}), so a graph-hash binding alone, with the commit binding dropped, would have kept evidence current at ${pct(n - gh, n)} of steps but invalidated every record at the other ${pct(gh, n)}; the commit binding invalidates all of them at every step.`,
  );
  out();
  const e2eSteps = r.perCommit.filter((c) => c.totalE2e > 0);
  const e2eChanged = e2eSteps.map((c) => (100 * (c.totalE2e - c.changedE2e)) / c.totalE2e);
  out(
    `End-to-end verifications alone (+lean): kept current per commit median ${percentile(sortedNumbers(e2eChanged), 50).toFixed(1)}%, p10 ${percentile(sortedNumbers(e2eChanged), 10).toFixed(1)}%, over the ${e2eSteps.length} steps that have any.`,
  );
  out();
  out(
    "How long a record made at one commit stays current: the share of (verification, commit) pairs whose subject is unchanged N commits later, over the pairs that have N commits after them in the window.",
  );
  out();
  out(`| After N commits | ${VARIANTS.join(" | ")} |`);
  out(`|---|${VARIANTS.map(() => "---").join("|")}|`);
  for (const [k, point] of r.survival.claims.entries()) {
    out(
      `| ${point.n} | ${VARIANTS.map((v) => `${r.survival[v][k].kept === null ? "n/a" : `${(100 * (r.survival[v][k].kept as number)).toFixed(1)}%`}`).join(" | ")} |`,
    );
  }
  out();

  out(
    `Why subjects moved (+lean; ${r.causes.moves} moves over all steps, each counted once per kind of part that moved, so the kinds overlap):`,
  );
  out();
  out("| Part that moved | Moves involving it | Moves where it was the only part |");
  out("|---|---|---|");
  for (const [kind, count] of Object.entries(r.causes.byKind).sort((a, b) => b[1] - a[1])) {
    out(`| ${kind} | ${count} (${pct(count, r.causes.moves)}) | ${r.causes.only[kind] ?? 0} |`);
  }
  out();
  out("The slices whose claimed files moved in the most subject moves (a move counts once per slice):");
  out();
  out("| Slice | Moves |");
  out("|---|---|");
  for (const c of r.causes.bySlice) out(`| ${c.slice} | ${c.moves} |`);
  out();

  out("## b. Closure sizes at the newest commit");
  out();
  const files = sortedNumbers(r.verificationSize.map((v) => v.files));
  const slices = sortedNumbers(r.verificationSize.map((v) => v.slices));
  out(
    `Per verification (without \`exercises\`): slices included, median ${percentile(slices, 50)}, p90 ${percentile(slices, 90)}, max ${slices[slices.length - 1]}; files hashed, median ${percentile(files, 50)}, p90 ${percentile(files, 90)}, max ${files[files.length - 1]}.`,
  );
  out();
  out("The ten slices with the most files in their `dependsOn` closure (the slice itself counts as one):");
  out();
  out("| Slice | Slices in closure | Files hashed |");
  out("|---|---|---|");
  for (const c of r.closure.slice(0, 10)) out(`| ${c.slice} | ${c.closure} | ${c.files} |`);
  out();
  const cs = sortedNumbers(r.closure.map((c) => c.closure));
  out(
    `All ${r.closure.length} slices: closure median ${percentile(cs, 50)}, p90 ${percentile(cs, 90)}, max ${cs[cs.length - 1]}; ${r.closure.filter((c) => c.closure === 1).length} have no dependency.`,
  );
  out();

  out("## c. Global input candidates");
  out();
  out(
    `Files that changed in at least one commit of the window and that no slice claims at that commit, other than the model's own records (\`product/model/**\`, which the subject hashes as records). Counts are commits (of ${r.commits.length}) that changed the file or, for a group, any file in it. ${r.unowned.length} distinct unclaimed files changed in all.`,
  );
  out();
  out(
    "By the architecture check's region of the unclaimed file (what a change there would leave unseen by a subject):",
  );
  out();
  out("| Region | Distinct files | Commits changing any |");
  out("|---|---|---|");
  for (const g of r.unownedRegions.slice(0, 12)) out(`| ${g.region} | ${g.files} | ${g.commits} |`);
  out();
  out(
    `Of the ${n} steps, ${r.codeSteps.code} changed a non-test code file (in a slice or in a shared, composition, backend, resource, infrastructure or unowned region); at ${r.codeSteps.unclaimedCode} of those the change included a file no slice claims, which no subject sees; ${r.codeSteps.e2eSupport} steps changed an end-to-end support file (a file under \`e2e/\` that is not a spec, such as a helper or fixture), which the test file's own hash does not cover.`,
  );
  out();
  out("By directory (up to four levels), the groups changed in the most commits:");
  out();
  out("| Directory | Distinct files | Commits changing any |");
  out("|---|---|---|");
  for (const g of r.unownedGroups.slice(0, 20)) out(`| \`${g.group}\` | ${g.files} | ${g.commits} |`);
  out();
  const rootFile = (p: string) =>
    !p.includes("/") || p.startsWith(".github/") || p.startsWith(".intentset/") || p.startsWith(".claude/");
  out("Files at the repository root, in `.github/` and in `.intentset/` (the usual global inputs):");
  out();
  out("| File | Commits | Region |");
  out("|---|---|---|");
  for (const u of r.unowned.filter((x) => rootFile(x.path)).slice(0, 25))
    out(`| \`${u.path}\` | ${u.commits} | ${u.region} |`);
  out();
  out("The most-changed single files, for comparison (generated output such as the help publication shows here):");
  out();
  out("| File | Commits | Region |");
  out("|---|---|---|");
  for (const u of r.unowned.slice(0, 12)) out(`| \`${u.path}\` | ${u.commits} | ${u.region} |`);
  out();
  out(
    `What the variants mixed in at the newest commit. +globals: ${r.headGlobals.map((g) => `\`${g}\``).join(", ") || "none"}. +lean: ${r.headLean.map((g) => `\`${g}\``).join(", ") || "none"}. Commits that changed each, over the window:`,
  );
  out();
  out("| Global input | Commits changing it |");
  out("|---|---|");
  for (const g of r.globalChanges.slice(0, 20)) out(`| \`${g.path}\` | ${g.commits} |`);
  out();

  out("## d. Replay of the fix commits");
  out();
  const replayed = r.fixes;
  out(
    `${r.fixesTotal} of the ${r.commits.length - 1} stepped commits have a subject starting \`fix\`; ${replayed.length} of them changed code (a non-test file in a slice, backend, shared, composition, infrastructure, resource or unowned region), and the rest changed only tests, records, documents or tooling. For each of those ${replayed.length}, the verifications the commit itself touched are the ones the fix was about: **strong** when a behavior, rule or scenario the verification verifies changed in the commit, **weak** when only its test file did (a spec file serves several verifications). Moved means the +lean subject hash differs from the parent's; **by code** means a claimed file of an included slice moved, which is the only way a code fix that leaves tests and records alone is seen.`,
  );
  out();
  const touched = replayed.filter((f) => f.verifications.length > 0);
  const total = touched.flatMap((f) => f.verifications.map((v) => ({ f, v })));
  out(
    `- Code fixes that touched at least one verification: ${touched.length} of ${replayed.length}; with a strong one: ${touched.filter((f) => f.verifications.some((v) => v.strong)).length}.`,
  );
  for (const [label, pairs] of [
    ["Strong pairs", total.filter(({ v }) => v.strong)],
    ["Weak pairs", total.filter(({ v }) => !v.strong)],
  ] as const) {
    out(
      `- ${label}: ${pairs.length}; subject moved ${pairs.filter(({ v }) => v.moved).length}; moved by code ${pairs.filter(({ v }) => v.codeMoved).length}; moved by code with the used resources hashed (+res) ${pairs.filter(({ v }) => v.codeMovedRes).length}.`,
    );
    for (const kind of ["other automated", "end-to-end"]) {
      const group = pairs.filter(({ v }) => (kind === "end-to-end") === v.e2e);
      const outside = group.filter(({ v }) => !v.codeMoved && v.outside.length > 0).length;
      out(
        `  - ${kind}: ${group.length} pairs, moved by code ${group.filter(({ v }) => v.codeMoved).length}, not moved by code ${group.filter(({ v }) => !v.codeMoved).length}, of which the touched code is owned by a slice outside the verification's closure ${outside}.`,
      );
    }
  }
  out();
  out(
    "Strong pairs not moved by code, with the touched files' owners and the owners outside the verification's slices (which would need `exercises` or `dependsOn` to be seen):",
  );
  out();
  out(
    "| PR | Verification | End-to-end | Touched code owners | Owners outside the verification's slices | Moved parts |",
  );
  out("|---|---|---|---|---|---|");
  let rows = 0;
  for (const f of touched) {
    for (const v of f.verifications.filter((x) => x.strong && !x.codeMoved)) {
      rows++;
      const owners = [...new Set(f.codeFiles.map((c) => c.owner))];
      out(
        `| ${f.pr === null ? f.sha.slice(0, 9) : `#${f.pr}`} | ${v.id} | ${v.e2e ? "yes" : "no"} | ${owners.slice(0, 6).join(", ")}${owners.length > 6 ? `, and ${owners.length - 6} more` : ""} | ${v.outside.slice(0, 6).join(", ") || "none"} | ${v.kinds.join(", ") || "none"} |`,
      );
    }
  }
  if (rows === 0) out("| none | | | | | |");
  out();
  out("### The named replays");
  out();
  out(
    "| PR | Fix | Code files touched (owner) | Verification | End-to-end | Why replayed | Subject moved | By code (slices) | Other parts moved | Touched files seen / not seen | Needs `exercises` naming |",
  );
  out("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const pr of DETAILED_PRS) {
    const f = r.fixes.find((x) => x.pr === pr);
    if (f === undefined) {
      out(`| #${pr} | not in the replayed set | | | | | | | | | |`);
      continue;
    }
    const filesCell =
      f.codeFiles
        .slice(0, 4)
        .map((c) => `\`${c.path}\` (${c.owner})`)
        .join("<br>") + (f.codeFiles.length > 4 ? `<br>and ${f.codeFiles.length - 4} more` : "");
    const shown = f.verifications.filter((v) => v.strong);
    if (shown.length === 0)
      out(
        `| #${pr} | ${f.title.replace(/\|/g, "/").slice(0, 70)} | ${filesCell} | none strongly touched | | | | | | | |`,
      );
    for (const v of shown) {
      out(
        `| #${pr} | ${f.title.replace(/\|/g, "/").slice(0, 70)} | ${filesCell} | ${v.id} | ${v.e2e ? "yes" : "no"} | ${v.why} | ${v.moved ? "yes" : "NO"} | ${v.codeMoved ? `yes (${v.codeSlices.join(", ")})` : "no"} | ${v.kinds.filter((k) => k !== "slice-file").join(", ") || "none"} | ${v.seen} / ${v.unseen} | ${f.codeFiles.length - v.unseenRes} / ${v.unseenRes} | ${v.codeMoved ? "not needed" : v.codeMovedRes ? "not needed with +res" : v.outside.length > 0 ? v.outside.join(", ") : "nothing in a slice: the touched files are unclaimed or already included"} |`,
      );
    }
  }
  out();
  out("### Every code fix in the window");
  out();
  out("| PR | Date | Code files | Strong verifications | Moved by code | Weak verifications | Moved by code |");
  out("|---|---|---|---|---|---|---|");
  const dates = new Map(r.commits.map((c) => [c.sha, c.date]));
  for (const f of replayed) {
    const strong = f.verifications.filter((v) => v.strong);
    const weak = f.verifications.filter((v) => !v.strong);
    out(
      `| ${f.pr === null ? f.sha.slice(0, 9) : `#${f.pr}`} | ${dates.get(f.sha)} | ${f.codeFiles.length} | ${strong.length} | ${strong.filter((v) => v.codeMoved).length} | ${weak.length} | ${weak.filter((v) => v.codeMoved).length} |`,
    );
  }
  out();
  out("## What this says for the ADR");
  out();
  for (const line of conclusion(r)) out(line);
  out();
  return lines.join("\n");
}

/**
 * The closing paragraph: every figure is computed from the run, and the prose
 * around it states what those figures say for ADR 0013. It was written for
 * the run of 2026-10-14 and should be reread when the script is run on
 * another history.
 */
function conclusion(r: Results): string[] {
  const n = r.perCommit.length;
  const live = r.perCommit.filter((c) => c.total > 0);
  const keptOf = (cs: Results["perCommit"], v: Variant) =>
    sortedNumbers(cs.map((c) => (100 * (c.total - c.changed[v])) / c.total));
  const newest = live.slice(-Math.floor(n / 3));
  const surv = (v: Variant, k: number) => {
    const point = r.survival[v].find((x) => x.n === k)?.kept;
    return point === null || point === undefined ? "n/a" : `${(100 * point).toFixed(1)}%`;
  };
  const days = new Set(r.commits.map((c) => c.date)).size;
  const sizes = {
    slices: sortedNumbers(r.verificationSize.map((v) => v.slices)),
    files: sortedNumbers(r.verificationSize.map((v) => v.files)),
  };
  const wide = r.closure.filter((c) => c.closure * 2 >= r.headCounts.slices).length;
  const strong = r.fixes.flatMap((f) => f.verifications.filter((v) => v.strong));
  const strongE2e = strong.filter((v) => v.e2e);
  const weakE2e = r.fixes.flatMap((f) => f.verifications.filter((v) => !v.strong && v.e2e));
  const leanChanges = r.globalChanges.filter((g) => r.headLean.includes(g.path));
  const top = r.causes.bySlice[0];
  const kind = (k: string) => r.causes.byKind[k] ?? 0;
  const pctOf = (a: number, b: number) => (b === 0 ? "n/a" : `${((100 * a) / b).toFixed(1)}%`);
  return [
    `**What it keeps current.** At Streamlane's pace (${r.commits.length} merges in ${days} days of the window) the +lean subject kept a median ${percentile(keptOf(live, "+lean"), 50).toFixed(1)}% of verifications current from one commit to the next (newest third: median ${percentile(keptOf(newest, "+lean"), 50).toFixed(1)}%, worst decile ${percentile(keptOf(newest, "+lean"), 10).toFixed(1)}%), against 0% for a commit binding. The median hides a heavy tail: a commit that touches a widely used slice or the lockfile moves most subjects at once (the maximum was ${Math.max(...live.map((c) => c.changed["+lean"]))} of ${live.find((c) => c.changed["+lean"] === Math.max(...live.map((x) => x.changed["+lean"])))?.total} verifications). A record does not last long, though: the share still current ${surv("+lean", 1)} after 1 commit, ${surv("+lean", 5)} after 5, ${surv("+lean", 10)} after 10 and ${surv("+lean", 25)} after 25. So a subject binding makes a per-commit or per-merge unit run useful, and does little for a nightly browser suite at this merge rate, since a night is dozens of merges and most closures are touched in that time.`,
    "",
    `**Closure limits.** A verification's subject covers a median ${percentile(sizes.slices, 50)} slices and ${percentile(sizes.files, 50)} files, and the p90 is ${percentile(sizes.slices, 90)} slices and ${percentile(sizes.files, 90)} files (maximum ${sizes.slices[sizes.slices.length - 1]} and ${sizes.files[sizes.files.length - 1]}); ${wide} of ${r.headCounts.slices} slices have a closure of at least half the slices in the model. Subject moves concentrate in a few slices (${top.slice} alone is involved in ${top.moves} of ${r.causes.moves} moves), and the slice record itself took part in ${pctOf(kind("slice"), r.causes.moves)} of them, which suggests deciding what of the slice record belongs in the subject (its claims, \`implements\` and \`dependsOn\` are what matter to ownership and dependency; its prose is not). This run did not separate edits to those fields from edits to prose, so that is a question for the next step, not a finding. A hard limit on closure size is not supported by this run (the wide closures are the app's central slices, and a cap would refuse to bind them); a warning on closures above the p90 is, since it names the slices that make the gate noisy.`,
    "",
    `**\`exercises\`.** Of the ${strongE2e.length} end-to-end verifications whose behavior a code fix changed in the same commit, ${strongE2e.filter((v) => v.codeMoved).length} moved through code without any \`exercises\`, because a slice in its closure changed. The exception (#650, TEST-DELIVERY-STRIP) changed a backend file that no slice claims and a slice outside the verification's closure: it would be seen only if \`exercises\` named that slice, and with the used resources hashed (+res) it still would not be, because its slices do not list the resource. Of the ${weakE2e.length} end-to-end verifications that were only touched by a test file edit, ${weakE2e.filter((v) => !v.codeMoved && v.outside.length > 0).length} had code changed in a slice outside their closure. So \`exercises\` is needed where an end-to-end test reaches a backend or a slice it does not import, not on every end-to-end verification; and the larger gap is not \`exercises\` at all: ${r.codeSteps.unclaimedCode} of ${r.codeSteps.code} steps that changed code changed a file no slice claims (registry resources such as the work backend, other backend files, shared, composition and unowned files), which no subject sees. \`exercises\` as a list of slice IDs cannot name those files; the ADR should let it name a registry resource, or have a subject include the resources its slices list in \`usesResources\` (+res), whose cost in this run was a median of ${percentile(keptOf(live, "+res"), 50).toFixed(1)}% kept current per commit against ${percentile(keptOf(live, "+lean"), 50).toFixed(1)}% without. The test's own imports are not covered either: ${r.codeSteps.e2eSupport} steps changed an end-to-end helper or fixture that no verification's test file hash includes.`,
    "",
    `**Global inputs.** Candidates that no slice claims and that changed in the window: ${leanChanges.map((g) => `\`${g.path}\` (${g.commits} commits)`).join(", ") || "none"}; the root \`package.json\` and the workflows changed in ${r.globalChanges.filter((g) => !r.headLean.includes(g.path)).reduce((m, g) => Math.max(m, g.commits), 0)} commits or fewer each and moved every subject at those commits, for a median ${percentile(keptOf(live, "+globals"), 50).toFixed(1)}% kept per commit against ${percentile(keptOf(live, "+lean"), 50).toFixed(1)}% for the lean set. The lean set (lockfile, workspace file, TypeScript configurations, toolchain version files) is the proposal; a workflow or the root manifest is better named per repository, and a changed global input was the only cause of ${r.causes.only["global-input"] ?? 0} subject moves of ${r.causes.moves}. \`CLAUDE.md\`, the decisions and requirements documents and the generated help publication change often and affect no check, so they should stay out.`,
    "",
    `**Where the design is weakest.** Claims decide freshness now, and ${pctOf(r.codeSteps.unclaimedCode, r.codeSteps.code)} of the code-changing steps touched code no slice claims, so a green subject says less than the ADR's "unchanged since it passed" wherever a backend resource, shared code or composition code is involved. The ADR's own control (the architecture check's unclaimed-file report) would have to be a gate before the binding is trusted, and the report should name the unclaimed files a verification's slices use.`,
  ];
}

function main(): void {
  const { values } = parseArgs({
    options: {
      repo: { type: "string", default: "../streamlane" },
      ref: { type: "string", default: "origin/main" },
      commits: { type: "string", default: "300" },
      out: { type: "string", default: "docs/adoption/subject-binding-backtest.md" },
      cache: { type: "string" },
      "from-cache": { type: "boolean", default: false },
    },
  });
  let results: Results;
  if (values["from-cache"] && values.cache !== undefined && existsSync(values.cache)) {
    results = JSON.parse(readFileSync(values.cache, "utf8")) as Results;
  } else {
    results = run({ repo: values.repo as string, ref: values.ref as string, commits: Number(values.commits) });
    if (values.cache !== undefined) writeFileSync(values.cache, JSON.stringify(results));
  }
  const text = render(results);
  mkdirSync(dirname(resolve(values.out as string)), { recursive: true });
  writeFileSync(resolve(values.out as string), `${text}\n`);
  process.stderr.write(`wrote ${values.out}\n`);
}

main();
