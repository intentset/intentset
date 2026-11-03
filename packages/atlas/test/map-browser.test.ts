/**
 * The map's script in Chromium on a generated model of a few thousand records (the worked example's map is driven by
 * the site's browser test): the IDs and circles keep one size on screen at any zoom, no two shown IDs overlap, and a
 * wheel step stays cheap. Served from memory. Skipped, with the reason, when Chromium cannot launch here.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import { type Browser, chromium } from "@playwright/test";
import { buildAtlas } from "../src/index.ts";
import { largeModel } from "./large-model.ts";

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8" };
let browser: Browser | null = null;
let launchError = "";
try {
  browser = await chromium.launch({ headless: true });
} catch (error) {
  launchError = (error as Error).message.split("\n")[0];
}
after(async () => {
  await browser?.close();
});

test("BEH-ATLAS-MAP: on a model of thousands of records the map's IDs and circles keep one size on screen, and no two shown IDs overlap", async (t) => {
  if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
  const model = largeModel(45, 20);
  assert.ok(model.records > 2500, `${model.records} records`);
  const atlas = buildAtlas(model.input);
  const big = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname.slice(1) || "map.html";
    const body = atlas.get(path);
    if (body === undefined) {
      response.writeHead(404).end();
      return;
    }
    response
      .writeHead(200, { "content-type": TYPES[path.slice(path.lastIndexOf("."))] ?? "text/javascript; charset=utf-8" })
      .end(body);
  });
  await new Promise<void>((done) => big.listen(0, "127.0.0.1", done));
  const address = `http://127.0.0.1:${(big.address() as AddressInfo).port}/map.html`;
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  try {
    const errors: string[] = [];
    tab.on("pageerror", (error) => errors.push(error.message));
    await tab.goto(address);
    await tab.locator(".am-controls").waitFor();
    // What a reader sees: the IDs shown inside the frame, their size and whether any two overlap, and the circles' sizes.
    const look = () =>
      tab.evaluate(() => {
        const frame = document.querySelector(".am-svg")?.getBoundingClientRect() as DOMRect;
        const inside = (r: DOMRect) =>
          r.right > frame.left && r.left < frame.right && r.bottom > frame.top && r.top < frame.bottom;
        const labels = [...document.querySelectorAll<SVGTextElement>(".am-node text")]
          .filter((el) => getComputedStyle(el).display !== "none")
          .map((el) => el.getBoundingClientRect())
          .filter(inside);
        let overlaps = 0;
        for (const [i, a] of labels.entries()) {
          for (const b of labels.slice(i + 1)) {
            if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps++;
          }
        }
        const circles = [...document.querySelectorAll<SVGCircleElement>(".am-node circle")]
          .map((el) => el.getBoundingClientRect())
          .filter(
            (r) =>
              inside(r) &&
              r.top >= frame.top &&
              r.bottom <= frame.bottom &&
              r.left >= frame.left &&
              r.right <= frame.right,
          );
        return {
          shown: labels.length,
          overlaps,
          height: labels.length === 0 ? 0 : Math.max(...labels.map((r) => r.height)),
          least: labels.length === 0 ? 0 : Math.min(...labels.map((r) => r.height)),
          widest: circles.length === 0 ? 0 : Math.max(...circles.map((r) => r.width)),
          circles: circles.length,
        };
      });
    const box = (await tab.locator(".am-svg").boundingBox()) as { x: number; y: number; width: number; height: number };
    await tab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const seen = [await look()];
    for (const steps of [6, 6, 6]) {
      for (let i = 0; i < steps; i++) await tab.mouse.wheel(0, -100);
      await tab.waitForTimeout(100);
      seen.push(await look());
    }
    for (const [i, one] of seen.entries()) {
      assert.equal(one.overlaps, 0, `zoom level ${i}: no two shown IDs overlap`);
      // About 12px type: a line box of 13 to 16px, never the 60px a label grew to when it scaled with the zoom.
      if (one.shown > 0)
        assert.ok(one.least >= 11 && one.height <= 17, `zoom level ${i}: type ${one.least} to ${one.height}px`);
      assert.ok(one.widest <= 40, `zoom level ${i}: the largest circle is ${one.widest}px`);
    }
    assert.ok(seen[0].shown > 0, "some IDs show at the fit");
    assert.ok(seen[3].shown > 3, "and zooming in shows more of them");
    // The selected record and its links are labelled, still without overlap.
    await tab.fill(".am-find input", model.capabilities[7]);
    await tab.press(".am-find input", "Enter");
    const chosen = await tab.locator(".am-node.am-selected text").evaluate((el) => getComputedStyle(el).display);
    assert.notEqual(chosen, "none", "the selected record's ID shows");
    assert.equal((await look()).overlaps, 0, "no overlap with a record selected");
    await tab.keyboard.press("Escape");
    // What a wheel step costs: the handler runs inside dispatchEvent, so its time is the viewBox change plus the label pass.
    const steps = await tab.evaluate(() => {
      const svg = document.querySelector(".am-svg") as SVGElement;
      const r = svg.getBoundingClientRect();
      const times: number[] = [];
      for (let i = 0; i < 40; i++) {
        const start = performance.now();
        svg.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: i % 2 ? 100 : -100,
            clientX: r.left + r.width / 2 + i,
            clientY: r.top + r.height / 2,
            bubbles: true,
            cancelable: true,
          }),
        );
        times.push(performance.now() - start);
      }
      return times.sort((a, b) => a - b);
    });
    assert.ok(steps[20] < 50, `a wheel step takes a median ${steps[20].toFixed(1)}ms`);
    assert.deepEqual(errors, [], "no script error");
  } finally {
    await tab.close();
    await new Promise((done) => big.close(done));
  }
});
