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
    // The layered map opens on the capabilities; finding one opens it, so its records are on screen to measure.
    assert.equal(await tab.locator(".am-node:visible").count(), 45, "the overview is the 45 capabilities");
    await tab.fill(".am-find input", model.capabilities[7]);
    await tab.press(".am-find input", "Enter");
    assert.equal(await tab.locator(".am-node:visible").count(), 45 + 71, "its 71 records show beside the capabilities");
    // Opening dims nothing: every record inside the capability is drawn at full strength.
    const faded = await tab.evaluate(
      (id) =>
        [...document.querySelectorAll<SVGElement>(`.am-node[data-block="${id}"]`)].filter(
          (el) => Number(getComputedStyle(el).opacity) < 1,
        ).length,
      model.capabilities[7],
    );
    assert.equal(faded, 0, "no record of the opened capability is dimmed");
    assert.equal(await tab.locator(".am-svg.am-focus").count(), 0, "opening is not a focus on one record");
    assert.ok(await tab.locator(".am-close").isVisible(), "and All capabilities folds it again");
    await tab.keyboard.press("Escape");
    await tab.click('button[data-zoom="reset"]');
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
          // Records drawn wholly inside the frame whose ID is not shown.
          unlabelled: [...document.querySelectorAll<SVGElement>(".am-node")].filter((el) => {
            const c = el.querySelector("circle")?.getBoundingClientRect();
            const t = el.querySelector("text");
            return (
              c !== undefined &&
              getComputedStyle(el).display !== "none" &&
              c.width > 0 &&
              c.top >= frame.top &&
              c.bottom <= frame.bottom &&
              c.left >= frame.left &&
              c.right <= frame.right &&
              t !== null &&
              getComputedStyle(t).display === "none"
            );
          }).length,
        };
      });
    // Zoom in on the capability's records, where the labels are crowded: a behavior in the middle of its column.
    const behavior = model.capabilities[7].replace(/^CAP-/, "BEH-").replace(/(\d{3})$/, "$1-010");
    const target = (await tab.locator(`.am-node[data-id="${behavior}"] circle`).boundingBox()) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    await tab.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
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
    assert.ok(seen[0].unlabelled > 0, "at the fit some IDs make way for others");
    assert.equal(seen[2].unlabelled, 0, "and zoomed in, every record in the frame shows its ID");
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
