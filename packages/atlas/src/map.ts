/**
 * The map (ADR 0015, amended 2026-11-26): every record in the snapshot as a node and every authored link as an edge,
 * laid out once when the Atlas is built and drawn as one SVG. The whole model is layered by position alone (purpose on
 * top, every capability as one node holding its detail, which shows when a reader opens it); a record's neighborhood
 * is laid out by a force-directed layout (Fruchterman and Reingold) run a fixed number of steps from positions derived
 * from each ID's hash, in ID order. Both use only arithmetic and square roots, so the same graph gives the same bytes
 * on every machine (invariant: determinism). The SVG works on its own: every record with a page is a link to it, and
 * every node and edge carries a title. The script beside it (`map-script.ts`) only adds opening a capability, finding,
 * filtering, focusing, panning and zooming over what is already drawn.
 *
 * Status reads as words and repeats as style, never by color alone: a node's title says its type, status and, for a
 * verification, its evidence; a draft is outlined dashed; a verification's ring is green only for a current pass.
 */
import { type Artifact, type ArtifactType, compareStrings, type Edge } from "@intentset/core";
import { type Model, STATUS_WORDS } from "./model.ts";
import { recordPath } from "./record-text.ts";
import { escapeHtml } from "./text.ts";

/** The five families a node's color says, each named in the legend. */
export const GROUPS = {
  purpose: { label: "Purpose", types: ["product", "intent", "outcome", "measure"] },
  meaning: { label: "Product meaning", types: ["capability", "behavior", "rule", "scenario"] },
  architecture: { label: "Architecture", types: ["slice", "contract", "decision"] },
  verification: { label: "Verification", types: ["verification"] },
  knowledge: { label: "Knowledge", types: ["knowledge"] },
} as const satisfies Record<string, { label: string; types: readonly ArtifactType[] }>;

export type Group = keyof typeof GROUPS;

export function groupOf(type: ArtifactType): Group {
  for (const [group, { types }] of Object.entries(GROUPS) as [Group, { types: readonly ArtifactType[] }][]) {
    if (types.includes(type)) return group;
  }
  return "meaning";
}

const RADIUS: Partial<Record<ArtifactType, number>> = {
  product: 11,
  intent: 9,
  outcome: 9,
  capability: 9,
  behavior: 7,
  slice: 7,
};

/** Where a record is shown on the Atlas's pages, relative to the Atlas's root: every record has a page. */
export function pageOf(artifact: Artifact): string {
  return recordPath(artifact.meta.id);
}

export interface MapNode {
  id: string;
  type: ArtifactType;
  group: Group;
  title: string;
  status: string;
  /** A verification's evidence as the word a reader sees, and the tone that repeats it; null for any other record. */
  evidence: { word: string; tone: string } | null;
  href: string | null;
  x: number;
  y: number;
  r: number;
  /** On the layered map, a capability's count of the records it holds, shown beside its ID. */
  count?: number;
  /** On the layered map, the capability whose detail holds this record; absent for a record always shown. */
  block?: string;
}

export interface MapEdge {
  kind: string;
  from: string;
  to: string;
}

export interface AtlasMapLayout {
  nodes: MapNode[];
  edges: MapEdge[];
  /** The drawing's bounds, padded: x, y, width, height. On the layered map, the overview's: what shows at first. */
  box: [number, number, number, number];
  /** `layered` for the whole model, its capabilities folded; `force` for a record's neighborhood. */
  kind?: "layered" | "force";
}

/** FNV-1a over the ID: a 32-bit hash, the same on every machine. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** The authored links between records in `ids`, each drawn once, sorted. */
function linksAmong(model: Model, ids: ReadonlySet<string>): MapEdge[] {
  const seen = new Set<string>();
  const edges: MapEdge[] = [];
  // From each record's own links when they are few, so a neighborhood never sorts the whole graph's.
  const candidates =
    ids.size * 8 < model.graph.edges.length
      ? [...ids].flatMap((id) => model.graph.out.get(id) ?? [])
      : model.graph.edges;
  for (const edge of [...candidates].sort(compareEdges)) {
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) continue;
    const key = `${edge.kind}\u0000${edge.from}\u0000${edge.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ kind: edge.kind, from: edge.from, to: edge.to });
  }
  return edges;
}

/** What a node says about its record: its words, its evidence ring and its page. */
function nodeFor(model: Model, artifact: Artifact, x: number, y: number, extra: Partial<MapNode> = {}): MapNode {
  const { meta } = artifact;
  let evidence: MapNode["evidence"] = null;
  if (meta.type === "verification") {
    const found = model.hasEvidence ? model.evidenceOf(meta.id) : null;
    evidence = !model.hasEvidence
      ? { word: "not assessed", tone: "neutral" }
      : found === null
        ? { word: "unresolved", tone: "neutral" }
        : { word: STATUS_WORDS[found.status].word, tone: STATUS_WORDS[found.status].tone };
  }
  return {
    id: meta.id,
    type: meta.type,
    group: groupOf(meta.type),
    title: meta.title,
    status: meta.status,
    evidence,
    href: pageOf(artifact),
    x: round(x),
    y: round(y),
    r: RADIUS[meta.type] ?? 5,
    ...extra,
  };
}

/** The rows of the layered map's purpose band, top down. */
const PURPOSE_ROWS: readonly ArtifactType[] = ["product", "intent", "outcome"];
/** The detail's columns, left to right: behaviors, then their rules and scenarios, then checks, then knowledge. */
const DETAIL_COLUMNS: readonly (readonly ArtifactType[])[] = [
  ["behavior"],
  ["rule", "scenario"],
  ["verification"],
  ["knowledge"],
];
const DETAIL_ROW = 24;
const PURPOSE_ROW = 30;
const COLUMN_GAP = 28;

/** The width a node takes on its row: its circle and its label. */
function span(type: ArtifactType, label: string): number {
  const r = RADIUS[type] ?? 5;
  return 2 * r + LABEL_GAP + labelWidth(label) + 2;
}

/**
 * The records a capability's detail holds: its behaviors, their rules, scenarios, owning slices, verifications and
 * knowledge, and those slices' contracts and decisions. A record two capabilities reach is held by the first, in ID
 * order, so every record is drawn once; a link to a record another capability holds is listed in the panel.
 */
function detailOf(model: Model, capability: string, taken: Set<string>): string[] {
  const out: string[] = [];
  const add = (id: string) => {
    if (taken.has(id) || model.get(id) === undefined) return;
    taken.add(id);
    out.push(id);
  };
  const behaviors = model.into(capability, "parent", "behavior");
  for (const b of behaviors) add(b);
  for (const b of behaviors) {
    const claims = [b, ...model.from(b, "governedBy", "rule"), ...model.into(b, "illustrates", "scenario")];
    for (const c of claims.slice(1)) add(c);
    for (const slice of model.owners(b)) add(slice);
    for (const c of claims) for (const v of model.into(c, "verifies", "verification")) add(v);
    for (const c of claims) for (const k of model.into(c, "explains", "knowledge")) add(k);
  }
  for (const slice of out.filter((id) => model.get(id)?.meta.type === "slice")) {
    for (const kind of ["exposes", "consumes", "informedBy"] as const)
      for (const id of model.from(slice, kind)) add(id);
  }
  for (const contract of out.filter((id) => model.get(id)?.meta.type === "contract")) {
    for (const id of model.from(contract, "informedBy")) add(id);
  }
  return out;
}

/**
 * The layered map (ADR 0015, amended 2026-11-26, #159): the model in the rows people read it in. Products, intents
 * and outcomes (each outcome's measures beside it) on top, then every capability as one node with a count of the
 * records it holds, wrapped into rows. Records no capability reaches follow in a row of their own. Each capability's
 * detail is laid out below the capabilities, in columns (behaviors, their rules and scenarios, their checks, their
 * knowledge) with the code that delivers them in a row beneath, and is hidden until a reader opens that capability:
 * every detail shares one place, so one is open at a time. Positions come from order alone (ID order, and each
 * record's first owner), so the same graph gives the same bytes. No two labels overlap in any view the map shows.
 */
export function layoutMap(model: Model): AtlasMapLayout {
  const artifacts = [...model.graph.artifacts.values()].sort((a, b) => compareStrings(a.meta.id, b.meta.id));
  const ids = new Set(artifacts.map((a) => a.meta.id));
  const edges = linksAmong(model, ids);
  const placed = new Map<string, MapNode>();
  const place = (id: string, x: number, y: number, extra: Partial<MapNode> = {}) => {
    const artifact = model.get(id) as Artifact;
    placed.set(id, nodeFor(model, artifact, x + (RADIUS[artifact.meta.type] ?? 5), y, extra));
  };

  // The purpose band: one row per type, each record after the last, measures beside their outcome.
  let y = 0;
  let width = 0;
  for (const type of PURPOSE_ROWS) {
    const row = model.ofType(type);
    if (row.length === 0) continue;
    let x = 0;
    for (const artifact of row) {
      place(artifact.meta.id, x, y);
      x += span(type, artifact.meta.id) + COLUMN_GAP;
      if (type === "outcome") {
        for (const m of model.into(artifact.meta.id, "parent", "measure")) {
          place(m, x, y);
          x += span("measure", m) + COLUMN_GAP;
        }
      }
    }
    width = Math.max(width, x);
    y += PURPOSE_ROW;
  }
  for (const m of model.ofType("measure").filter((a) => !placed.has(a.meta.id))) {
    place(m.meta.id, width, y - PURPOSE_ROW);
    width += span("measure", m.meta.id) + COLUMN_GAP;
  }

  // The capabilities, wrapped into rows about as wide as the purpose band, or a square's width when that is narrower.
  const taken = new Set<string>([...placed.keys(), ...model.ofType("capability").map((c) => c.meta.id)]);
  const capabilities = model.ofType("capability");
  const details = new Map(capabilities.map((c) => [c.meta.id, detailOf(model, c.meta.id, taken)]));
  if (capabilities.length > 0) {
    const cell =
      Math.max(...capabilities.map((c) => span("capability", `${c.meta.id} (${details.get(c.meta.id)?.length})`))) +
      COLUMN_GAP;
    // As many to a row as keep the grid near the frame's proportions, or as fill the purpose band's width if wider.
    const square = Math.ceil(Math.sqrt((capabilities.length * PURPOSE_ROW * ASPECT) / cell));
    const perRow = Math.max(1, Math.min(capabilities.length, Math.max(square, Math.floor(width / cell))));
    if (y > 0) y += 6;
    capabilities.forEach((c, i) => {
      const count = details.get(c.meta.id)?.length ?? 0;
      place(c.meta.id, (i % perRow) * cell, y + Math.floor(i / perRow) * PURPOSE_ROW, { count });
    });
    width = Math.max(width, perRow * cell);
    y += Math.ceil(capabilities.length / perRow) * PURPOSE_ROW;
  }

  // Records no capability reaches, in a row of their own, wrapped at the band's width.
  const rest = artifacts.filter((a) => !placed.has(a.meta.id) && !taken.has(a.meta.id));
  if (rest.length > 0) {
    let x = 0;
    const limit = Math.max(width, 600);
    for (const artifact of rest) {
      const w = span(artifact.meta.type, artifact.meta.id) + COLUMN_GAP;
      if (x > 0 && x + w > limit) {
        x = 0;
        y += DETAIL_ROW;
      }
      place(artifact.meta.id, x, y);
      x += w;
    }
    width = Math.max(width, Math.min(limit, x));
    y += DETAIL_ROW;
  }
  const overview = [...placed.values()];

  // Each capability's detail, every one at the same place below the overview, since only one shows at a time.
  const top = y + 24;
  for (const [capability, members] of details) {
    let x = 0;
    let deepest = top;
    for (const types of DETAIL_COLUMNS) {
      const column = members.filter((id) => types.includes((model.get(id) as Artifact).meta.type));
      if (column.length === 0) continue;
      for (const [i, id] of column.entries()) place(id, x, top + i * DETAIL_ROW, { block: capability });
      deepest = Math.max(deepest, top + (column.length - 1) * DETAIL_ROW);
      x += Math.max(...column.map((id) => span((model.get(id) as Artifact).meta.type, id))) + COLUMN_GAP;
    }
    const code = members.filter(
      (id) => !DETAIL_COLUMNS.some((types) => types.includes((model.get(id) as Artifact).meta.type)),
    );
    let cx = 0;
    for (const id of code) {
      place(id, cx, deepest + DETAIL_ROW + 8, { block: capability });
      cx += span((model.get(id) as Artifact).meta.type, id) + COLUMN_GAP;
    }
  }

  const nodes = artifacts.map((a) => placed.get(a.meta.id) as MapNode);
  return { nodes, edges, box: boxOf(overview), kind: "layered" };
}

/**
 * A force-directed layout (Fruchterman and Reingold) of `artifacts` and the links among them, run a fixed number of
 * steps from positions derived from each ID's hash, in ID order, using only arithmetic and square roots; then, while
 * labels show, the footprints are pushed apart. Used for a record's neighborhood (ADR 0015, amended 2026-11-26).
 */
export function forceLayout(
  model: Model,
  artifacts: Artifact[],
  steps = 300,
  widths: readonly number[] = WIDEN,
): AtlasMapLayout {
  artifacts = [...artifacts].sort((a, b) => compareStrings(a.meta.id, b.meta.id));
  const index = new Map(artifacts.map((a, i) => [a.meta.id, i]));
  const edges = linksAmong(model, new Set(index.keys()));
  const n = artifacts.length;
  const k = 46; // the ideal distance between two linked nodes
  const side = k * Math.ceil(Math.sqrt(Math.max(n, 1))) * 1.6;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const h = hash(artifacts[i].meta.id);
    x[i] = ((h & 0xffff) / 0xffff - 0.5) * side;
    y[i] = ((h >>> 16) / 0xffff - 0.5) * side;
  }
  const pairs = edges.map((e) => [index.get(e.from) as number, index.get(e.to) as number] as const);
  const cell = k * 3;
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  for (let step = 0; step < steps; step++) {
    dx.fill(0);
    dy.fill(0);
    // Repulsion between two nodes within one cell's width; beyond that it is negligible.
    const repel = (i: number, j: number) => {
      let ex = x[i] - x[j];
      let ey = y[i] - y[j];
      let d2 = ex * ex + ey * ey;
      // Only within one cell's width, so the force between two nodes never depends on which cells they are in.
      if (d2 > cell * cell) return;
      if (d2 < 0.01) {
        // Two nodes on one point: separate them by their indices, which is deterministic.
        ex = (i - j) * 0.1;
        ey = (j - i) * 0.1 + 0.05;
        d2 = ex * ex + ey * ey;
      }
      // k²/d, divided by d again to scale the unit vector, and tapered to nothing at the cutoff so no seam forms.
      const taper = 1 - d2 / (cell * cell);
      const force = ((k * k) / d2) * taper;
      dx[i] += ex * force;
      dy[i] += ey * force;
      dx[j] -= ex * force;
      dy[j] -= ey * force;
    };
    if (n <= 64) {
      // A small drawing, such as a neighborhood: every pair, in index order, with no grid to build.
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) repel(i, j);
    } else {
      // A large one: only pairs in the same or a neighbouring cell of a grid can be within a cell's width.
      const grid = new Map<string, number[]>();
      for (let i = 0; i < n; i++) {
        const key = `${Math.floor(x[i] / cell)},${Math.floor(y[i] / cell)}`;
        const list = grid.get(key);
        if (list === undefined) grid.set(key, [i]);
        else list.push(i);
      }
      for (let i = 0; i < n; i++) {
        const cx = Math.floor(x[i] / cell);
        const cy = Math.floor(y[i] / cell);
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          for (let gy = cy - 1; gy <= cy + 1; gy++) {
            for (const j of grid.get(`${gx},${gy}`) ?? []) if (j > i) repel(i, j);
          }
        }
      }
    }
    // Attraction along each link: d²/k, along the unit vector.
    for (const [a, b] of pairs) {
      const ex = x[a] - x[b];
      const ey = y[a] - y[b];
      const d = Math.sqrt(ex * ex + ey * ey) || 0.01;
      const force = d / k;
      dx[a] -= ex * force;
      dy[a] -= ey * force;
      dx[b] += ex * force;
      dy[b] += ey * force;
    }
    // A weak pull to the centre keeps unlinked records near the rest.
    const temperature = side * 0.1 * (1 - step / steps) + 1;
    for (let i = 0; i < n; i++) {
      dx[i] -= x[i] * 0.01;
      dy[i] -= y[i] * 0.01;
      const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]);
      if (d > 0) {
        const move = Math.min(d, temperature);
        x[i] += (dx[i] / d) * move;
        y[i] += (dy[i] / d) * move;
      }
    }
  }

  // Where the labels show, no two records' footprints (the circle and the ID beside it) may overlap: the force layout
  // spaces points, not words, so a pass pushes overlapping footprints apart. A larger map shows its labels only where
  // the script finds room for them, and is left as the forces placed it.
  const radii = artifacts.map((artifact) => RADIUS[artifact.meta.type] ?? 5);
  const footprints = artifacts.map((artifact, i) => footprint(radii[i], n <= LABEL_LIMIT ? artifact.meta.id : ""));
  if (n <= LABEL_LIMIT && n > 1) {
    // Labels are wide and short, so separating them alone stacks a crowded map into a tall column. The forces' picture
    // is first widened by each of a few fixed factors, separated, and the one whose drawing is closest to the frame's
    // proportions is kept: the first such, so the choice is as deterministic as the rest.
    let best: { x: Float64Array; y: Float64Array; miss: number } | null = null;
    for (const widen of widths) {
      const wx = x.map((value) => value * widen);
      const wy = y.slice();
      separate(wx, wy, footprints);
      let [left, right, top, bottom] = [Infinity, -Infinity, Infinity, -Infinity];
      for (let i = 0; i < n; i++) {
        left = Math.min(left, wx[i] - footprints[i].left);
        right = Math.max(right, wx[i] + footprints[i].right);
        top = Math.min(top, wy[i] - footprints[i].up);
        bottom = Math.max(bottom, wy[i] + footprints[i].up);
      }
      const aspect = (right - left) / (bottom - top);
      // Distance in ratio rather than difference, so too tall and too wide by the same factor weigh the same.
      const miss = aspect > ASPECT ? aspect / ASPECT : ASPECT / aspect;
      if (best === null || miss < best.miss) best = { x: wx, y: wy, miss };
    }
    if (best !== null) {
      x.set(best.x);
      y.set(best.y);
    }
  }

  const nodes = artifacts.map((artifact, i) => nodeFor(model, artifact, x[i], y[i]));
  return { nodes, edges, box: boxOf(nodes), kind: "force" };
}

/** The most records a neighborhood draws: the record, its links, and as many of theirs as fit. */
export const NEIGHBORHOOD_LIMIT = 24;

/**
 * A record's neighborhood (#159): the record, every record one link away, and, while they fit under
 * NEIGHBORHOOD_LIMIT, the records two links away, nearest first and then in ID order, laid out by the force layout.
 */
export function neighborhoodLayout(model: Model, id: string): AtlasMapLayout {
  const near = (of: string) =>
    [...(model.graph.out.get(of) ?? []).map((e) => e.to), ...(model.graph.in.get(of) ?? []).map((e) => e.from)].filter(
      (other) => other !== of && model.get(other) !== undefined,
    );
  const members = new Set<string>([id]);
  for (const other of [...new Set(near(id))].sort(compareStrings)) {
    if (members.size >= NEIGHBORHOOD_LIMIT) break;
    members.add(other);
  }
  const first = [...members].slice(1);
  for (const one of first) {
    for (const other of [...new Set(near(one))].sort(compareStrings)) {
      if (members.size >= NEIGHBORHOOD_LIMIT) break;
      members.add(other);
    }
  }
  return forceLayout(
    model,
    [...members].map((m) => model.get(m) as Artifact),
    150,
    [1.25, 2],
  );
}

/** The drawing's bounds, labels included, with a small margin, so the picture fills the frame it is drawn in. */
export function boxOf(nodes: readonly MapNode[]): [number, number, number, number] {
  const pad = 16;
  if (nodes.length === 0) return [0, 0, 2 * pad, 2 * pad];
  const minX = Math.min(...nodes.map((node) => node.x - node.r - 1)) - pad;
  const minY = Math.min(...nodes.map((node) => node.y - Math.max(node.r, 6) - 1)) - pad;
  const maxX = Math.max(...nodes.map((node) => node.x + node.r + LABEL_GAP + labelWidth(labelOf(node)))) + pad;
  const maxY = Math.max(...nodes.map((node) => node.y + Math.max(node.r, 6) + 1)) + pad;
  return [round(minX), round(minY), round(maxX - minX), round(maxY - minY)];
}

/** The text beside a node: its ID, and for a capability on the layered map, how many records it holds. */
export function labelOf(node: MapNode): string {
  return node.count === undefined ? node.id : `${node.id} (${node.count})`;
}

/** The factors the forces' picture is widened by before its labels are separated, and the proportions aimed for. */
const WIDEN = [1, 1.25, 1.5, 2, 2.5, 3] as const;
const ASPECT = 1.4;

/** The space between a node's circle and its label, and the label's estimated width at the map's type size. */
const LABEL_GAP = 3;
function labelWidth(id: string): number {
  // About six units a character at 9px, a little generous so an estimate never undercounts a label.
  return id.length * 6;
}

/** The space a node takes on the map, around its centre: the circle, and its ID to the right when labels show. */
interface Footprint {
  left: number;
  right: number;
  up: number;
}

function footprint(r: number, label: string): Footprint {
  return {
    left: r + 1,
    right: label === "" ? r + 1 : r + LABEL_GAP + labelWidth(label) + 2,
    // A label is about nine units tall around its centre line; a large circle is taller.
    up: Math.max(r, 6) + 1,
  };
}

/**
 * Push apart every two footprints that overlap, along the axis where they overlap least (for two labels, nearly
 * always up and down, which keeps the picture's shape), half each way, in ID order, for a fixed number of passes.
 * Arithmetic only, so the result is the same on every machine.
 */
function separate(x: Float64Array, y: Float64Array, prints: readonly Footprint[]): void {
  const n = prints.length;
  const gap = 2;
  for (let pass = 0; pass < 400; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = prints[i];
        const b = prints[j];
        const ox = Math.min(x[i] + a.right, x[j] + b.right) - Math.max(x[i] - a.left, x[j] - b.left) + gap;
        const oy = Math.min(y[i] + a.up, y[j] + b.up) - Math.max(y[i] - a.up, y[j] - b.up) + gap;
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (oy <= ox) {
          // The one higher on the map moves up; on a tie, the earlier ID.
          const sign = y[i] < y[j] || (y[i] === y[j] && i < j) ? -1 : 1;
          y[i] += (sign * oy) / 2;
          y[j] -= (sign * oy) / 2;
        } else {
          const sign = x[i] < x[j] || (x[i] === x[j] && i < j) ? -1 : 1;
          x[i] += (sign * ox) / 2;
          x[j] -= (sign * ox) / 2;
        }
      }
    }
    if (!moved) break;
  }
}

function compareEdges(a: Edge, b: Edge): number {
  return compareStrings(a.from, b.from) || compareStrings(a.to, b.to) || compareStrings(a.kind, b.kind);
}

/** Above this many records an ID shows only where it fits: the layout does not space them, the script picks them. */
export const LABEL_LIMIT = 120;

/**
 * The map as HTML: the controls (hidden until the script shows them, so a reader without it never meets a control
 * that does nothing), the SVG, and the panel the script fills. `root` is the prefix from the page to the Atlas's
 * root; `href` turns an Atlas path into the address the page links, so the site can serve its own.
 */
/** The edges and nodes of a map, as SVG: every record with a page a link to it, every node and edge with a title. */
function drawing(
  layout: AtlasMapLayout,
  root: string,
  href: (path: string) => string,
  chosen?: string,
): { edges: string[]; nodes: string[] } {
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
  const edges = layout.edges.map((edge) => {
    const a = byId.get(edge.from) as MapNode;
    const b = byId.get(edge.to) as MapNode;
    const folded = a.block !== undefined || b.block !== undefined ? ' data-folded=""' : "";
    return `<line class="am-edge" data-from="${escapeHtml(a.id)}" data-to="${escapeHtml(b.id)}" data-g1="${a.group}" data-g2="${b.group}"${folded} x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"><title>${escapeHtml(`${a.id} ${edge.kind} ${b.id}`)}</title></line>`;
  });
  const nodes = layout.nodes.map((node) => {
    const words = [
      node.type,
      node.status,
      ...(node.evidence === null ? [] : [`evidence ${node.evidence.word}`]),
      ...(node.count === undefined ? [] : [`${node.count} ${node.count === 1 ? "record" : "records"} inside`]),
    ];
    const label = `${node.id}: ${node.title} (${words.join(", ")})`;
    const data =
      `class="am-node${node.id === chosen ? " am-selected" : ""}" data-id="${escapeHtml(node.id)}" data-group="${node.group}" data-type="${node.type}" ` +
      `data-status="${escapeHtml(node.status)}" data-title="${escapeHtml(node.title)}"` +
      (node.evidence === null
        ? ""
        : ` data-evidence="${escapeHtml(node.evidence.word)}" data-tone="${node.evidence.tone}"`) +
      (node.count === undefined ? "" : ` data-count="${node.count}"`) +
      (node.block === undefined ? "" : ` data-block="${escapeHtml(node.block)}"`);
    const shape =
      `<circle cx="${node.x}" cy="${node.y}" r="${node.r}"/>` +
      `<text x="${round(node.x + node.r + 3)}" y="${round(node.y + 3.5)}">${escapeHtml(labelOf(node))}</text>` +
      `<title>${escapeHtml(label)}</title>`;
    return node.href === null
      ? `<g ${data} tabindex="0" aria-label="${escapeHtml(label)}">${shape}</g>`
      : `<a ${data} href="${escapeHtml(href(`${root}${node.href}`))}" aria-label="${escapeHtml(label)}">${shape}</a>`;
  });
  return { edges, nodes };
}

/**
 * A record's neighborhood as a picture with no controls and no script: the record picked out, the records near it
 * laid out by the force layout, each a link to its page. On a record's page, where no script runs (ADR 0015).
 */
export function neighborhoodHtml(
  layout: AtlasMapLayout,
  chosen: string,
  root = "",
  href: (path: string) => string = (path) => path,
): string {
  const { edges, nodes } = drawing(layout, root, href, chosen);
  const [bx, by, bw, bh] = layout.box;
  return [
    '<div class="am-map am-neighborhood">',
    `<svg class="am-svg" viewBox="${bx} ${by} ${bw} ${bh}" width="${Math.round(bw * 1.5)}" role="group" aria-label="${escapeHtml(chosen)} and the ${layout.nodes.length - 1} records nearest it">`,
    `<g class="am-edges">${edges.join("")}</g>`,
    `<g class="am-nodes">${nodes.join("")}</g>`,
    "</svg>",
    "</div>",
    "",
  ].join("\n");
}

export function mapHtml(layout: AtlasMapLayout, root = "", href: (path: string) => string = (path) => path): string {
  const groups = Object.entries(GROUPS) as [Group, (typeof GROUPS)[Group]][];
  const present = groups.filter(([group]) => layout.nodes.some((node) => node.group === group));
  const controls = [
    '<div class="am-controls" hidden>',
    '<label class="am-find">Find a record <input type="search" list="am-ids" autocomplete="off" spellcheck="false"></label>',
    `<datalist id="am-ids">${layout.nodes.map((node) => `<option value="${escapeHtml(node.id)}">${escapeHtml(node.title)}</option>`).join("")}</datalist>`,
    '<fieldset class="am-filter"><legend>Show</legend>',
    ...present.map(
      ([group, { label }]) =>
        `<label><input type="checkbox" data-group="${group}" checked> <span class="am-swatch" data-group="${group}"></span>${escapeHtml(label)}</label>`,
    ),
    "</fieldset>",
    '<div class="am-zoom"><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="reset">Fit</button><button type="button" class="am-full" aria-pressed="false">Full screen</button>' +
      (layout.kind === "layered" ? '<button type="button" class="am-close" hidden>All capabilities</button>' : "") +
      "</div>",
    "</div>",
  ];
  const [bx, by, bw, bh] = layout.box;
  const many = layout.nodes.length > LABEL_LIMIT ? " am-many" : "";
  const layered = layout.kind === "layered" ? " am-layered" : "";
  const { edges, nodes } = drawing(layout, root, href);
  return [
    '<div class="am-map">',
    ...controls,
    `<svg class="am-svg${many}${layered}" viewBox="${bx} ${by} ${bw} ${bh}" role="group" aria-label="Map of ${layout.nodes.length} records and ${layout.edges.length} links">`,
    '<g class="am-viewport">',
    `<g class="am-edges">${edges.join("")}</g>`,
    `<g class="am-nodes">${nodes.join("")}</g>`,
    "</g>",
    "</svg>",
    '<aside class="am-panel" hidden aria-live="polite"></aside>',
    "</div>",
    "",
  ].join("\n");
}

/** The map's styles, in Markset's tokens so it follows the light and dark schemes. */
export const MAP_STYLES = `
/* Intentset Atlas: the map */
.am-map { --am-purpose: light-dark(#7c3aed, #c4b5fd); --am-meaning: light-dark(#0f766e, #5eead4);
  --am-architecture: light-dark(#b45309, #fcd34d); --am-verification: light-dark(#1d4ed8, #93c5fd);
  --am-knowledge: light-dark(#be185d, #f9a8d4); --am-pass: light-dark(#15803d, #4ade80);
  --am-fail: light-dark(#b91c1c, #f87171); --am-warn: light-dark(#a16207, #facc15); position: relative; }
.am-controls { display: flex; flex-wrap: wrap; gap: .5rem 1rem; align-items: center; margin-bottom: .5rem; }
.am-controls[hidden], .am-panel[hidden] { display: none; }
.am-find input { margin-left: .25rem; min-width: 12rem; max-width: 100%; }
.am-filter { display: flex; flex-wrap: wrap; gap: .25rem .75rem; border: 0; margin: 0; padding: 0; }
.am-filter legend { float: left; margin-right: .5rem; padding: 0; font-weight: 600; }
.am-swatch { display: inline-block; width: .7em; height: .7em; border-radius: 50%; margin-right: .3em; background: var(--am-meaning); }
.am-zoom button { min-width: 2.75rem; min-height: 2.75rem; margin-right: .25rem; }
.am-svg { display: block; width: 100%; height: auto; max-height: min(75vh, 48rem); min-height: 14rem; border: 1px solid var(--ms-border); border-radius: var(--ms-radius); background: var(--ms-surface); touch-action: none; }
.am-svg.am-grabbing { cursor: grabbing; }
.am-edge { stroke: var(--ms-border); stroke-width: 1; vector-effect: non-scaling-stroke; }
.am-node circle { fill: var(--am-meaning); stroke: var(--ms-surface); stroke-width: 1.5px; vector-effect: non-scaling-stroke; }
/* Sizes in user units are for the picture alone; the script sets each shown ID's size and each circle's radius so they
   stay about the same on screen at any zoom, and the halo's width with them. */
.am-node text { fill: var(--ms-fg); cursor: pointer; paint-order: stroke; stroke: var(--ms-surface); }
.am-svg:not(.am-js) .am-node text { font-size: 9px; stroke-width: 3px; }
.am-many .am-node text { display: none; }
.am-many.am-js .am-node.am-label text { display: inline; }
[data-group="purpose"] { --am-c: var(--am-purpose); } [data-group="meaning"] { --am-c: var(--am-meaning); }
[data-group="architecture"] { --am-c: var(--am-architecture); } [data-group="verification"] { --am-c: var(--am-verification); }
[data-group="knowledge"] { --am-c: var(--am-knowledge); }
.am-node circle, .am-swatch { fill: var(--am-c); background: var(--am-c); }
.am-node[data-status="draft"] circle { stroke: var(--am-c); stroke-dasharray: 2 1.5; fill-opacity: .35; }
.am-node[data-tone] circle { stroke-width: 3px; }
.am-node[data-tone="success"] circle { stroke: var(--am-pass); }
.am-node[data-tone="danger"] circle { stroke: var(--am-fail); }
.am-node[data-tone="warn"] circle { stroke: var(--am-warn); }
.am-node[data-tone="neutral"] circle { stroke: var(--ms-muted, var(--ms-border)); }
.am-node:focus { outline: none; }
.am-node:focus-visible circle, .am-node.am-selected circle { stroke: var(--ms-fg); stroke-width: 3px; }
.am-focus .am-node:not(.am-selected):not(.am-near), .am-focus .am-edge:not(.am-near) { opacity: .15; }
.am-focus .am-edge.am-near { stroke: var(--ms-fg); stroke-width: 1.5; }
.am-panel { margin-top: .5rem; padding: .75rem 1rem; border: 1px solid var(--ms-border); border-radius: var(--ms-radius); background: var(--ms-surface); }
.am-panel h3 { margin: 0 0 .25rem; font-size: 1rem; }
.am-panel ul { margin: .25rem 0 0; padding-left: 1.2rem; }
/* Full screen: the map fills the screen, the controls above it and the panel over its corner. Where the browser has no
   element full screen (an iPhone), the same layout is a fixed overlay. */
.am-map:fullscreen, .am-map.am-expanded { display: flex; flex-direction: column; box-sizing: border-box; padding: .75rem;
  background: var(--ms-bg); color: var(--ms-fg); overflow: hidden; }
.am-map.am-expanded { position: fixed; inset: 0; z-index: 1000; }
.am-map:fullscreen .am-svg, .am-map.am-expanded .am-svg { flex: 1; height: auto; min-height: 0; max-height: none; }
.am-map:fullscreen .am-panel, .am-map.am-expanded .am-panel { position: absolute; right: 1.25rem; bottom: 1.25rem;
  width: min(22rem, calc(100% - 2.5rem)); max-height: 40%; overflow: auto; margin: 0; box-shadow: 0 4px 16px rgb(0 0 0 / .2); }
.am-panel button { font: inherit; background: none; border: 0; padding: 0; color: var(--ms-link, inherit); text-decoration: underline; cursor: pointer; }
/* A record's neighborhood: drawn at about one and a half times its units, never wider than the column. */
.am-neighborhood .am-svg { width: auto; max-width: 100%; min-height: 0; }
/* The layered map: a capability's detail and its links show only while that capability is open. */
.am-layered .am-node[data-block]:not(.am-shown), .am-layered .am-edge[data-folded]:not(.am-shown) { display: none; }
.am-node[data-count] circle { stroke: var(--am-c); stroke-width: 3px; }
.am-close[hidden] { display: none; }
.am-hide-purpose [data-group="purpose"], .am-hide-purpose .am-edge[data-g1="purpose"], .am-hide-purpose .am-edge[data-g2="purpose"],
.am-hide-meaning [data-group="meaning"], .am-hide-meaning .am-edge[data-g1="meaning"], .am-hide-meaning .am-edge[data-g2="meaning"],
.am-hide-architecture [data-group="architecture"], .am-hide-architecture .am-edge[data-g1="architecture"], .am-hide-architecture .am-edge[data-g2="architecture"],
.am-hide-verification [data-group="verification"], .am-hide-verification .am-edge[data-g1="verification"], .am-hide-verification .am-edge[data-g2="verification"],
.am-hide-knowledge [data-group="knowledge"], .am-hide-knowledge .am-edge[data-g1="knowledge"], .am-hide-knowledge .am-edge[data-g2="knowledge"] { display: none; }
`;
