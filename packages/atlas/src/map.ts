/**
 * The map: every record in the snapshot as a node and every authored link as an edge, laid out once when the Atlas
 * is built and drawn as one SVG (ADR 0015). The layout is a force-directed one (Fruchterman and Reingold) run a fixed
 * number of steps from positions derived from each ID's hash, in ID order, using only arithmetic and square roots, so
 * the same graph gives the same bytes on every machine (invariant: determinism). The SVG works on its own: every
 * record with a page is a link to it, and every node and edge carries a title. The script beside it (`map-script.ts`)
 * only adds finding, filtering, focusing, panning and zooming over what is already drawn.
 *
 * Status reads as words and repeats as style, never by color alone: a node's title says its type, status and, for a
 * verification, its evidence; a draft is outlined dashed; a verification's ring is green only for a current pass.
 */
import { type Artifact, type ArtifactType, compareStrings, type Edge } from "@intentset/core";
import { type Model, STATUS_WORDS } from "./model.ts";
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

/** Where a record is shown on the Atlas's pages, relative to the Atlas's root; null when no page shows it. */
export function pageOf(artifact: Artifact): string | null {
  const id = artifact.meta.id;
  switch (artifact.meta.type) {
    case "behavior":
      return `behaviors/${id}.html`;
    case "capability":
      return `index.html#${id}`;
    case "slice":
      return `ownership.html#${id}`;
    case "verification":
      return `verification.html#${id}`;
    case "knowledge":
      return `publication.html#${id}`;
    default:
      return null;
  }
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
}

export interface MapEdge {
  kind: string;
  from: string;
  to: string;
}

export interface AtlasMapLayout {
  nodes: MapNode[];
  edges: MapEdge[];
  /** The drawing's bounds, padded: x, y, width, height. */
  box: [number, number, number, number];
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

/** The map's nodes and edges, laid out. */
export function layoutMap(model: Model): AtlasMapLayout {
  const artifacts = [...model.graph.artifacts.values()].sort((a, b) => compareStrings(a.meta.id, b.meta.id));
  const index = new Map(artifacts.map((a, i) => [a.meta.id, i]));
  const seen = new Set<string>();
  const edges: MapEdge[] = [];
  for (const edge of [...model.graph.edges].sort(compareEdges)) {
    if (!index.has(edge.from) || !index.has(edge.to) || edge.from === edge.to) continue;
    const key = `${edge.kind}\u0000${edge.from}\u0000${edge.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ kind: edge.kind, from: edge.from, to: edge.to });
  }

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
  const steps = 300;
  const cell = k * 3;
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  for (let step = 0; step < steps; step++) {
    dx.fill(0);
    dy.fill(0);
    // Repulsion between nodes in the same or a neighbouring cell of a grid; beyond that it is negligible.
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
          for (const j of grid.get(`${gx},${gy}`) ?? []) {
            if (j <= i) continue;
            let ex = x[i] - x[j];
            let ey = y[i] - y[j];
            let d2 = ex * ex + ey * ey;
            // Only within one cell's width, so the force between two nodes never depends on which cells they are in.
            if (d2 > cell * cell) continue;
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

  const nodes: MapNode[] = artifacts.map((artifact, i) => {
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
      x: round(x[i]),
      y: round(y[i]),
      r: RADIUS[meta.type] ?? 5,
    };
  });
  const pad = 40;
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = n === 0 ? 0 : Math.min(...xs) - pad;
  const minY = n === 0 ? 0 : Math.min(...ys) - pad;
  // A label runs to the right of its node, about six units a character at the map's type size.
  const right = nodes.map((node) => node.x + node.r + 4 + node.id.length * 6);
  const width = n === 0 ? 2 * pad : Math.max(...right) - minX + pad;
  const height = n === 0 ? 2 * pad : Math.max(...ys) - minY + pad;
  return { nodes, edges, box: [round(minX), round(minY), round(width), round(height)] };
}

function compareEdges(a: Edge, b: Edge): number {
  return compareStrings(a.from, b.from) || compareStrings(a.to, b.to) || compareStrings(a.kind, b.kind);
}

/** Above this many records the labels show only on a record in focus, its links, or when zoomed in. */
export const LABEL_LIMIT = 120;

/**
 * The map as HTML: the controls (hidden until the script shows them, so a reader without it never meets a control
 * that does nothing), the SVG, and the panel the script fills. `root` is the prefix from the page to the Atlas's
 * root; `href` turns an Atlas path into the address the page links, so the site can serve its own.
 */
export function mapHtml(layout: AtlasMapLayout, root = "", href: (path: string) => string = (path) => path): string {
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
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
    '<div class="am-zoom"><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="reset">Fit</button></div>',
    "</div>",
  ];
  const [bx, by, bw, bh] = layout.box;
  const many = layout.nodes.length > LABEL_LIMIT ? " am-many" : "";
  const edges = layout.edges.map((edge) => {
    const a = byId.get(edge.from) as MapNode;
    const b = byId.get(edge.to) as MapNode;
    return `<line class="am-edge" data-from="${escapeHtml(a.id)}" data-to="${escapeHtml(b.id)}" data-g1="${a.group}" data-g2="${b.group}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"><title>${escapeHtml(`${a.id} ${edge.kind} ${b.id}`)}</title></line>`;
  });
  const nodes = layout.nodes.map((node) => {
    const words = [node.type, node.status, ...(node.evidence === null ? [] : [`evidence ${node.evidence.word}`])];
    const label = `${node.id}: ${node.title} (${words.join(", ")})`;
    const data =
      `class="am-node" data-id="${escapeHtml(node.id)}" data-group="${node.group}" data-type="${node.type}" ` +
      `data-status="${escapeHtml(node.status)}" data-title="${escapeHtml(node.title)}"` +
      (node.evidence === null
        ? ""
        : ` data-evidence="${escapeHtml(node.evidence.word)}" data-tone="${node.evidence.tone}"`);
    const shape =
      `<circle cx="${node.x}" cy="${node.y}" r="${node.r}"/>` +
      `<text x="${round(node.x + node.r + 3)}" y="${round(node.y + 3.5)}">${escapeHtml(node.id)}</text>` +
      `<title>${escapeHtml(label)}</title>`;
    return node.href === null
      ? `<g ${data} tabindex="0" aria-label="${escapeHtml(label)}">${shape}</g>`
      : `<a ${data} href="${escapeHtml(href(`${root}${node.href}`))}" aria-label="${escapeHtml(label)}">${shape}</a>`;
  });
  return [
    '<div class="am-map">',
    ...controls,
    `<svg class="am-svg${many}" viewBox="${bx} ${by} ${bw} ${bh}" role="group" aria-label="Map of ${layout.nodes.length} records and ${layout.edges.length} links">`,
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
.am-svg { display: block; width: 100%; height: min(75vh, 48rem); border: 1px solid var(--ms-border); border-radius: var(--ms-radius); background: var(--ms-surface); touch-action: none; }
.am-svg.am-grabbing { cursor: grabbing; }
.am-edge { stroke: var(--ms-border); stroke-width: 1; vector-effect: non-scaling-stroke; }
.am-node circle { fill: var(--am-meaning); stroke: var(--ms-surface); stroke-width: 1.5; }
.am-node text { font-size: 9px; fill: var(--ms-fg); cursor: pointer; paint-order: stroke; stroke: var(--ms-surface); stroke-width: 3px; }
.am-many .am-node text { display: none; }
.am-many.am-zoomed .am-node text, .am-focus .am-node.am-selected text, .am-focus .am-node.am-near text { display: inline; }
[data-group="purpose"] { --am-c: var(--am-purpose); } [data-group="meaning"] { --am-c: var(--am-meaning); }
[data-group="architecture"] { --am-c: var(--am-architecture); } [data-group="verification"] { --am-c: var(--am-verification); }
[data-group="knowledge"] { --am-c: var(--am-knowledge); }
.am-node circle, .am-swatch { fill: var(--am-c); background: var(--am-c); }
.am-node[data-status="draft"] circle { stroke: var(--am-c); stroke-dasharray: 2 1.5; fill-opacity: .35; }
.am-node[data-tone] circle { stroke-width: 3; }
.am-node[data-tone="success"] circle { stroke: var(--am-pass); }
.am-node[data-tone="danger"] circle { stroke: var(--am-fail); }
.am-node[data-tone="warn"] circle { stroke: var(--am-warn); }
.am-node[data-tone="neutral"] circle { stroke: var(--ms-muted, var(--ms-border)); }
.am-node:focus { outline: none; }
.am-node:focus-visible circle, .am-node.am-selected circle { stroke: var(--ms-fg); stroke-width: 3; }
.am-focus .am-node:not(.am-selected):not(.am-near), .am-focus .am-edge:not(.am-near) { opacity: .15; }
.am-focus .am-edge.am-near { stroke: var(--ms-fg); stroke-width: 1.5; }
.am-panel { margin-top: .5rem; padding: .75rem 1rem; border: 1px solid var(--ms-border); border-radius: var(--ms-radius); background: var(--ms-surface); }
.am-panel h3 { margin: 0 0 .25rem; font-size: 1rem; }
.am-panel ul { margin: .25rem 0 0; padding-left: 1.2rem; }
.am-panel button { font: inherit; background: none; border: 0; padding: 0; color: var(--ms-link, inherit); text-decoration: underline; cursor: pointer; }
.am-hide-purpose [data-group="purpose"], .am-hide-purpose .am-edge[data-g1="purpose"], .am-hide-purpose .am-edge[data-g2="purpose"],
.am-hide-meaning [data-group="meaning"], .am-hide-meaning .am-edge[data-g1="meaning"], .am-hide-meaning .am-edge[data-g2="meaning"],
.am-hide-architecture [data-group="architecture"], .am-hide-architecture .am-edge[data-g1="architecture"], .am-hide-architecture .am-edge[data-g2="architecture"],
.am-hide-verification [data-group="verification"], .am-hide-verification .am-edge[data-g1="verification"], .am-hide-verification .am-edge[data-g2="verification"],
.am-hide-knowledge [data-group="knowledge"], .am-hide-knowledge .am-edge[data-g1="knowledge"], .am-hide-knowledge .am-edge[data-g2="knowledge"] { display: none; }
`;
