/**
 * The Atlas's chart engine, handed to render-html's `charts` option (Markset §11 lets a host supply one). A horizontal
 * bar chart draws the way Markset's built-in engine does, with the same classes and tokens, except that its figure
 * grows with the number of categories: each category gets a row tall enough for its label and its bars, and the
 * category axis is as wide as the longest label, so a model with dozens of capabilities draws a tall figure a reader can
 * read rather than a fixed-height one whose labels overlap and whose bars are hairlines. Every other chart type is the
 * built-in engine's. Like it, the engine emits no color and no markup, only constructed nodes, and the figure's table
 * stays on the page beside it (§11 obligation 8), so every category and value is there in full whatever the picture
 * shows.
 *
 * The geometry is arithmetic on counts and label lengths, so the same table gives the same bytes.
 */
import { builtInChartEngine, type ChartEngine } from "@markset-lang/render-html";

type Data = Parameters<ChartEngine>[1];
type Drawn = NonNullable<ReturnType<ChartEngine>>;
type Properties = Drawn["properties"];

const W = 720;
const PAD = { top: 16, right: 20, bottom: 40, left: 56 };
const LEGEND_H = 28;
const TICKS = 5;
const BAR_MAX = 24;
const BAR_GAP = 2;
/** A bar's least thickness, and the room a row keeps above and below its bars. */
const BAR_MIN = 8;
const ROW_AIR = 8;
/** The plot's height at which a chart of few categories stops spreading them out, as Markset's own does. */
const PLOT_FIT = 256;
/** Above this many categories the figure is tall enough that the value axis repeats on top and rows are ruled. */
const TALL = 12;
/** A label's width, estimated at 8 units a character: IDs are upper case, the widest letters, and a clipped first letter is the one outcome not allowed. */
const widthOf = (label: string) => label.length * 8;

const el = (tagName: string, properties: Properties, children: Drawn["children"] = []): Drawn =>
  ({ type: "element", tagName, properties, children }) as Drawn;
const text = (value: string) => ({ type: "text", value }) as Drawn["children"][number];

function format(n: number): string {
  const [whole, fraction] = Math.abs(n).toString().split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n < 0 ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}

/** Axis bounds on round numbers, from zero, stepping 1, 2 or 5 times a power of ten. */
function scale(values: number[]): { min: number; max: number; step: number } {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  if (lo === hi) return { min: Math.min(0, lo), max: hi + 1, step: 1 };
  const raw = (hi - lo) / TICKS;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;
  return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step };
}

function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w, h / 2);
  if (h <= 0 || w <= 0) return "";
  return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z`;
}

/** The figure's height for a bar chart of this many categories and series: what `barChart` draws, exposed for tests. */
export function barRowHeight(categories: number, series: number): number {
  const marks = Math.max(1, series);
  const least = marks * BAR_MIN + (marks - 1) * BAR_GAP + ROW_AIR;
  return Math.max(least, PLOT_FIT / Math.max(1, categories));
}

function barChart(data: Data): Drawn | null {
  const series = data.series.filter((s) => s.values.some((v) => v !== null));
  if (series.length === 0 || data.categories.length === 0) return null;
  const n = data.categories.length;
  const marks = series.length;
  const legend = marks > 1;
  const tall = n > TALL;
  // A tall figure repeats the value axis above its plot, so the plot starts a line lower.
  const top = PAD.top + (legend ? LEGEND_H : 0) + (tall ? 16 : 0);
  const s = scale(series.flatMap((x) => x.values.filter((v): v is number => v !== null)));
  // The category axis is as wide as its longest label, up to half the figure; a label past that is cut in the middle,
  // never at an end, so two labels with the same start still differ.
  const cap = W / 2 - 14;
  const labels = data.categories.map((name) => (widthOf(name) <= cap ? name : middle(name, Math.floor(cap / 8))));
  const gutter = Math.max(PAD.left, ...labels.map((name) => widthOf(name) + 14));
  const rightPad = Math.max(PAD.right, widthOf(format(s.max)) / 2 + 4);
  const band = barRowHeight(n, marks);
  const plot = { x: gutter, y: top, w: W - gutter - rightPad, h: band * n };
  const height = top + plot.h + PAD.bottom;
  const valueAt = (v: number) => plot.x + ((v - s.min) / (s.max - s.min)) * plot.w;
  const thickness = Math.max(1, Math.min(BAR_MAX, (band * 0.7 - BAR_GAP * (marks - 1)) / marks));
  const children: Drawn[] = [];

  const grid: Drawn[] = [];
  for (let i = 0; s.min + i * s.step <= s.max + s.step / 1000; i++) {
    const t = s.min + i * s.step;
    const at = valueAt(t);
    grid.push(el("line", { class: "ms-chart-grid", x1: at, y1: plot.y, x2: at, y2: plot.y + plot.h }));
    grid.push(
      el("text", { class: "ms-chart-tick", x: at, y: plot.y + plot.h + 16, "text-anchor": "middle" }, [
        text(format(t)),
      ]),
    );
    // A tall figure repeats the value axis above it, so a reader at the top rows has numbers to read against.
    if (tall) {
      grid.push(
        el("text", { class: "ms-chart-tick", x: at, y: plot.y - 8, "text-anchor": "middle" }, [text(format(t))]),
      );
    }
  }
  // A tall figure rules its rows lightly, so the eye can follow a long label across to its bars.
  if (tall) {
    for (let i = 1; i < n; i++) {
      const y = plot.y + band * i;
      grid.push(el("line", { class: "ms-chart-grid", x1: plot.x - gutter + 8, y1: y, x2: plot.x + plot.w, y2: y }));
    }
  }
  children.push(el("g", { class: "ms-chart-axis" }, grid));
  children.push(
    el(
      "g",
      { class: "ms-chart-axis" },
      labels.map((name, i) =>
        el(
          "text",
          { class: "ms-chart-tick", x: plot.x - 8, y: plot.y + band * i + band / 2 + 4, "text-anchor": "end" },
          [text(name)],
        ),
      ),
    ),
  );
  const zero = valueAt(Math.max(s.min, Math.min(0, s.max)));
  children.push(el("line", { class: "ms-chart-baseline", x1: zero, y1: plot.y, x2: zero, y2: plot.y + plot.h }));

  series.forEach((one, si) => {
    const slot = (si % 8) + 1;
    one.values.forEach((v, i) => {
      if (v === null) return;
      const group = marks * thickness + (marks - 1) * BAR_GAP;
      const at = plot.y + band * i + (band - group) / 2 + si * (thickness + BAR_GAP);
      const to = valueAt(v);
      const d = barPath(Math.min(zero, to), at, Math.abs(to - zero), thickness);
      if (d) children.push(el("path", { class: "ms-chart-bar", "data-series": slot, d }));
    });
  });

  if (legend) {
    const items: Drawn[] = [];
    let x = PAD.left;
    series.forEach((one, si) => {
      const slot = (si % 8) + 1;
      items.push(el("rect", { class: "ms-chart-key", "data-series": slot, x, y: PAD.top + 4, width: 10, height: 10 }));
      items.push(el("text", { class: "ms-chart-legend", x: x + 16, y: PAD.top + 13 }, [text(one.name)]));
      x += 16 + one.name.length * 7.5 + 20;
    });
    children.push(el("g", {}, items));
  }

  return el(
    "svg",
    {
      class: "ms-chart",
      "data-chart": "bar",
      viewBox: `0 0 ${W} ${height}`,
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true",
    },
    children,
  );
}

/** A label cut to at most `max` characters by dropping its middle, keeping its start and its end. */
export function middle(label: string, max: number): string {
  if (label.length <= max) return label;
  const keep = Math.max(2, max - 1);
  const tail = Math.floor(keep / 2);
  return `${label.slice(0, keep - tail)}…${label.slice(label.length - tail)}`;
}

export const atlasChartEngine: ChartEngine = (type, data) =>
  type === "bar" ? barChart(data) : builtInChartEngine(type, data);
