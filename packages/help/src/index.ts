/**
 * @intentset/help: the product side of publication §5. `intentset publish`
 * writes `help.json` beside the documents it publishes: every tip of every
 * published knowledge record, keyed by the ID of the behavior, rule or
 * capability it explains. A product's interface names the behavior each
 * control delivers (`data-behavior="BEH-..."`), and this package puts the tip
 * on the control.
 *
 * Nothing here decides who may see what. That was decided when the file was
 * published, for one reader: every audience, role and flag it names, on one
 * product, release and edition. Those lists are held all-of, so serve the
 * file only where `servedTo` holds for the person (publication §1, ADR 0029).
 * This package reads a file, checks its shape, and binds. No dependencies, no
 * network, no DOM of its own: the binder takes any root with `querySelectorAll`
 * and elements with `getAttribute`/`setAttribute`, which is a document, a
 * shadow root or a test double alike. `watchTips` also observes the root, with
 * a `MutationObserver` and a frame scheduler it can be given.
 *
 * A publication may keep knowledge under review (publication §3, ADR 0027):
 * published from its last reviewed text while what it explains has changed.
 * Its entry, and each tip it contributes, carries `underReview: true`, and a
 * rule's tip from it is held back, listed in `withheldForReview`. Every reader
 * here leaves help under review out unless it is given
 * `underReviewHelp: "include"`, because a product's own renderer may not show
 * the mark, and a runtime that shows an item under review MUST show that it
 * is. Either way the ID goes to `pendingReview`, never to `missing`.
 *
 * A file also maps each surface of the product (a page, route, panel or
 * module, named by an ID the product chooses) to the articles that lead it,
 * in order (VSA §3, ADR 0028). `leadFor`, `surfaceHelp` and `helpForPage`'s
 * `surface` option read it; a surface the file does not list has no lead.
 */

export const HELP_PROFILE = "intentset/help/0.4";
/** The attribute a control carries to name the behavior it delivers. */
export const BEHAVIOR_ATTRIBUTE = "data-behavior";
/** Set on a bound control: the ID of the knowledge the tip came from, for a "learn more" link. */
export const KNOWLEDGE_ATTRIBUTE = "data-help-knowledge";
/** Set on a bound control by the default render: the tip's text, for a product's own tooltip to read. */
export const TIP_ATTRIBUTE = "data-help-tip";
/** Set to `"true"` on a bound control by the default render when its tip is under review, for the product to show. */
export const UNDER_REVIEW_ATTRIBUTE = "data-help-under-review";
/** The directory a document kept under review is published in. */
const UNDER_REVIEW_DIR = "under-review/";

const ID_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
/**
 * A surface ID (VSA §3): 1 to 200 printable ASCII characters other than `"`, `'`, `<`, `>`, `\` and the backtick,
 * never digits only (`SURFACE_ID_DIGITS`) and never `__proto__`. Copied from `@intentset/core`, which this package
 * does not import; a test holds the sources equal.
 */
// biome-ignore lint/complexity/noUselessEscapeInRegex: the pattern is VSA §3's, character for character.
export const SURFACE_ID_PATTERN = /^[!#-&(-;=?-\[\]-_a-~]{1,200}$/;
export const SURFACE_ID_DIGITS = /^[0-9]+$/;

function isSurfaceId(key: string): boolean {
  return SURFACE_ID_PATTERN.test(key) && !SURFACE_ID_DIGITS.test(key) && key !== "__proto__";
}
const VISIBILITIES = ["public", "customer", "internal", "restricted"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export interface HelpKnowledge {
  id: string;
  title: string;
  /**
   * `<ID>.md`, the published document, relative to wherever the publication is served, or `under-review/<ID>.md`
   * for a document kept under review.
   */
  path: string;
  /** Present, and `true`, only on a document kept under review. */
  underReview?: true;
}

export interface HelpTip {
  /** One sentence of plain text, as written on the knowledge record. */
  text: string;
  /** The ID of the knowledge the tip came from; one of `Help.knowledge`. */
  knowledge: string;
  /** Present, and `true`, exactly when the knowledge it came from is kept under review. */
  underReview?: true;
}

/** The articles that lead one surface, in the order its slice declares them: each one of `Help.knowledge`. */
export interface HelpSurface {
  knowledge: string[];
}

/** `help.json` as spec/publication.md §5 defines it. */
export interface Help {
  profile: typeof HELP_PROFILE;
  derived: true;
  projection: Visibility;
  /** Every audience the reader is in, sorted without repeats. */
  audience: string[];
  /** The reader's product, release and edition, and every role and flag the reader holds, sorted without repeats. */
  availability: { product: string; release: string; role: string[]; edition: string; flags: string[] };
  publishedAt: string;
  knowledge: HelpKnowledge[];
  /** By surface ID, sorted: the articles published for this reader that lead each surface. */
  surfaces: Record<string, HelpSurface>;
  tips: Record<string, HelpTip>;
  /** Rule IDs whose tip was held back because its document is kept under review, sorted: never coverage to write. */
  withheldForReview: string[];
}

/** Whether a reader returns help under review, marked (`include`), or leaves it out (`exclude`, the default). */
export type UnderReviewHelp = "include" | "exclude";

/** How a reader treats help under review. */
export interface ReviewOptions {
  /** `exclude` by default: a product whose renderer shows the mark passes `include`. */
  underReviewHelp?: UnderReviewHelp;
}

/** The options `helpForPage` takes. */
export interface PageOptions extends ReviewOptions {
  /** The surface the page is, whose lead articles are listed first (ADR 0028). */
  surface?: string;
}

/** Where a control's help stands: a current tip, a tip under review, a rule tip held back, or none. */
export type ReviewState = "current" | "under-review" | "held-back" | "none";

export type ReadHelpResult = { ok: true; help: Help; problems: [] } | { ok: false; help: null; problems: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): value is string {
  return typeof value === "string";
}

/** A list of strings in strictly ascending code-unit order, so sorted and without repeats; non-empty unless allowed. */
function sortedList(value: unknown, allowEmpty: boolean): value is string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || !value.every(str)) return false;
  return value.every((member, i) => i === 0 || (value[i - 1] as string) < member);
}

/** The members publication §5's table gives each object of the file: a reader refuses any other (help/0.3 is closed). */
const MEMBERS = {
  file: [
    "profile",
    "derived",
    "projection",
    "audience",
    "availability",
    "publishedAt",
    "knowledge",
    "surfaces",
    "tips",
    "withheldForReview",
  ],
  availability: ["product", "release", "role", "edition", "flags"],
  knowledge: ["id", "title", "path", "underReview"],
  surface: ["knowledge"],
  tip: ["text", "knowledge", "underReview"],
} as const;

function unknownMembers(
  value: Record<string, unknown>,
  members: readonly string[],
  where: string,
  out: string[],
): void {
  for (const key of Object.keys(value).sort()) {
    if (!members.includes(key)) out.push(`${where} has a member ${JSON.stringify(key)} the help file does not define`);
  }
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
  unknownMembers(value, MEMBERS.file, "the file", problems);
  for (const key of MEMBERS.file) {
    if (!Object.hasOwn(value, key)) problems.push(`the file has no ${key}`);
  }
  if (value.profile !== HELP_PROFILE) {
    problems.push(`profile is ${JSON.stringify(value.profile)}, not ${HELP_PROFILE}`);
  }
  if (value.derived !== true) problems.push("derived is not true");
  if (!str(value.projection) || !(VISIBILITIES as readonly string[]).includes(value.projection)) {
    problems.push("projection is not one of public, customer, internal, restricted");
  }
  if (!sortedList(value.audience, false)) {
    problems.push("audience must be a non-empty list of strings, sorted, without repeats");
  }
  const availability = value.availability;
  if (isRecord(availability)) unknownMembers(availability, MEMBERS.availability, "availability", problems);
  if (
    !isRecord(availability) ||
    !["product", "release", "edition"].every((key) => str(availability[key])) ||
    !sortedList(availability.role, false) ||
    !sortedList(availability.flags, true)
  ) {
    problems.push(
      "availability must carry product, release and edition, a non-empty sorted list of roles without repeats, and a sorted list of flags without repeats",
    );
  }
  if (!str(value.publishedAt)) problems.push("publishedAt must be a string");

  const known = new Set<string>();
  const marked = new Set<string>();
  if (!Array.isArray(value.knowledge)) problems.push("knowledge must be a list");
  else {
    let previous: string | null = null;
    value.knowledge.forEach((entry, i) => {
      if (!isRecord(entry) || !str(entry.id) || !str(entry.title) || !str(entry.path)) {
        problems.push(`knowledge[${i}] must carry id, title and path`);
        return;
      }
      unknownMembers(entry, MEMBERS.knowledge, `knowledge[${i}]`, problems);
      if (!ID_PATTERN.test(entry.id)) problems.push(`knowledge[${i}].id ${JSON.stringify(entry.id)} is not an ID`);
      if (previous !== null && entry.id <= previous) problems.push(`knowledge is not sorted by id at ${entry.id}`);
      previous = entry.id;
      known.add(entry.id);
      if (Object.hasOwn(entry, "underReview")) {
        if (entry.underReview !== true) problems.push(`knowledge[${i}].underReview is present and not true`);
        else {
          marked.add(entry.id);
          if (!entry.path.startsWith(UNDER_REVIEW_DIR)) {
            problems.push(`knowledge[${i}] is under review and its path does not begin with ${UNDER_REVIEW_DIR}`);
          }
        }
      }
    });
  }
  if (!isRecord(value.surfaces)) problems.push("surfaces must be an object keyed by surface ID");
  else {
    for (const key of Object.keys(value.surfaces)) {
      const where = `surfaces[${JSON.stringify(key)}]`;
      if (!isSurfaceId(key)) problems.push(`surfaces key ${JSON.stringify(key)} is not a surface ID`);
      const surface = value.surfaces[key];
      if (!isRecord(surface)) {
        problems.push(`${where} must carry knowledge`);
        continue;
      }
      unknownMembers(surface, MEMBERS.surface, where, problems);
      const list = surface.knowledge;
      if (!Array.isArray(list) || list.length === 0 || !list.every(str)) {
        problems.push(`${where}.knowledge must be a non-empty list of IDs`);
        continue;
      }
      if (new Set(list).size !== list.length) problems.push(`${where}.knowledge repeats an ID`);
      for (const id of list) {
        if (!known.has(id)) problems.push(`${where} names knowledge ${id}, which the file does not list`);
      }
    }
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
      unknownMembers(tip, MEMBERS.tip, `tips.${key}`, problems);
      if (tip.text.trim() === "") problems.push(`tips.${key} has an empty text`);
      if (!known.has(tip.knowledge))
        problems.push(`tips.${key} names knowledge ${tip.knowledge}, which the file does not list`);
      if (Object.hasOwn(tip, "underReview") && tip.underReview !== true) {
        problems.push(`tips.${key}.underReview is present and not true`);
      } else if ((tip.underReview === true) !== marked.has(tip.knowledge)) {
        problems.push(
          tip.underReview === true
            ? `tips.${key} is under review and knowledge ${tip.knowledge} is not`
            : `tips.${key} is not under review and knowledge ${tip.knowledge} is`,
        );
      }
    }
  }
  if (!sortedList(value.withheldForReview, true)) {
    problems.push("withheldForReview must be a list of strings, sorted, without repeats");
  } else {
    for (const id of value.withheldForReview) {
      if (!ID_PATTERN.test(id)) problems.push(`withheldForReview names ${JSON.stringify(id)}, which is not an ID`);
      if (isRecord(value.tips) && Object.hasOwn(value.tips, id)) {
        problems.push(`withheldForReview names ${id}, which is also a key of tips`);
      }
    }
  }
  if (problems.length > 0) return { ok: false, help: null, problems };
  return { ok: true, help: value as unknown as Help, problems: [] };
}

/**
 * A person a product may serve a publication to: the visibilities they are cleared for, every audience they are in,
 * every role and flag they hold, and the product, release and edition they are on.
 */
export interface Reader {
  visibilities: readonly Visibility[];
  audiences: readonly string[];
  roles: readonly string[];
  product: string;
  release: string;
  edition: string;
  flags: readonly string[];
}

/**
 * Whether a help file, or a document's publication block, may be served to this reader (publication §1, ADR 0029):
 * its projection is among the reader's visibilities, its product, release and edition are the reader's, and the
 * reader holds every audience, role and flag it names. The lists are held all-of, never read as "any of": a file
 * published for the roles administrator and teacher is not for a reader who holds only one of them.
 */
export function servedTo(file: Pick<Help, "projection" | "audience" | "availability">, reader: Reader): boolean {
  const { availability } = file;
  const holds = (named: unknown, held: readonly string[]) =>
    Array.isArray(named) && named.every((value) => held.includes(value));
  // An empty audience or role list names nothing to hold, which every() would read as "anyone": fail closed instead
  // (publication §1 forbids an empty one, and a block reaches here without readHelp's checks). Flags may be empty.
  const nonEmpty = (named: unknown) => Array.isArray(named) && named.length > 0;
  return (
    reader.visibilities.includes(file.projection) &&
    availability.product === reader.product &&
    availability.release === reader.release &&
    availability.edition === reader.edition &&
    nonEmpty(file.audience) &&
    holds(file.audience, reader.audiences) &&
    nonEmpty(availability.role) &&
    holds(availability.role, reader.roles) &&
    holds(availability.flags, reader.flags)
  );
}

/** A tip with the ID it was asked for and the knowledge entry it points at. */
export interface Tip extends HelpTip {
  id: string;
  article: HelpKnowledge | null;
}

/** Where the help for one control ID stands (publication §5): a coverage report counts `held-back` as written. */
export function reviewStateFor(help: Help, id: string): ReviewState {
  const tip = Object.hasOwn(help.tips, id) ? help.tips[id] : undefined;
  if (tip !== undefined) return tip.underReview === true ? "under-review" : "current";
  return help.withheldForReview.includes(id) ? "held-back" : "none";
}

function including(options: ReviewOptions | undefined): boolean {
  return options?.underReviewHelp === "include";
}

/**
 * The tip for one behavior, rule or capability, or null when the file has none, when its rule tip was held back, or,
 * unless `underReviewHelp` is `include`, when it is under review. Null cannot tell those apart: a coverage report
 * uses `reviewStateFor`, `helpForPage` or a `Binding`, never `tipFor` alone.
 */
export function tipFor(help: Help, id: string, options?: ReviewOptions): Tip | null {
  const tip = Object.hasOwn(help.tips, id) ? help.tips[id] : undefined;
  if (tip === undefined) return null;
  if (tip.underReview === true && !including(options)) return null;
  return { id, ...tip, article: help.knowledge.find((entry) => entry.id === tip.knowledge) ?? null };
}

/**
 * The file's articles, honouring `underReviewHelp`: under `exclude` an article under review is left out. Either way
 * its ID is in `pendingReview`, sorted.
 */
export function articles(help: Help, options?: ReviewOptions): { knowledge: HelpKnowledge[]; pendingReview: string[] } {
  const pendingReview = help.knowledge.filter((entry) => entry.underReview === true).map((entry) => entry.id);
  const knowledge = including(options) ? [...help.knowledge] : help.knowledge.filter((entry) => !entry.underReview);
  return { knowledge, pendingReview };
}

/**
 * The articles that lead a surface, in order (ADR 0028), honouring `underReviewHelp`: under `exclude` an article under
 * review is left out, and `pendingReview` names it in either mode, in declared order. A surface the file does not list
 * has an empty `lead` and `pendingReview`.
 */
export function surfaceHelp(
  help: Help,
  surface: string,
  options?: ReviewOptions,
): { lead: HelpKnowledge[]; pendingReview: string[] } {
  const entry = Object.hasOwn(help.surfaces, surface) ? help.surfaces[surface] : undefined;
  const lead: HelpKnowledge[] = [];
  const pendingReview: string[] = [];
  for (const id of entry?.knowledge ?? []) {
    const article = help.knowledge.find((candidate) => candidate.id === id);
    if (article === undefined) continue;
    if (article.underReview === true) {
      pendingReview.push(id);
      if (!including(options)) continue;
    }
    lead.push(article);
  }
  return { lead, pendingReview };
}

/**
 * The articles that lead a surface, in order, or `[]`. Empty cannot tell a surface the file does not list from one
 * whose leads are all under review: a coverage report uses `surfaceHelp` or `helpForPage`, never `leadFor` alone.
 */
export function leadFor(help: Help, surface: string, options?: ReviewOptions): HelpKnowledge[] {
  return surfaceHelp(help, surface, options).lead;
}

export interface PageHelp {
  /** The surface as given in the options, or null. */
  surface: string | null;
  /** The articles that lead the surface, in order: `leadFor`'s result. */
  lead: HelpKnowledge[];
  /** The tips found, in the order the IDs were given, each ID once. */
  tips: Tip[];
  /**
   * What a page's help panel lists, each once: `lead`, then the knowledge the tips come from that is not in `lead`,
   * sorted by ID.
   */
  knowledge: HelpKnowledge[];
  /** IDs with no tip and none pending review, each once, in the order given: the coverage a product has yet to write. */
  missing: string[];
  /**
   * IDs whose tip is under review or was held back, each once, in the order given, in either mode: under `include` a
   * tip under review is in `tips` too, marked. Never in `missing`.
   */
  pendingReview: string[];
  /** The knowledge IDs of the surface's leads that are under review, in declared order, in either mode. */
  leadPendingReview: string[];
}

/**
 * What a page can show for the behaviors on it: the articles that lead its surface when `surface` names one, its
 * tips, the articles behind them, and what has no tip yet.
 */
export function helpForPage(help: Help, ids: Iterable<string>, options?: PageOptions): PageHelp {
  const seen = new Set<string>();
  const tips: Tip[] = [];
  const missing: string[] = [];
  const pendingReview: string[] = [];
  const found = new Map<string, HelpKnowledge>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const state = reviewStateFor(help, id);
    if (state === "none") missing.push(id);
    else if (state !== "current") pendingReview.push(id);
    const tip = tipFor(help, id, options);
    if (tip !== null) {
      tips.push(tip);
      if (tip.article !== null) found.set(tip.article.id, tip.article);
    }
  }
  const surface = options?.surface ?? null;
  const { lead, pendingReview: leadPendingReview } =
    surface === null ? { lead: [], pendingReview: [] } : surfaceHelp(help, surface, options);
  const leading = new Set(lead.map((article) => article.id));
  return {
    surface,
    lead,
    tips,
    knowledge: [
      ...lead,
      ...[...found.keys()]
        .filter((id) => !leading.has(id))
        .sort()
        .map((id) => found.get(id) as HelpKnowledge),
    ],
    missing,
    pendingReview,
    leadPendingReview,
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

export interface BindOptions extends ReviewOptions {
  /** The attribute naming each control's behavior; `data-behavior` by default. */
  attribute?: string;
  /**
   * How a tip is put on its control. The default sets `data-help-tip` to the
   * tip's text and `data-help-knowledge` to the knowledge ID, adds
   * `data-help-under-review="true"` on a tip under review (rendered only under
   * `underReviewHelp: "include"`), removes nothing, and sets nothing a
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
  /** The IDs found on controls that the file has no tip for and none pending review, each once, in document order. */
  missing: string[];
  /**
   * The IDs found on controls whose tip is under review or was held back, each once, in document order. Under
   * `include` an ID under review is in `bound` too.
   */
  pendingReview: string[];
}

function defaultRender(element: TipElement, tip: Tip): void {
  element.setAttribute(TIP_ATTRIBUTE, tip.text);
  element.setAttribute(KNOWLEDGE_ATTRIBUTE, tip.knowledge);
  if (tip.underReview === true) element.setAttribute(UNDER_REVIEW_ATTRIBUTE, "true");
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
  options?: ReviewOptions,
): { found: Found<E>[]; binding: Binding } {
  const found: Found<E>[] = [];
  const bound: string[] = [];
  const missing: string[] = [];
  const pendingReview: string[] = [];
  for (const element of Array.from(root.querySelectorAll(`[${attribute}]`) as ArrayLike<E>)) {
    const id = element.getAttribute(attribute);
    if (id === null || id === "") continue;
    const tip = tipFor(help, id, options);
    found.push({ element, tip });
    const state = reviewStateFor(help, id);
    if (state === "none") {
      if (!missing.includes(id)) missing.push(id);
    } else if (state !== "current" && !pendingReview.includes(id)) pendingReview.push(id);
    if (tip !== null && !bound.includes(id)) bound.push(id);
  }
  return { found, binding: { bound, missing, pendingReview } };
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
  const { found, binding } = scan(root, help, options.attribute ?? BEHAVIOR_ATTRIBUTE, options);
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

/**
 * The part of a `MutationObserver` `watchTips` uses. `R` is the root it
 * observes, so the DOM's own constructor, whose `observe` takes a `Node`, is
 * accepted for a root that is an element, a document or a shadow root.
 */
export interface TipObserver<R = WatchRoot> {
  observe(
    target: R,
    options: { subtree: boolean; childList: boolean; attributes: boolean; attributeFilter: string[] },
  ): void;
  disconnect(): void;
}

export interface WatchOptions<R = WatchRoot, H = unknown> extends BindOptions {
  /**
   * Undoes `render` for one element: when the element stops naming that
   * behavior, leaves `root`, or the watch is disposed. With the default
   * render and no `unrender`, `data-help-tip`, `data-help-knowledge` and
   * `data-help-under-review` are put back as they were before the watch set
   * them. With a `render` of the
   * product's own and no `unrender`, nothing is undone: removing this
   * package's attributes cannot undo what another render did, so a product
   * that needs its page left as it found it passes both.
   */
  unrender?: (element: TipElement, tip: Tip) => void;
  /** What watches `root`; `globalThis.MutationObserver` by default. */
  MutationObserver?: new (
    callback: () => void,
  ) => TipObserver<R>;
  /** Schedules the next pass; `globalThis.requestAnimationFrame` by default, so changes batch to one pass per frame. */
  requestFrame?: (callback: () => void) => H;
  /**
   * Cancels a scheduled pass on dispose, given what `requestFrame` returned.
   * `globalThis.cancelAnimationFrame` by default only when `requestFrame` is
   * the default too; otherwise a pass that cannot be cancelled runs and does
   * nothing once the watch is disposed.
   */
  cancelFrame?: (handle: H) => void;
}

export interface TipWatch {
  /** What the last pass bound, found no tip for and found pending review, as `bindTips` reports it; empty after `dispose`. */
  coverage(): Binding;
  /** Stops watching, cancels a pending pass and unrenders every element it bound. Calling it again does nothing. */
  dispose(): void;
}

function restore(element: WatchElement, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

/**
 * Bind once, then again whenever the DOM under `root` changes, batched to one
 * pass per animation frame, until `dispose`. It binds only under `root`, so it
 * can be mounted into another application's page. `dispose` unrenders every
 * element it bound, which leaves that page's DOM as it found it when the
 * render is the default, or when the product's `unrender` undoes its
 * `render`. An element already bound to the same tip is not rendered again;
 * one whose behavior changed, or that left `root`, is unrendered first.
 */
export function watchTips<R extends WatchRoot, H = unknown>(
  root: R,
  help: Help,
  options: WatchOptions<NoInfer<R>, H> = {},
): TipWatch {
  const attribute = options.attribute ?? BEHAVIOR_ATTRIBUTE;
  const prior = new Map<TipElement, [string | null, string | null, string | null]>();
  let render: (element: TipElement, tip: Tip) => void;
  let unrender: (element: TipElement, tip: Tip) => void;
  if (options.render !== undefined) {
    render = options.render;
    unrender = options.unrender ?? (() => {});
  } else if (options.unrender !== undefined) {
    render = defaultRender;
    unrender = options.unrender;
  } else {
    // The default pair puts back what the element carried before, so neither an authored value nor another watch's is lost.
    render = (element, tip) => {
      if (!prior.has(element))
        prior.set(element, [
          element.getAttribute(TIP_ATTRIBUTE),
          element.getAttribute(KNOWLEDGE_ATTRIBUTE),
          element.getAttribute(UNDER_REVIEW_ATTRIBUTE),
        ]);
      defaultRender(element, tip);
    };
    unrender = (element) => {
      const [text, knowledge, underReview] = prior.get(element) ?? [null, null, null];
      prior.delete(element);
      restore(element as WatchElement, TIP_ATTRIBUTE, text);
      restore(element as WatchElement, KNOWLEDGE_ATTRIBUTE, knowledge);
      restore(element as WatchElement, UNDER_REVIEW_ATTRIBUTE, underReview);
    };
  }
  const scope = globalThis as unknown as {
    MutationObserver?: new (callback: () => void) => TipObserver<R>;
    requestAnimationFrame?: (callback: () => void) => H;
    cancelAnimationFrame?: (handle: H) => void;
  };
  const Observer = options.MutationObserver ?? scope.MutationObserver;
  let requestFrame = options.requestFrame;
  let cancelFrame = options.cancelFrame;
  if (requestFrame === undefined && scope.requestAnimationFrame !== undefined) {
    requestFrame = scope.requestAnimationFrame.bind(globalThis);
    cancelFrame ??= scope.cancelAnimationFrame?.bind(globalThis);
  }
  if (Observer === undefined) throw new TypeError("watchTips needs a MutationObserver: pass options.MutationObserver");
  if (requestFrame === undefined)
    throw new TypeError("watchTips needs requestAnimationFrame: pass options.requestFrame");
  const schedule = requestFrame;

  const bound = new Map<WatchElement, Tip>();
  let coverage: Binding = { bound: [], missing: [], pendingReview: [] };
  let pending = false;
  let handle: H | undefined;
  let disposed = false;

  const pass = () => {
    pending = false;
    if (disposed) return;
    const { found, binding } = scan(root, help, attribute, options);
    const current = new Map<WatchElement, Tip>();
    for (const { element, tip } of found) if (tip !== null && !current.has(element)) current.set(element, tip);
    for (const [element, tip] of bound) {
      if (disposed) return;
      if (current.get(element)?.id === tip.id) continue;
      bound.delete(element);
      unrender(element, tip);
    }
    for (const [element, tip] of current) {
      if (disposed) return;
      if (bound.has(element)) continue;
      render(element, tip);
      // A render that disposed the watch: dispose did not see this element, so undo it here.
      if (disposed) {
        unrender(element, tip);
        return;
      }
      bound.set(element, tip);
    }
    coverage = binding;
  };

  const unbindAll = () => {
    const all = [...bound];
    bound.clear();
    for (const [element, tip] of all) unrender(element, tip);
  };

  const observer = new Observer(() => {
    if (disposed || pending) return;
    pending = true;
    handle = schedule(pass);
  });
  try {
    pass();
  } catch (error) {
    disposed = true;
    unbindAll();
    throw error;
  }
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: [attribute] });

  return {
    coverage: () => ({
      bound: [...coverage.bound],
      missing: [...coverage.missing],
      pendingReview: [...coverage.pendingReview],
    }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      if (pending && cancelFrame !== undefined) cancelFrame(handle as H);
      pending = false;
      unbindAll();
      coverage = { bound: [], missing: [], pendingReview: [] };
    },
  };
}
