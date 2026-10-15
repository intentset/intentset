/**
 * map.html: every record and every authored link as one picture (ADR 0015). The page's Markset source says what the
 * map shows and how to read it; the map itself is the SVG `map.ts` draws, placed after it, and the one script the
 * Atlas carries makes it explorable. Without the script the picture stands, and every record with a page is a link.
 */
import { type AtlasMapLayout, GROUPS, type Group, LABEL_LIMIT } from "../map.ts";
import type { PageSource } from "../page.ts";
import { plural, text } from "../text.ts";

export function mapPage(layout: AtlasMapLayout): PageSource {
  const counts = (Object.entries(GROUPS) as [Group, (typeof GROUPS)[Group]][])
    .map(([group, { label, types }]) => ({
      label,
      types,
      n: layout.nodes.filter((node) => node.group === group).length,
    }))
    .filter((g) => g.n > 0);
  return {
    path: "map.html",
    title: "Map of the model",
    body: [
      "{.lead}",
      `Every record in this snapshot and every link written between them: ${plural(layout.nodes.length, "record")} ` +
        `and ${plural(layout.edges.length, "link")}. Records that link to each other are drawn near each other, so ` +
        "a capability sits among its behaviors, and a behavior among its rules, its slice and its checks.",
      "",
      "Find a record by its ID, show or hide each family, drag to move, use the wheel or the buttons to zoom, and " +
        "choose Full screen to give the map the whole screen. " +
        "Select a record to see only it and what it links to, with the links listed under the map; select it again " +
        "to open its page, and press Escape to see everything again." +
        (layout.nodes.length > LABEL_LIMIT ? " IDs show when you zoom in or select a record." : ""),
      "",
      "- **Color** is the record's family:",
      ...counts.map((g) => `  - ${text(g.label)}: ${g.types.join(", ")} (${g.n})`),
      "- **A dashed outline** is a draft.",
      "- **A verification's ring** repeats its evidence status: green only for a current pass, red for failing, " +
        "amber for stale, skipped or missing, grey when not assessed. The status is also in the record's title, " +
        "so nothing is said by color alone.",
      "",
    ],
    html: "",
    scripts: ["atlas-map.js"],
  };
}
