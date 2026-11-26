/**
 * map.html: the model as one picture (ADR 0015, amended 2026-11-26): its purpose on top, its capabilities beneath, each
 * holding its detail until a reader opens it. The map comes first: one sentence says what it shows, then the SVG
 * `map.ts` draws stands in the page's map slot, and how to read and use it follows below it. The one script the Atlas carries makes it explorable; without the script the picture stands, and every record
 * with a page is a link.
 */
import { type AtlasMapLayout, GROUPS, type Group, LABEL_LIMIT } from "../map.ts";
import { MAP_SLOT_SOURCE, type PageSource } from "../page.ts";
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
      `How everything connects, with the product's purpose on top and each capability beneath, holding its records ` +
        `until you open it: ${plural(layout.nodes.length, "record")} and ${plural(layout.edges.length, "link")}.`,
      "",
      ...MAP_SLOT_SOURCE,
      "",
      "## Reading the map",
      "",
      "Products, intents and outcomes are the top rows, each outcome's measures beside it. Beneath them every " +
        "capability is one node, its count the records it holds: its behaviors, their rules and scenarios, the " +
        "checks and the help that cover them, and the code that delivers them. Records no capability reaches follow " +
        "in a row of their own. Open a capability to see its records laid out in columns, behaviors first, with the " +
        "code beneath; one capability is open at a time. A record two capabilities reach is drawn in the first, by " +
        "ID, and its links to the other are listed when you select it. A record's own page shows its neighborhood.",
      "",
      "- **Color** is the record's family:",
      ...counts.map((g) => `  - ${text(g.label)}: ${g.types.join(", ")} (${g.n})`),
      "- **A dashed outline** is a draft.",
      "- **A verification's ring** repeats its evidence status: green only for a current pass, red for failing, " +
        "amber for stale, skipped or missing, grey when not assessed. The status is also in the record's title, " +
        "so nothing is said by color alone.",
      "",
      "## Using the map",
      "",
      "Select a capability to open it, and choose All capabilities to fold it again. Find a record by its ID, which " +
        "opens the capability that holds it, show or hide each family, drag to move, use the wheel or the buttons to " +
        "zoom, and choose Full screen to give the map the whole screen. " +
        "Select a record to see only it and what it links to, with the links listed under the map; select it again " +
        "to open its page, and press Escape to see everything again. Without the script the map shows the " +
        "capabilities folded, and each is a link to its page." +
        (layout.nodes.length > LABEL_LIMIT ? " IDs show when you zoom in or select a record." : ""),
      "",
    ],
    html: "",
    scripts: ["atlas-map.js"],
  };
}
