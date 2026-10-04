/**
 * The built pages in Chromium, at the two widths the kickoff names (390px and
 * desktop): nothing scrolls sideways, nothing in the shell or the document is
 * clipped, every link is a usable target, and the keyboard reaches the skip
 * link first. Skipped, with the reason, when Chromium cannot launch here.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { type Browser, chromium } from "@playwright/test";
import { build } from "../build.ts";

const WIDTHS = [390, 1440];
const PAGES = [
  "index.html",
  "start/index.html",
  "specifications/index.html",
  "specifications/core/index.html",
  "pilot/index.html",
  "example/index.html",
  "example/BEH-ASMT-SCHEDULE/index.html",
];

const dist = await mkdtemp(join(tmpdir(), "intentset-browser-"));
await build(dist);
let browser: Browser | null = null;
let launchError = "";
try {
  browser = await chromium.launch({ headless: true });
} catch (error) {
  launchError = (error as Error).message.split("\n")[0];
}
after(async () => {
  await browser?.close();
  await rm(dist, { recursive: true, force: true });
});

const url = (page: string) => pathToFileURL(join(dist, page)).href;

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
      const smallLinks = [...document.querySelectorAll("a")]
        .filter((a) => !a.classList.contains("site-skip"))
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
