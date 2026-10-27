/**
 * The built pages in Chromium, at the two widths the kickoff names (390px and
 * desktop): nothing scrolls sideways, nothing in the shell or the document is
 * clipped, every link is a usable target, and the keyboard reaches the skip
 * link first. Skipped, with the reason, when Chromium cannot launch here.
 *
 * Served over HTTP from the build's root, the way Pages serves it, rather than
 * opened as files: the 404 page links from the root, and Pages answers any
 * missing address with it, which only a server can show.
 */
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { after, test } from "node:test";
import { type Browser, chromium } from "@playwright/test";
import { build } from "../build.ts";

const WIDTHS = [390, 1440];
const PAGES = [
  "index.html",
  "start/index.html",
  "how-it-works/index.html",
  "introducing/index.html",
  "adopt/index.html",
  "verify/index.html",
  "guide/index.html",
  "tools/index.html",
  "tools/cli/index.html",
  "specifications/index.html",
  "specifications/core/index.html",
  "markset/index.html",
  "conformance/index.html",
  "pilot/index.html",
  "example/index.html",
  "example/BEH-ASMT-SCHEDULE/index.html",
  "example/atlas/map/index.html",
  "roadmap/index.html",
  "no/such/page/",
];

const dist = await mkdtemp(join(tmpdir(), "intentset-browser-"));
await build(dist);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};
/** A static server over the build, answering a missing address with 404.html as Pages does. */
const server = createServer(async (request, response) => {
  let path = normalize(decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname)).slice(1);
  if (path === "" || path.endsWith("/")) path += "index.html";
  try {
    const body = await readFile(join(dist, path));
    response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": TYPES[".html"] });
    response.end(await readFile(join(dist, "404.html")));
  }
});
await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
let browser: Browser | null = null;
let launchError = "";
try {
  browser = await chromium.launch({ headless: true });
} catch (error) {
  launchError = (error as Error).message.split("\n")[0];
}
after(async () => {
  await browser?.close();
  await new Promise((done) => server.close(done));
  await rm(dist, { recursive: true, force: true });
});

const url = (page: string) => new URL(page, origin).href;

interface Measure {
  scrollWidth: number;
  outside: string[];
  smallLinks: string[];
}

async function measure(page: string, width: number): Promise<Measure> {
  const tab = await browser!.newPage({ viewport: { width, height: 900 } });
  try {
    await tab.goto(url(page));
    return await tab.evaluate(() => {
      const scrollWidth = document.documentElement.scrollWidth;
      // A wide table becomes a scrolling block at phone width (markset.css); its
      // rows extend past the viewport by design and are reached by scrolling the
      // table, so what is measured is the container, not the rows inside it.
      const inScroller = (el: Element): boolean => {
        for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
          const overflow = getComputedStyle(n).overflowX;
          if ((overflow === "auto" || overflow === "scroll") && n.scrollWidth > n.clientWidth) return true;
        }
        return false;
      };
      const outside = [...document.querySelectorAll("header *, main *, footer *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.left < -0.5 || r.right > innerWidth + 0.5) && !inScroller(el);
        })
        .map((el) => el.outerHTML.slice(0, 80));
      // A record on the Atlas map is a node the size of its circle; Find and the panel's links are the
      // equivalent controls a reader can always use instead (WCAG 2.5.8, equivalent), so the map's are not counted.
      const smallLinks = [...document.querySelectorAll("a")]
        .filter((a) => !a.classList.contains("site-skip") && !a.closest(".am-svg"))
        .filter((a) => {
          const r = a.getBoundingClientRect();
          return r.width > 0 && r.height < 24;
        })
        .map((a) => `${a.textContent?.trim()} (${Math.round(a.getBoundingClientRect().height)}px)`);
      return { scrollWidth, outside, smallLinks };
    });
  } finally {
    await tab.close();
  }
}

for (const width of WIDTHS) {
  test(`at ${width}px nothing scrolls sideways, nothing is clipped, and every link is at least 24px tall`, async (t) => {
    if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
    for (const page of PAGES) {
      const result = await measure(page, width);
      t.diagnostic(`${page} at ${width}px: scrollWidth ${result.scrollWidth}`);
      assert.ok(result.scrollWidth <= width, `${page}: scrolls sideways at ${width}px (${result.scrollWidth})`);
      assert.deepEqual(result.outside, [], `${page}: outside the viewport at ${width}px`);
      assert.deepEqual(result.smallLinks, [], `${page}: links under 24px at ${width}px`);
    }
  });
}

test("the command page's help block fits the column at desktop width", async (t) => {
  if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
  // The document's column stops at the wide measure beside the rail, so help that
  // fits a terminal can still be wider than the column (it was, at 105 columns),
  // and widening the window does not help. Other pages' blocks hold one-line JSON
  // that scrolls by design, so only this page is held to it.
  for (const width of [1440, 1920]) {
    const tab = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      for (const page of ["tools/cli/index.html"]) {
        await tab.goto(url(page));
        const scrolling = await tab.evaluate(() =>
          [...document.querySelectorAll("pre")]
            .filter((pre) => pre.scrollWidth > pre.clientWidth)
            .map((pre) => `${pre.textContent?.slice(0, 40)} (${pre.scrollWidth}px in ${pre.clientWidth}px)`),
        );
        assert.deepEqual(scrolling, [], `${page}: a code block scrolls sideways at ${width}px`);
      }
    } finally {
      await tab.close();
    }
  }
});

test("the primary calls to action are at least 44px tall", async (t) => {
  if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
  for (const width of WIDTHS) {
    const tab = await browser.newPage({ viewport: { width, height: 900 } });
    await tab.goto(url("index.html"));
    const heights = await tab.evaluate(() =>
      [...document.querySelectorAll(".ms-span.button > a")].map((a) => ({
        label: a.textContent?.trim() ?? "",
        height: a.getBoundingClientRect().height,
      })),
    );
    await tab.close();
    assert.ok(heights.length >= 4);
    for (const { label, height } of heights) assert.ok(height >= 44, `${label}: ${height}px at ${width}px`);
  }
});

test("Tab from the top lands on the skip link, which moves focus to main; the next stop shows a focus ring", async (t) => {
  if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
  for (const width of WIDTHS) {
    const tab = await browser.newPage({ viewport: { width, height: 900 } });
    await tab.goto(url("index.html"));
    await tab.keyboard.press("Tab");
    const first = await tab.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        label: el.textContent?.trim(),
        visible: r.top >= 0 && r.height > 0,
        outline: `${style.outlineStyle} ${style.outlineWidth}`,
      };
    });
    assert.equal(first.label, "Skip to content", `at ${width}px`);
    assert.ok(first.visible, `the skip link is visible when focused at ${width}px`);
    assert.equal(first.outline, "solid 3px", `the skip link has a focus ring at ${width}px`);
    await tab.keyboard.press("Enter");
    assert.equal(await tab.evaluate(() => document.activeElement?.id), "main", `at ${width}px`);
    await tab.keyboard.press("Tab");
    const next = await tab.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const style = getComputedStyle(el);
      return { tag: el.tagName, outline: `${style.outlineStyle} ${style.outlineWidth}` };
    });
    assert.equal(next.tag, "A");
    assert.equal(next.outline, "solid 3px", `the first link after main has a focus ring at ${width}px`);
    await tab.close();
  }
});

test("every term on the adoption log shows its tip inside the window when focused, at phone, tablet and desktop widths", async (t) => {
  if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
  for (const width of [390, 1024, 1100, 1440]) {
    const tab = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      await tab.goto(url("pilot/index.html"));
      const count = await tab.locator(".term").count();
      assert.ok(count > 0, "the log has terms");
      for (let i = 0; i < count; i++) {
        const term = tab.locator(".term").nth(i);
        await term.focus();
        const box = await term.evaluate((el) => {
          const tip = el.querySelector(".term-tip") as HTMLElement;
          const r = tip.getBoundingClientRect();
          return {
            text: el.textContent?.slice(0, 40),
            shown: getComputedStyle(tip).display !== "none",
            left: r.left,
            right: r.right,
            bottom: r.bottom,
          };
        });
        assert.ok(box.shown, `${box.text}: the tip shows on focus at ${width}px`);
        assert.ok(
          box.left >= 0 && box.right <= width,
          `${box.text}: the tip stays inside the window at ${width}px (${Math.round(box.left)} to ${Math.round(box.right)})`,
        );
      }
    } finally {
      await tab.close();
    }
  }
});

test("a missing address, however deep, gets the 404 page in the site's shell and styles", async (t) => {
  if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
  const tab = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const response = await tab.goto(url("no/such/page/"));
  assert.equal(response?.status(), 404);
  const result = await tab.evaluate(() => ({
    h1: document.querySelector("h1")?.textContent,
    styled: getComputedStyle(document.querySelector(".site-header")!).display === "flex",
    home: (document.querySelector(".ms-span.button.primary > a") as HTMLAnchorElement).href,
  }));
  await tab.close();
  assert.equal(result.h1, "Page not found");
  assert.ok(result.styled, "the stylesheets load from the root");
  assert.equal(result.home, url(""));
});

test("BEH-ATLAS-MAP: the worked example's map finds, focuses, filters, goes full screen and follows, at phone and desktop widths", async (t) => {
  if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
  for (const width of WIDTHS) {
    // Reduced motion turns off the site's smooth scrolling. With it on, scrolling a record into view is an animation,
    // and a forced click does not wait for it to end: on a slow machine the click lands mid-scroll on the background,
    // which clears the selection instead of following the link. Reproduced under 8x CPU throttling, 2 runs in 16; with reduced motion, none in 40.
    const tab = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const errors: string[] = [];
    tab.on("pageerror", (error) => errors.push(error.message));
    await tab.goto(url("example/atlas/map/index.html"));
    // The script shows the controls; without it they stay hidden and the picture stands alone.
    assert.ok(await tab.locator(".am-controls").isVisible(), `${width}px: controls shown`);
    await tab.fill(".am-find input", "cap-asmt-assign");
    await tab.press(".am-find input", "Enter");
    assert.equal(await tab.locator(".am-node.am-selected").getAttribute("data-id"), "CAP-ASMT-ASSIGN");
    assert.ok((await tab.locator(".am-node.am-near").count()) >= 2, "its links are marked");
    const panel = (await tab.locator(".am-panel").textContent()) ?? "";
    assert.match(panel, /CAP-ASMT-ASSIGN: Student assessment assignment/);
    assert.match(panel, /BEH-ASMT-SCHEDULE/);
    await tab.locator(".am-panel button", { hasText: "BEH-ASMT-SCHEDULE" }).click();
    assert.equal(await tab.locator(".am-node.am-selected").getAttribute("data-id"), "BEH-ASMT-SCHEDULE");
    await tab.keyboard.press("Escape");
    assert.equal(await tab.locator(".am-svg.am-focus").count(), 0, "Escape shows everything again");
    await tab.uncheck('.am-filter input[data-group="verification"]');
    assert.equal(await tab.locator('.am-node[data-group="verification"]:visible').count(), 0, "a family hides");
    await tab.check('.am-filter input[data-group="verification"]');
    await tab.fill(".am-find input", "NO-SUCH-RECORD");
    await tab.press(".am-find input", "Enter");
    assert.match((await tab.locator(".am-panel").textContent()) ?? "", /No record has the ID NO-SUCH-RECORD/);
    // Full screen: the map fills the viewport, the panel stays on it, and the button undoes it.
    // Waits on what a reader sees, the button's state, which the script sets once the browser has changed state.
    await tab.click(".am-full");
    await tab.locator('.am-full[aria-pressed="true"]').waitFor();
    assert.ok(
      await tab.evaluate(() => {
        const map = document.querySelector(".am-map");
        return document.fullscreenElement === map || map?.classList.contains("am-expanded");
      }),
    );
    const box = await tab.locator(".am-svg").boundingBox();
    assert.ok(box && box.height > 600, `${width}px: full screen fills the height (${box?.height})`);
    assert.equal(await tab.getAttribute(".am-full", "aria-pressed"), "true");
    assert.equal(await tab.textContent(".am-full"), "Exit full screen");
    await tab.click(".am-full");
    await tab.locator('.am-full[aria-pressed="false"]').waitFor();
    assert.ok(
      await tab.evaluate(() => document.fullscreenElement === null && !document.querySelector(".am-map.am-expanded")),
    );
    // Leaving full screen gives the map back its height from the drawing's proportions and restores the scroll, which
    // the browser may finish a frame or two later: a click aimed before then lands where the record no longer is.
    await tab.waitForFunction(
      () =>
        new Promise((resolve) => {
          const box = () => JSON.stringify(document.querySelector(".am-svg")?.getBoundingClientRect());
          const before = box();
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(box() === before)));
        }),
    );
    // A second activation of a selected record follows its link, to the site's own address.
    const node = tab.locator('.am-node[data-id="BEH-ASMT-SCHEDULE"] circle');
    await node.click({ force: true });
    assert.equal(
      await tab.locator(".am-node.am-selected").getAttribute("data-id"),
      "BEH-ASMT-SCHEDULE",
      `${width}px: the first activation selects the record`,
    );
    await Promise.all([
      tab.waitForURL(/\/example\/atlas\/behaviors\/BEH-ASMT-SCHEDULE\/$/),
      node.click({ force: true }),
    ]);
    assert.deepEqual(errors, [], `${width}px: no script error`);
    await tab.close();
  }
});

test("the rail beside a page in a section names the section and marks the page", async (t) => {
  if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
  for (const width of WIDTHS) {
    const tab = await browser.newPage({ viewport: { width, height: 900 } });
    await tab.goto(url("tools/cli/index.html"));
    const result = await tab.evaluate(() => {
      const rail = document.querySelector(".site-rail")!;
      const main = document.querySelector("main")!.getBoundingClientRect();
      const box = rail.getBoundingClientRect();
      return {
        title: rail.querySelector(".site-rail-title")?.textContent,
        current: rail.querySelector('[aria-current="page"]')?.textContent,
        beside: box.right <= main.left + 1,
        above: box.bottom <= main.top + 1,
      };
    });
    await tab.close();
    assert.equal(result.title, "Tools", `at ${width}px`);
    assert.equal(result.current, "The intentset command", `at ${width}px`);
    if (width >= 1440) assert.ok(result.beside, "on a desktop the rail sits beside the page");
    else assert.ok(result.above, "on a phone the rail stacks above the page");
  }
});

test("the introduction is a 16:9 slide to a window on a desktop, a column of cards on a phone, and Page Down moves slide to slide", async (t) => {
  if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
  const slides = async (width: number, height: number) => {
    const tab = await browser!.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
    await tab.goto(url("introducing/index.html"));
    const result = await tab.evaluate(() => {
      const main = document.querySelector("main")!.getBoundingClientRect();
      return [...document.querySelectorAll<HTMLElement>("main > .slide")].map((slide) => {
        const box = slide.getBoundingClientRect();
        // Anything drawn outside its slide overlaps the next one, or the notes beneath it.
        const outside = [...slide.querySelectorAll("*")].filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || el.closest("pre")) return false;
          return r.bottom > box.bottom + 0.5 || r.right > box.right + 0.5 || r.left < box.left - 0.5;
        });
        return {
          id: slide.id,
          ratio: box.width / box.height,
          height: box.height,
          fillsMain: Math.abs(box.width - main.width) < 1,
          outside: outside.map((el) => el.outerHTML.slice(0, 60)),
        };
      });
    });
    return { tab, result };
  };
  const desktop = await slides(1440, 900);
  assert.equal(desktop.result.length, 23);
  for (const slide of desktop.result) {
    assert.ok(Math.abs(slide.ratio - 16 / 9) < 0.01, `${slide.id}: 16:9 at 1440 by 900 (${slide.ratio.toFixed(3)})`);
    assert.ok(slide.height <= 900, `${slide.id}: fits the window`);
    assert.ok(slide.fillsMain, `${slide.id}: as wide as the document`);
    assert.deepEqual(slide.outside, [], `${slide.id}: nothing outside the slide`);
  }
  // Snapping makes Page Down the next slide.
  const tab = desktop.tab;
  await tab.locator("#cover").evaluate((el) => el.scrollIntoView());
  await tab.waitForTimeout(500);
  const seen: string[] = [];
  for (let i = 0; i < 3; i++) {
    await tab.keyboard.press("PageDown");
    // The snap lands after the key's own scroll.
    await tab.waitForTimeout(1000);
    seen.push(
      await tab.evaluate(
        () =>
          [...document.querySelectorAll("main > .slide")].find((el) => Math.abs(el.getBoundingClientRect().top) < 40)
            ?.id ?? "",
      ),
    );
  }
  assert.deepEqual(seen, ["problem", "trust", "idea"]);
  await tab.close();
  const phone = await slides(390, 844);
  for (const slide of phone.result) {
    assert.ok(slide.fillsMain, `${slide.id}: as wide as the document at 390px`);
    assert.deepEqual(slide.outside, [], `${slide.id}: nothing outside the slide at 390px`);
  }
  assert.ok(
    phone.result.some((slide) => slide.ratio < 1),
    "at 390px the frames let go: a slide is as tall as its content",
  );
  await phone.tab.close();
});

test("Present shows one slide at a time filling the window, moves by key, click and control, shows the notes, and Esc returns to the page at that slide", async (t) => {
  if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
  const tab = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await tab.goto(url("introducing/index.html"));
  const shown = () =>
    tab.evaluate(() => {
      const current = [...document.querySelectorAll<HTMLElement>("main > .slide.is-current")];
      const box = current[0]?.getBoundingClientRect();
      // What is on top in the middle of the window, and in the corner of the page the slide does not cover.
      const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest(".slide")?.id ?? "";
      return {
        presenting: document.documentElement.classList.contains("presenting"),
        current: current.map((s) => s.id),
        count: document.querySelector(".deck-count")?.textContent ?? "",
        top,
        width: box?.width ?? 0,
        height: box?.height ?? 0,
        notes: document.querySelector<HTMLElement>(".deck-notes")?.hidden === false,
        notesText: document.querySelector(".deck-notes")?.textContent?.trim() ?? "",
        hash: location.hash,
        inertHeader: (document.querySelector(".site-header") as HTMLElement).inert,
      };
    });
  const present = tab.getByRole("button", { name: "Present" });
  assert.ok(await present.isVisible(), "a wide screen offers Present");
  await present.click();
  let s = await shown();
  assert.ok(s.presenting);
  assert.deepEqual(s.current, ["cover"]);
  assert.equal(s.top, "cover", "the cover is what the window shows");
  assert.equal(s.count, "1 / 23");
  // The largest 16:9 that fits 1440 by 900 is 1440 by 810.
  assert.ok(
    Math.abs(s.width - 1440) < 1 && Math.abs(s.height - 810) < 1,
    `fills the window (${s.width} by ${s.height})`,
  );
  assert.ok(s.inertHeader, "the page behind is out of reach");
  for (const key of ["ArrowRight", "PageDown", " "]) await tab.keyboard.press(key);
  s = await shown();
  assert.deepEqual([s.current, s.top, s.count, s.hash], [["idea"], "idea", "4 / 23", "#idea"]);
  await tab.keyboard.press("ArrowLeft");
  await tab.mouse.click(720, 300);
  s = await shown();
  assert.deepEqual(s.current, ["idea"], "back one by key, on one by a click on the slide");
  await tab.getByRole("button", { name: "Next slide" }).click();
  s = await shown();
  assert.deepEqual(s.current, ["behavior"]);
  await tab.keyboard.press("n");
  s = await shown();
  assert.ok(s.notes && s.notesText.length > 40, "N shows the slide's speaker notes");
  assert.ok(!s.notesText.startsWith("Speaker notes"), "without the callout's title");
  // With the notes open, the slide fits the 70 per cent of the window above them.
  assert.ok(
    s.height <= 900 * 0.7 + 1 && Math.abs(s.width / s.height - 16 / 9) < 0.01,
    `fits above the notes (${s.height})`,
  );
  await tab.keyboard.press("End");
  s = await shown();
  assert.deepEqual([s.current, s.count], [["try"], "23 / 23"]);
  assert.ok(await tab.getByRole("button", { name: "Next slide" }).isDisabled(), "nothing after the last slide");
  await tab.keyboard.press("Escape");
  s = await shown();
  assert.ok(!s.presenting && s.current.length === 0 && !s.inertHeader, "Esc ends the presentation");
  const back = await tab.evaluate(() => Math.abs(document.getElementById("try")!.getBoundingClientRect().top));
  assert.ok(back < 40, `the page is at the slide the presentation ended on (${back})`);
  await tab.close();
  // On a phone there is no frame, so nothing to present.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(url("introducing/index.html"));
  assert.equal(
    await phone.getByRole("button", { name: "Present" }).isVisible(),
    false,
    "a phone is not offered Present",
  );
  await phone.close();
});

test("the navigation wraps below the brand at phone width and sits beside it on a desktop", async (t) => {
  if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
  const position = async (width: number) => {
    const tab = await browser!.newPage({ viewport: { width, height: 900 } });
    await tab.goto(url("index.html"));
    const result = await tab.evaluate(() => {
      const brand = document.querySelector(".site-brand")!.getBoundingClientRect();
      const nav = document.querySelector(".site-nav")!.getBoundingClientRect();
      const columns = getComputedStyle(document.querySelector(".ms-columns.hero")!).gridTemplateColumns;
      return { navBelowBrand: nav.top >= brand.bottom - 1, columns: columns.split(" ").length };
    });
    await tab.close();
    return result;
  };
  const phone = await position(390);
  assert.ok(phone.navBelowBrand, "at 390px the nav wraps under the brand");
  assert.equal(phone.columns, 1, "at 390px the hero stacks");
  const desktop = await position(1440);
  assert.ok(!desktop.navBelowBrand, "at 1440px the nav sits beside the brand");
  assert.equal(desktop.columns, 2, "at 1440px the hero has two columns");
});

test("every code block gets a Copy button that copies the block, and only the block", async (t) => {
  if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
  // The button is made by the shell's script, so it exists only where the
  // clipboard does, and a reader with scripting off never meets a dead control.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const tab = await context.newPage();
  await tab.goto(url("start/index.html"));
  const counts = await tab.evaluate(() => ({
    blocks: document.querySelectorAll("#main pre > code").length,
    buttons: document.querySelectorAll("#main .site-copy").length,
    outside: document.querySelectorAll(".site-copy:not(#main .site-copy)").length,
  }));
  assert.ok(counts.blocks > 0, "the Start page has code blocks");
  assert.equal(counts.buttons, counts.blocks, "one button per code block");
  assert.equal(counts.outside, 0, "and none outside main");

  const first = tab.locator(".site-copy").first();
  assert.equal((await first.boundingBox())!.height >= 24, true, "the button is a usable target");
  await first.click();
  await tab.waitForFunction(() => document.querySelector(".site-copy")!.hasAttribute("data-copied"));
  assert.equal(await first.textContent(), "Copied", "the button says so");
  const written = await tab.evaluate(() => navigator.clipboard.readText());
  const source = await tab.locator("#main pre > code").first().textContent();
  assert.equal(written, source, "what was copied is the block, with nothing of the button in it");
  await context.close();
});
