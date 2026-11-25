/**
 * @intentset/help: the product side of publication §5. `intentset publish`
 * writes `help.json` beside the documents it publishes: every tip of every
 * published knowledge record, keyed by the ID of the behavior, rule or
 * capability it explains. A product's interface names the behavior each
 * control delivers (`data-behavior="BEH-..."`), and this package puts the tip
 * on the control.
 *
 * Nothing here decides who may see what. That was decided when the file was
 * published, for one audience, release, role, edition and set of flags; a
 * product serves each person the file published for their entitlement. This
 * package reads a file, checks its shape, and binds. No dependencies, no
 * network, no DOM of its own: the binder takes any root with `querySelectorAll`
 * and elements with `getAttribute`/`setAttribute`, which is a document, a
 * shadow root or a test double alike. `watchTips` also observes the root, with
 * a `MutationObserver` and a frame scheduler it can be given.
 */

export const HELP_PROFILE = "intentset/help/0.2";
/** The attribute a control carries to name the behavior it delivers. */
export const BEHAVIOR_ATTRIBUTE = "data-behavior";
/** Set on a bound control: the ID of the knowledge the tip came from, for a "learn more" link. */
export const KNOWLEDGE_ATTRIBUTE = "data-help-knowledge";
/** Set on a bound control by the default render: the tip's text, for a product's own tooltip to read. */
export const TIP_ATTRIBUTE = "data-help-tip";

const ID_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const VISIBILITIES = ["public", "customer", "internal", "restricted"] as const;

export interface HelpKnowledge {
  id: string;
  title: string;
  /** `<ID>.md`, the published document, relative to wherever the publication is served. */
  path: string;
}

export interface HelpTip {
  /** One sentence of plain text, as written on the knowledge record. */
  text: string;
  /** The ID of the knowledge the tip came from; one of `Help.knowledge`. */
  knowledge: string;
}

/** `help.json` as spec/publication.md §5 defines it. */
export interface Help {
  profile: typeof HELP_PROFILE;
  derived: true;
  projection: (typeof VISIBILITIES)[number];
  /** Only in a file written before 0.15.0: a publication names its snapshot in `snapshot.json` (publication §6). */
  snapshot?: { commit: string | null; graphHash: string };
  audience: string;
  availability: { product: string; release: string; role: string; edition: string; flags: string[] };
  publishedAt: string;
  knowledge: HelpKnowledge[];
  tips: Record<string, HelpTip>;
}

export type ReadHelpResult = { ok: true; help: Help; problems: [] } | { ok: false; help: null; problems: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Read a help file: JSON text, bytes, or an already parsed value. Every
 * problem is listed, and a file with any problem is not returned, so a product
 * never binds half a file: the previous one it holds stays in place.
 */
export function readHelp(input: string | Uint8Array | unknown): ReadHelpResult {
  let value: unknown = input;
  if (input instanceof Uint8Array) value = new TextDecoder("utf-8", { fatal: true }).decode(input);
  if (str(value)) {
    try {
      value = JSON.parse(value);
    } catch (error) {
      return {
        ok: false,
        help: null,
        problems: [`not JSON: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }
  const problems: string[] = [];
  if (!isRecord(value)) return { ok: false, help: null, problems: ["the help file is not a JSON object"] };
  if (value.profile !== HELP_PROFILE) {
    problems.push(`profile is ${JSON.stringify(value.profile)}, not ${HELP_PROFILE}`);
  }
  if (value.derived !== true) problems.push("derived is not true");
  if (!str(value.projection) || !(VISIBILITIES as readonly string[]).includes(value.projection)) {
    problems.push("projection is not one of public, customer, internal, restricted");
  }
  const snapshot = value.snapshot;
  if (
    snapshot !== undefined &&
    (!isRecord(snapshot) || !(snapshot.commit === null || str(snapshot.commit)) || !str(snapshot.graphHash))
  ) {
    problems.push("snapshot, when present, must carry commit (a string or null) and graphHash");
  }
  if (!str(value.audience)) problems.push("audience must be a string");
  const availability = value.availability;
  if (
    !isRecord(availability) ||
    !["product", "release", "role", "edition"].every((key) => str(availability[key])) ||
    !Array.isArray(availability.flags) ||
    !availability.flags.every(str)
  ) {
    problems.push("availability must carry product, release, role, edition and a list of flags");
  }
  if (!str(value.publishedAt)) problems.push("publishedAt must be a string");

  const known = new Set<string>();
  if (!Array.isArray(value.knowledge)) problems.push("knowledge must be a list");
  else {
    let previous: string | null = null;
    value.knowledge.forEach((entry, i) => {
      if (!isRecord(entry) || !str(entry.id) || !str(entry.title) || !str(entry.path)) {
        problems.push(`knowledge[${i}] must carry id, title and path`);
        return;
      }
      if (!ID_PATTERN.test(entry.id)) problems.push(`knowledge[${i}].id ${JSON.stringify(entry.id)} is not an ID`);
      if (previous !== null && entry.id <= previous) problems.push(`knowledge is not sorted by id at ${entry.id}`);
      previous = entry.id;
      known.add(entry.id);
    });
  }
  if (!isRecord(value.tips)) problems.push("tips must be an object keyed by ID");
  else {
    for (const key of Object.keys(value.tips)) {
      if (!ID_PATTERN.test(key)) problems.push(`tips key ${JSON.stringify(key)} is not an ID`);
      const tip = value.tips[key];
      if (!isRecord(tip) || !str(tip.text) || !str(tip.knowledge)) {
        problems.push(`tips.${key} must carry text and knowledge`);
        continue;
      }
      if (tip.text.trim() === "") problems.push(`tips.${key} has an empty text`);
      if (!known.has(tip.knowledge))
        problems.push(`tips.${key} names knowledge ${tip.knowledge}, which the file does not list`);
    }
  }
  if (problems.length > 0) return { ok: false, help: null, problems };
  return { ok: true, help: value as unknown as Help, problems: [] };
}

/** A tip with the ID it was asked for and the knowledge entry it points at. */
export interface Tip extends HelpTip {
  id: string;
  article: HelpKnowledge | null;
}

/** The tip for one behavior, rule or capability, or null when the file has none. */
export function tipFor(help: Help, id: string): Tip | null {
  const tip = Object.hasOwn(help.tips, id) ? help.tips[id] : undefined;
  if (tip === undefined) return null;
  return { id, ...tip, article: help.knowledge.find((entry) => entry.id === tip.knowledge) ?? null };
}

export interface PageHelp {
  /** The tips found, in the order the IDs were given, each ID once. */
  tips: Tip[];
  /** The knowledge those tips come from, each once, sorted by ID: what a page's help panel lists. */
  knowledge: HelpKnowledge[];
  /** IDs with no tip, each once, in the order given: the coverage a product has yet to write. */
  missing: string[];
}

/** What a page can show for the behaviors on it: its tips, the articles behind them, and what has no tip yet. */
export function helpForPage(help: Help, ids: Iterable<string>): PageHelp {
  const seen = new Set<string>();
  const tips: Tip[] = [];
  const missing: string[] = [];
  const articles = new Map<string, HelpKnowledge>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const tip = tipFor(help, id);
    if (tip === null) missing.push(id);
    else {
      tips.push(tip);
      if (tip.article !== null) articles.set(tip.article.id, tip.article);
    }
  }
  return {
    tips,
    knowledge: [...articles.keys()].sort().map((id) => articles.get(id) as HelpKnowledge),
    missing,
  };
}

/** The part of an element the binder uses: a DOM Element satisfies it, and so does a test double. */
export interface TipElement {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  hasAttribute(name: string): boolean;
}

/** The part of a document, shadow root or container element the binder uses. */
export interface TipRoot {
  querySelectorAll(selectors: string): Iterable<TipElement> | ArrayLike<TipElement>;
}

export interface BindOptions {
  /** The attribute naming each control's behavior; `data-behavior` by default. */
  attribute?: string;
  /**
   * How a tip is put on its control. The default sets `data-help-tip` to the
   * tip's text and `data-help-knowledge` to the knowledge ID, and nothing a
   * browser displays: a `title` shows only on mouse hover, never to keyboard or
   * touch users, and screen readers announce it inconsistently. A product
   * supplies the visible tooltip and the accessible description through
   * `render`, with its own tooltip component or an `aria-describedby` pointing
   * at an element that holds the text.
   */
  render?: (element: TipElement, tip: Tip) => void;
}

export interface Binding {
  /** The IDs bound, each once, in document order. */
  bound: string[];
  /** The IDs found on controls that the file has no tip for, each once, in document order. */
  missing: string[];
}

function defaultRender(element: TipElement, tip: Tip): void {
  element.setAttribute(TIP_ATTRIBUTE, tip.text);
  element.setAttribute(KNOWLEDGE_ATTRIBUTE, tip.knowledge);
}

interface Found<E> {
  element: E;
  tip: Tip | null;
}

/** One pass over `root`: each control that names a behavior, with its tip or null, in document order. */
function scan<E extends TipElement>(
  root: { querySelectorAll(selectors: string): Iterable<E> | ArrayLike<E> },
  help: Help,
  attribute: string,
): { found: Found<E>[]; binding: Binding } {
  const found: Found<E>[] = [];
  const bound: string[] = [];
  const missing: string[] = [];
  for (const element of Array.from(root.querySelectorAll(`[${attribute}]`) as ArrayLike<E>)) {
    const id = element.getAttribute(attribute);
    if (id === null || id === "") continue;
    const tip = tipFor(help, id);
    found.push({ element, tip });
    if (tip === null) {
      if (!missing.includes(id)) missing.push(id);
    } else if (!bound.includes(id)) bound.push(id);
  }
  return { found, binding: { bound, missing } };
}

/**
 * Put each tip on every control under `root` that names its behavior, once.
 * Run it after the interface renders, and again after it changes; binding is
 * idempotent. The result says what was bound and what has no tip yet, which is
 * the coverage a product reports. `watchTips` rebinds for a product that does
 * not drive binding itself.
 */
export function bindTips(root: TipRoot, help: Help, options: BindOptions = {}): Binding {
  const render = options.render ?? defaultRender;
  const { found, binding } = scan(root, help, options.attribute ?? BEHAVIOR_ATTRIBUTE);
  for (const { element, tip } of found) if (tip !== null) render(element, tip);
  return binding;
}

/** The part of an element `watchTips` uses: what `bindTips` uses, and `removeAttribute` to undo the default render. */
export interface WatchElement extends TipElement {
  removeAttribute(name: string): void;
}

/** The part of a document, shadow root or container element `watchTips` uses; it is also what is observed. */
export interface WatchRoot {
  querySelectorAll(selectors: string): Iterable<WatchElement> | ArrayLike<WatchElement>;
}

/** The part of a `MutationObserver` `watchTips` uses. */
export interface TipObserver {
  observe(
    target: WatchRoot,
    options: { subtree: boolean; childList: boolean; attributes: boolean; attributeFilter: string[] },
  ): void;
  disconnect(): void;
}

export interface WatchOptions extends BindOptions {
  /**
   * Undoes `render` for one element: when the element stops naming that
   * behavior, leaves `root`, or the watch is disposed. Without it, the default
   * attributes, `data-help-tip` and `data-help-knowledge`, are removed.
   */
  unrender?: (element: TipElement, tip: Tip) => void;
  /** What watches `root`; `globalThis.MutationObserver` by default. */
  MutationObserver?: new (
    callback: () => void,
  ) => TipObserver;
  /** Schedules the next pass; `globalThis.requestAnimationFrame` by default, so changes batch to one pass per frame. */
  requestFrame?: (callback: () => void) => unknown;
  /** Cancels a scheduled pass on dispose; `globalThis.cancelAnimationFrame` by default, when there is one. */
  cancelFrame?: (handle: unknown) => void;
}

export interface TipWatch {
  /** What the last pass bound and found no tip for, as `bindTips` reports it; empty after `dispose`. */
  coverage(): Binding;
  /** Stops watching, cancels a pending pass and unrenders every element it bound. Calling it again does nothing. */
  dispose(): void;
}

function defaultUnrender(element: TipElement): void {
  (element as WatchElement).removeAttribute(TIP_ATTRIBUTE);
  (element as WatchElement).removeAttribute(KNOWLEDGE_ATTRIBUTE);
}

/**
 * Bind once, then again whenever the DOM under `root` changes, batched to one
 * pass per animation frame, until `dispose`. It binds only under `root`, so it
 * can be mounted into another application's page, and `dispose` leaves that
 * page's DOM as it found it: every element it bound is unrendered. An element
 * already bound to the same tip is not rendered again; one whose behavior
 * changed, or that left `root`, is unrendered first.
 */
export function watchTips(root: WatchRoot, help: Help, options: WatchOptions = {}): TipWatch {
  const attribute = options.attribute ?? BEHAVIOR_ATTRIBUTE;
  const render = options.render ?? defaultRender;
  const unrender = options.unrender ?? defaultUnrender;
  const scope = globalThis as unknown as {
    MutationObserver?: new (callback: () => void) => TipObserver;
    requestAnimationFrame?: (callback: () => void) => unknown;
    cancelAnimationFrame?: (handle: unknown) => void;
  };
  const Observer = options.MutationObserver ?? scope.MutationObserver;
  const requestFrame = options.requestFrame ?? scope.requestAnimationFrame?.bind(globalThis);
  const cancelFrame = options.cancelFrame ?? scope.cancelAnimationFrame?.bind(globalThis);
  if (Observer === undefined) throw new TypeError("watchTips needs a MutationObserver: pass options.MutationObserver");
  if (requestFrame === undefined)
    throw new TypeError("watchTips needs requestAnimationFrame: pass options.requestFrame");

  const bound = new Map<WatchElement, Tip>();
  let coverage: Binding = { bound: [], missing: [] };
  let pending = false;
  let handle: unknown;
  let disposed = false;

  const pass = () => {
    pending = false;
    if (disposed) return;
    const { found, binding } = scan(root, help, attribute);
    const current = new Map<WatchElement, Tip>();
    for (const { element, tip } of found) if (tip !== null && !current.has(element)) current.set(element, tip);
    for (const [element, tip] of bound) {
      if (current.get(element)?.id === tip.id) continue;
      unrender(element, tip);
      bound.delete(element);
    }
    for (const [element, tip] of current) {
      if (bound.has(element)) continue;
      render(element, tip);
      bound.set(element, tip);
    }
    coverage = binding;
  };

  const observer = new Observer(() => {
    if (disposed || pending) return;
    pending = true;
    handle = requestFrame(pass);
  });
  pass();
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: [attribute] });

  return {
    coverage: () => ({ bound: [...coverage.bound], missing: [...coverage.missing] }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      if (pending && cancelFrame !== undefined) cancelFrame(handle);
      pending = false;
      for (const [element, tip] of bound) unrender(element, tip);
      bound.clear();
      coverage = { bound: [], missing: [] };
    },
  };
}
