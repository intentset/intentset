/**
 * Draws `site/social-card.png`, the image a link to intentset.org previews as
 * in a chat client, a feed or a search result. Without one the preview is text,
 * and the site is the only thing in the family that had no picture to show.
 *
 * Run by hand (`pnpm run social-card`) and the result committed, rather than
 * drawn during the build: the build runs in CI and on a deploy, and neither
 * should need a browser to produce a picture that changes about once a year.
 * A test holds the committed file to this size, so a card drawn at the wrong
 * one cannot ship.
 *
 * The card is the site's own: the mark from `site/icon.svg`, the approved
 * tagline the footer carries, and the tokens from `site/site.css` in their dark
 * values, which hold their own against both a light and a dark client. Nothing
 * is loaded from another origin, here or on a page: the type is the system's,
 * as it is on the site.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { CARD, FOOTER, SITE_HOST, SITE_NAME } from "./build.ts";

const root = resolve(import.meta.dirname, "..");

/** The card's markup: the site's dark tokens, its mark, and the words the footer already carries. */
export function cardHtml(mark: string): string {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<style>
  :root {
    --fg: #e4ebe7;
    --muted: #a6b4ae;
    --bg: #121917;
    --accent: #7cc3a8;
    --border: #2f3c38;
  }
  * { margin: 0; box-sizing: border-box; }
  body {
    width: ${CARD.width}px;
    height: ${CARD.height}px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 76px 84px;
    background: var(--bg);
    color: var(--fg);
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .brand { display: flex; align-items: center; gap: 20px; font-size: 38px; font-weight: 700; letter-spacing: -0.02em; }
  .brand img { width: 64px; height: 64px; }
  h1 { font-size: 78px; line-height: 1.08; font-weight: 700; letter-spacing: -0.035em; max-width: 15ch; }
  .foot { display: flex; align-items: baseline; gap: 18px; font-size: 26px; color: var(--muted); }
  .foot .host { color: var(--accent); font-weight: 600; }
  .rule { height: 1px; background: var(--border); margin-bottom: 30px; }
</style>
<body>
  <div class="brand"><img src="${mark}" alt="">${SITE_NAME}</div>
  <h1>${FOOTER.statement}</h1>
  <div>
    <div class="rule"></div>
    <div class="foot"><span class="host">${SITE_HOST}</span><span>${FOOTER.company}</span></div>
  </div>
</body>
</html>
`;
}

/** Draws the card and writes it beside this file. */
export async function drawCard(to: string = join(root, "site", CARD.file)): Promise<string> {
  const svg = await readFile(join(root, "site", "icon.svg"), "utf8");
  const mark = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: CARD.width, height: CARD.height },
      deviceScaleFactor: 2,
      colorScheme: "dark",
    });
    await page.setContent(cardHtml(mark), { waitUntil: "load" });
    await writeFile(to, await page.screenshot({ type: "png" }));
    return to;
  } finally {
    await browser.close();
  }
}

if (import.meta.filename === process.argv[1]) console.log(`social card: ${await drawCard()}`);
