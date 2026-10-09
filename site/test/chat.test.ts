/**
 * The chat panel (SLICE-ASK, site/chat/) in Chromium, against a stub of POST /ask that streams events the way the
 * backend does. The site is built with the stub's address; the default build carries no chat at all
 * (build.test.ts holds the shell's two scripts). Skipped, with the reason, when Chromium cannot launch here.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { after, test } from "node:test";
import { type Browser, chromium } from "@playwright/test";
import { build } from "../build.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};
const ANSWER = "A **slice** owns behaviors end to end.\n\n- its code\n- its checks\n\nSee `SLICE-ASMT-SCHEDULE`.";
const asked: Array<{ question: string; history: Array<{ question: string; answer: unknown[] }> }> = [];

const dist = await mkdtemp(join(tmpdir(), "intentset-chat-"));
const server = createServer(async (request, response) => {
  const path0 = new URL(request.url ?? "/", "http://localhost").pathname;
  if (path0 === "/ask" && request.method === "POST") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const parsed = JSON.parse(body);
    asked.push(parsed);
    response.writeHead(200, { "content-type": "application/x-ndjson" });
    const line = (event: unknown) => response.write(`${JSON.stringify(event)}\n`);
    if (parsed.question.includes("limit")) {
      line({ type: "refused", reason: "visitor-limit" });
      response.end();
      return;
    }
    const half = Math.floor(ANSWER.length / 2);
    line({ type: "text", text: ANSWER.slice(0, half) });
    await new Promise((done) => setTimeout(done, 50));
    line({ type: "text", text: ANSWER.slice(half) });
    line({
      type: "sources",
      sources: [{ url: "https://intentset.org/specifications/vsa/", title: "VSA specification" }],
    });
    line({
      type: "done",
      outcome: "answered",
      answer: [
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: ANSWER },
      ],
    });
    response.end();
    return;
  }
  let path = normalize(decodeURIComponent(path0)).slice(1);
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
await build(dist, { askUrl: new URL("ask", origin).href });

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

test("built with the chat, every page loads the panel after <main>, and its styles", async () => {
  for (const page of ["index.html", "specifications/core/index.html", "404.html"]) {
    const html = await readFile(join(dist, page), "utf8");
    assert.equal((html.match(/<script/gi) ?? []).length, 3, page);
    assert.match(
      html,
      /<\/main>[\s\S]*<script src="[^"]*chat\/panel\.js" data-ask-url="[^"]+\/ask" data-privacy-url="[^"]*privacy\/" defer><\/script>/,
    );
    assert.match(html, /<link rel="stylesheet" href="[^"]*chat\/panel\.css">/);
  }
});

test("built with the chat, the privacy page exists and the footer's row links it", async () => {
  const html = await readFile(join(dist, "privacy", "index.html"), "utf8");
  assert.match(html, /<h1[^>]*>Privacy<\/h1>/);
  assert.match(html, /privacy@coralreefventures\.com/);
  const home = await readFile(join(dist, "index.html"), "utf8");
  assert.match(home, /<nav class="site-footer-nav"[\s\S]*href="(?:\.\/)?privacy\/index\.html"[^>]*>Privacy<\/a>/);
});

test("a visitor asks, the answer streams in with its sources, and a follow-up sends the conversation back", async (t) => {
  if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(new URL("start/", origin).href);
  const launch = page.getByRole("button", { name: "Ask the docs" });
  await launch.click();
  const panel = page.getByRole("dialog", { name: "Ask the docs" });
  assert.ok(await panel.isVisible());
  assert.equal(await page.evaluate(() => document.activeElement?.id), "chat-question");
  assert.equal(await panel.getByRole("link", { name: "Privacy" }).getAttribute("href"), "../privacy/");

  await page.getByLabel("Your question").fill("What is a slice?");
  await page.keyboard.press("Enter");
  await panel.locator(".chat-sources a").waitFor();
  assert.equal(await panel.locator(".chat-a strong").first().textContent(), "slice");
  assert.equal(await panel.locator(".chat-a li").count(), 2);
  assert.equal(await panel.locator(".chat-a code").first().textContent(), "SLICE-ASMT-SCHEDULE");
  assert.equal(
    await panel.locator(".chat-sources a").getAttribute("href"),
    "https://intentset.org/specifications/vsa/",
  );

  await page.getByLabel("Your question").fill("And a rule?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await panel.locator(".chat-sources").nth(1).waitFor();
  const last = asked.at(-1);
  assert.equal(last?.question, "And a rule?");
  assert.equal(last?.history.length, 1);
  assert.deepEqual(last?.history[0].answer, [
    { type: "thinking", thinking: "", signature: "sig" },
    { type: "text", text: ANSWER },
  ]);

  // The conversation follows the reader to another page in the same tab.
  await page.goto(new URL("how-it-works/", origin).href);
  assert.equal(await page.locator(".chat-turn").count(), 2);

  // A refusal is said in words, and Escape closes the panel and returns focus to the launcher.
  await page.getByLabel("Your question").fill("over the limit?");
  await page.keyboard.press("Enter");
  await page.locator(".chat-message").waitFor();
  assert.match((await page.locator(".chat-message").textContent()) ?? "", /today's limit/);
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.className), "chat-launch");
  await page.close();
});

test("the open panel fits the screen at 390 and 1440 pixels, in both schemes, without scrolling the page sideways", async (t) => {
  if (!browser) return t.skip(`Chromium did not launch: ${launchError}`);
  for (const width of [390, 1440]) {
    for (const colorScheme of ["light", "dark"] as const) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, colorScheme });
      await page.goto(new URL("specifications/core/", origin).href);
      await page.getByRole("button", { name: "Ask the docs" }).click();
      const box = await page.locator(".chat-panel").boundingBox();
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(
        box && box.x >= 0 && box.x + box.width <= width + 0.5,
        `${width} ${colorScheme}: panel inside the screen`,
      );
      assert.ok(scroll <= width, `${width} ${colorScheme}: no sideways scroll`);
      for (const name of ["Close the chat", "New conversation", "Ask"]) {
        const target = await page.getByRole("button", { name, exact: true }).boundingBox();
        assert.ok(target && target.height >= 44 && target.width >= 44, `${width}: ${name} is a usable target`);
      }
      await page.close();
    }
  }
});
