/**
 * The map's one script (ADR 0015), served beside the pages as `atlas-map.js` and loaded only by the map page. It adds
 * to the SVG that `map.ts` draws and changes nothing in it that a reader without the script needs: it shows the
 * controls, then lets a reader find a record by ID, show or hide each family, pan by dragging, zoom with the wheel or
 * the buttons, and select a record to dim everything but it and its links, with a panel listing them. A second
 * activation of a selected record follows its link. Escape clears the selection, and then leaves full screen. Full
 * screen uses the browser's own where it has one, and a fixed overlay where it does not (an iPhone).
 *
 * Sizes are constant on screen, whatever the zoom (ADR 0015, amended): a record's circle and its ID keep about the size
 * they have at the map's fit, within bounds, and the IDs shown are those that fit. A small model (no `am-many` class)
 * shows every ID, as its layout spaced them. A large one shows an ID only where its box on screen overlaps no other
 * shown ID and no other record's circle, taking records in a fixed priority (the selected record and its links, the
 * focused one, then product, capability and slice records before behaviors, rules and checks, the most linked first),
 * so zooming in shows more of them and no two shown IDs ever overlap.
 *
 * Plain JavaScript with no dependency, written to the DOM with textContent only, so no record's text is ever parsed
 * as markup. It reads no storage and makes no request.
 */
export const MAP_SCRIPT = `"use strict";
(function () {
  for (const map of document.querySelectorAll(".am-map")) init(map);

  function init(map) {
    const svg = map.querySelector(".am-svg");
    const controls = map.querySelector(".am-controls");
    const panel = map.querySelector(".am-panel");
    const find = controls.querySelector("input[type=search]");
    if (!svg || !controls || !panel) return;
    const nodes = new Map();
    for (const el of svg.querySelectorAll(".am-node")) nodes.set(el.dataset.id, el);
    const links = new Map();
    for (const edge of svg.querySelectorAll(".am-edge")) {
      const from = edge.dataset.from;
      const to = edge.dataset.to;
      const kind = (edge.querySelector("title") || { textContent: "" }).textContent.split(" ")[1] || "";
      add(from, { edge, other: to, kind, out: true });
      add(to, { edge, other: from, kind, out: false });
    }
    function add(id, link) {
      if (!links.has(id)) links.set(id, []);
      links.get(id).push(link);
    }
    controls.hidden = false;

    const vb = svg.viewBox.baseVal;
    const base = { x: vb.x, y: vb.y, w: vb.width, h: vb.height };
    let view = { x: base.x, y: base.y, w: base.w, h: base.h };
    let selected = null;
    const many = svg.classList.contains("am-many");
    svg.classList.add("am-js");

    // What the label pass needs of each record, read once: its place, its drawn radius, its text, and its rank.
    const TIER = { product: 0, intent: 0, outcome: 0, measure: 1, capability: 1, slice: 1, behavior: 2, decision: 2, contract: 2, rule: 3, scenario: 3, knowledge: 4, verification: 4 };
    const items = [];
    for (const el of nodes.values()) {
      const circle = el.querySelector("circle");
      const text = el.querySelector("text");
      items.push({
        el: el,
        circle: circle,
        text: text,
        i: items.length,
        id: el.dataset.id,
        group: el.dataset.group,
        x: Number(circle.getAttribute("cx")),
        y: Number(circle.getAttribute("cy")),
        r: Number(circle.getAttribute("r")),
        len: text.textContent.length,
        tier: TIER[el.dataset.type] === undefined ? 3 : TIER[el.dataset.type],
        degree: (links.get(el.dataset.id) || []).length,
        shown: !many,
        sized: -1,
        view: false,
      });
    }
    // The priority order: a lower tier first, then the more linked, then by ID, so it never depends on the DOM's order.
    const order = items.slice().sort(rankOrder);
    const byId = new Map(items.map(function (item) { return [item.id, item]; }));
    const hidden = new Set();
    // Constants in CSS pixels: the type size, a label's height, its gap from its circle, how wide an uppercase ID is per
    // unit of type size (generous), the circle's smallest radius and the most it grows from its fit-size, the grid cell.
    const FONT = 12;
    const BOX_H = 16;
    const GAP = 4;
    const EM = 0.7;
    const MIN_R = 2.5;
    const GROW = 1.5;
    const CELL = 8;
    let sizing = 0;
    let lastScale = -1;
    let grid = new Int32Array(0);
    let cols = 0;
    let gridRows = 0;
    let gridPad = 0;

    function apply() {
      svg.setAttribute("viewBox", view.x + " " + view.y + " " + view.w + " " + view.h);
      relabel();
    }
    // Sizes every record in view and decides which IDs show. Run on every view change: one pass over the records and,
    // for a large model, one greedy pass over the ranked ones, on a grid of CELL-pixel cells holding who took each.
    function relabel() {
      const rect = svg.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0)) return;
      const s = scale();
      if (s !== lastScale) {
        lastScale = s;
        sizing++;
      }
      const origin = toSvg(rect.left, rect.top);
      // Records left of the frame may still have an ID reaching into it, so the grid starts a long label's width left.
      const padLeft = many ? Math.ceil(36 * FONT * EM) : 0;
      cols = Math.ceil((rect.width + padLeft) / CELL) + 1;
      const rows = Math.ceil((rect.height + 2 * BOX_H) / CELL) + 1;
      if (many) {
        if (grid.length < cols * rows) grid = new Int32Array(cols * rows);
        else grid.fill(0, 0, cols * rows);
        gridRows = rows;
        gridPad = padLeft;
      }
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        item.px = (item.x - origin.x) / s;
        item.py = (item.y - origin.y) / s;
        item.view =
          !hidden.has(item.group) &&
          item.px >= -padLeft &&
          item.px <= rect.width - 8 &&
          item.py >= -BOX_H &&
          item.py <= rect.height + BOX_H;
        if (!item.view) continue;
        if (item.sized !== sizing) {
          item.sized = sizing;
          // The circle at its fit-size where zoomed out, at most GROW times that on screen where zoomed in, and never
          // under MIN_R pixels: a circle never balloons with the zoom.
          item.ru = Math.max(MIN_R * s, Math.min(item.r, GROW * item.r * s));
          item.circle.setAttribute("r", String(item.ru));
        }
        item.rpx = item.ru / s;
      }
      const fontUnits = many ? FONT * s : Math.min(FONT * s, 9);
      const fontPx = fontUnits / s;
      for (const item of items) item.next = !many;
      if (many) {
        // Shown whatever is under them: the selected record and the focused one. Then the selected record's links, then
        // every other record by rank (none, when a record is selected: the rest of the map is dimmed), each only where
        // its box overlaps no shown ID and no circle of a record ranked before it.
        const focus = document.activeElement && document.activeElement.closest ? document.activeElement.closest(".am-node") : null;
        const must = [];
        if (selected) must.push(byId.get(selected.dataset.id));
        if (focus && nodes.get(focus.dataset.id) === focus) must.push(byId.get(focus.dataset.id));
        for (const item of must) {
          if (!item.view) continue;
          item.next = true;
          take(item.px + item.rpx + GAP, item.py - BOX_H / 2, item.px + item.rpx + GAP + item.len * fontPx * EM, item.py + BOX_H / 2, item.i + 1);
        }
        const rest = selected ? (links.get(selected.dataset.id) || []).map(function (link) { return byId.get(link.other); }).filter(Boolean).sort(rankOrder) : order;
        for (const item of rest) {
          if (!item.view || item.next) continue;
          item.next = place(item, fontPx);
          // Its circle then holds its place against the records ranked after it, which keep clear of it.
          take(item.px - item.rpx, item.py - item.rpx, item.px + item.rpx, item.py + item.rpx, item.i + 1);
        }
      }
      for (const item of items) {
        if (item.next !== item.shown) {
          item.shown = item.next;
          item.el.classList.toggle("am-label", item.shown);
        }
        if (item.shown && item.view) {
          const t = item.text;
          t.setAttribute("x", String(item.x + item.ru + GAP * s));
          t.setAttribute("y", String(item.y + fontUnits * 0.35));
          t.setAttribute("font-size", String(fontUnits));
          t.setAttribute("stroke-width", String(3 * s));
        }
      }
    }
    function rankOrder(a, b) {
      return a.tier - b.tier || b.degree - a.degree || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    }
    // Take the record's label box if nothing is in it, and say whether it did. The record's own circle is not in the way.
    function place(item, fontPx) {
      const left = item.px + item.rpx + GAP;
      const top = item.py - BOX_H / 2;
      const owner = item.i + 1;
      const c = span(left, top, left + item.len * fontPx * EM, top + BOX_H);
      for (let y = c[1]; y <= c[3]; y++) {
        for (let x = c[0]; x <= c[2]; x++) {
          const v = grid[y * cols + x];
          if (v !== 0 && v !== owner) return false;
        }
      }
      take(left, top, left + item.len * fontPx * EM, top + BOX_H, owner);
      return true;
    }
    function span(l, t, r, b) {
      const last = cols - 1;
      return [
        Math.min(last, Math.max(0, Math.floor((l + gridPad) / CELL))),
        Math.min(gridRows - 1, Math.max(0, Math.floor((t + BOX_H) / CELL))),
        Math.min(last, Math.max(0, Math.floor((r + gridPad) / CELL))),
        Math.min(gridRows - 1, Math.max(0, Math.floor((b + BOX_H) / CELL))),
      ];
    }
    function take(l, t, r, b, owner) {
      const c = span(l, t, r, b);
      for (let y = c[1]; y <= c[3]; y++) {
        for (let x = c[0]; x <= c[2]; x++) grid[y * cols + x] = owner;
      }
    }
    function scale() {
      const r = svg.getBoundingClientRect();
      return Math.max(view.w / r.width, view.h / r.height);
    }
    function toSvg(clientX, clientY) {
      const r = svg.getBoundingClientRect();
      const s = scale();
      const ox = (r.width * s - view.w) / 2;
      const oy = (r.height * s - view.h) / 2;
      return { x: view.x - ox + (clientX - r.left) * s, y: view.y - oy + (clientY - r.top) * s };
    }
    function zoom(factor, at) {
      const p = at || { x: view.x + view.w / 2, y: view.y + view.h / 2 };
      const w = Math.min(base.w * 2, Math.max(base.w / 40, view.w * factor));
      const k = w / view.w;
      view = { x: p.x - (p.x - view.x) * k, y: p.y - (p.y - view.y) * k, w: w, h: view.h * k };
      apply();
    }
    function centre(el) {
      const c = el.querySelector("circle");
      const x = Number(c.getAttribute("cx"));
      const y = Number(c.getAttribute("cy"));
      // Close enough to read a record's neighbours, never closer than about 420 units across, so a small model is
      // centred rather than magnified.
      const target = Math.max(base.w / 3, Math.min(base.w, 420));
      if (view.w > target) {
        const k = target / view.w;
        view.w *= k;
        view.h *= k;
      }
      view.x = x - view.w / 2;
      view.y = y - view.h / 2;
      // In full screen the panel lies over the map's lower corner: centre the record in what it leaves visible.
      if (!panel.hidden && getComputedStyle(panel).position === "absolute") {
        const sr = svg.getBoundingClientRect();
        const pr = panel.getBoundingClientRect();
        const covered = Math.max(0, sr.bottom - pr.top);
        if (pr.width > sr.width / 2) view.y += (covered / 2) * scale();
      }
      apply();
    }

    svg.addEventListener(
      "wheel",
      function (event) {
        event.preventDefault();
        zoom(event.deltaY > 0 ? 1.2 : 1 / 1.2, toSvg(event.clientX, event.clientY));
      },
      { passive: false },
    );
    let drag = null;
    let dragged = false;
    svg.addEventListener("pointerdown", function (event) {
      drag = { x: event.clientX, y: event.clientY, view: { x: view.x, y: view.y }, id: event.pointerId };
      dragged = false;
    });
    svg.addEventListener("pointermove", function (event) {
      if (!drag || drag.id !== event.pointerId) return;
      const mx = event.clientX - drag.x;
      const my = event.clientY - drag.y;
      if (!dragged && Math.abs(mx) + Math.abs(my) < 5) return;
      if (!dragged) {
        dragged = true;
        svg.setPointerCapture(event.pointerId);
        svg.classList.add("am-grabbing");
      }
      const s = scale();
      view.x = drag.view.x - mx * s;
      view.y = drag.view.y - my * s;
      apply();
    });
    function release(event) {
      if (drag && drag.id === event.pointerId) drag = null;
      svg.classList.remove("am-grabbing");
    }
    svg.addEventListener("pointerup", release);
    svg.addEventListener("pointercancel", release);

    svg.addEventListener("click", function (event) {
      const el = event.target.closest(".am-node");
      if (dragged) {
        event.preventDefault();
        dragged = false;
        return;
      }
      if (!el) {
        clear();
        return;
      }
      if (el === selected && el.hasAttribute("href")) return;
      event.preventDefault();
      select(el.dataset.id, false);
    });
    svg.addEventListener("keydown", function (event) {
      const el = event.target.closest(".am-node");
      if (el && !el.hasAttribute("href") && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        select(el.dataset.id, false);
      }
    });
    map.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (selected) {
        const was = selected;
        clear();
        was.focus();
      } else if (map.classList.contains("am-expanded")) {
        expand(false);
      }
    });

    const full = controls.querySelector(".am-full");
    const native = typeof map.requestFullscreen === "function" && document.fullscreenEnabled !== false;
    function expanded() {
      return document.fullscreenElement === map || map.classList.contains("am-expanded");
    }
    function label() {
      const on = expanded();
      full.textContent = on ? "Exit full screen" : "Full screen";
      full.setAttribute("aria-pressed", on ? "true" : "false");
    }
    function expand(on) {
      if (native) {
        // The label follows as soon as the browser has changed state, and again on its fullscreenchange event.
        if (on) map.requestFullscreen().then(label, function () { overlay(true); });
        else if (document.fullscreenElement === map) document.exitFullscreen().then(label, label);
        else overlay(false);
      } else overlay(on);
    }
    // The overlay moves the map to the end of <body> while it is open, so no ancestor's layout can contain it, and
    // puts it back where it was when it closes.
    let placeholder = null;
    function overlay(on) {
      if (on && !placeholder) {
        placeholder = document.createComment("atlas map");
        map.before(placeholder);
        document.body.append(map);
      } else if (!on && placeholder) {
        placeholder.replaceWith(map);
        placeholder = null;
      }
      map.classList.toggle("am-expanded", on);
      document.documentElement.style.overflow = on ? "hidden" : "";
      label();
      if (selected) selected.focus();
      else full.focus();
    }
    if (full) {
      full.addEventListener("click", function () {
        expand(!expanded());
      });
      document.addEventListener("fullscreenchange", label);
    }

    function clear() {
      selected = null;
      svg.classList.remove("am-focus");
      for (const el of svg.querySelectorAll(".am-selected, .am-near")) el.classList.remove("am-selected", "am-near");
      panel.hidden = true;
      panel.replaceChildren();
      relabel();
    }
    function select(id, move) {
      const el = nodes.get(id);
      if (!el) return;
      clear();
      selected = el;
      svg.classList.add("am-focus");
      el.classList.add("am-selected");
      const list = links.get(id) || [];
      for (const link of list) {
        link.edge.classList.add("am-near");
        const other = nodes.get(link.other);
        if (other) other.classList.add("am-near");
      }
      describe(el, list);
      if (move) centre(el);
      else relabel();
    }
    function describe(el, list) {
      const heading = document.createElement("h3");
      heading.textContent = el.dataset.id + ": " + el.dataset.title;
      const facts = document.createElement("p");
      const words = [el.dataset.type, el.dataset.status];
      if (el.dataset.evidence) words.push("evidence " + el.dataset.evidence);
      facts.textContent = words.join(" · ");
      panel.replaceChildren(heading, facts);
      if (el.hasAttribute("href")) {
        const open = document.createElement("a");
        open.href = el.getAttribute("href");
        open.textContent = "Open its page";
        const p = document.createElement("p");
        p.append(open);
        panel.append(p);
      }
      const intro = document.createElement("p");
      intro.textContent = list.length === 0 ? "No links." : list.length + (list.length === 1 ? " link:" : " links:");
      panel.append(intro);
      if (list.length > 0) {
        const ul = document.createElement("ul");
        const sorted = list.slice().sort(function (a, b) {
          return a.other < b.other ? -1 : a.other > b.other ? 1 : 0;
        });
        for (const link of sorted) {
          const li = document.createElement("li");
          const go = document.createElement("button");
          go.type = "button";
          go.textContent = link.other;
          go.addEventListener("click", function () {
            select(link.other, true);
            const target = nodes.get(link.other);
            if (target) target.focus();
          });
          li.append(link.out ? link.kind + " → " : "← " + link.kind + " ", go);
          ul.append(li);
        }
        panel.append(ul);
      }
      panel.hidden = false;
    }

    function search() {
      const value = find.value.trim().toUpperCase();
      if (value === "") return;
      for (const id of nodes.keys()) {
        if (id.toUpperCase() === value) {
          select(id, true);
          nodes.get(id).focus();
          return;
        }
      }
      clear();
      const none = document.createElement("p");
      none.textContent = "No record has the ID " + find.value.trim() + ".";
      panel.replaceChildren(none);
      panel.hidden = false;
    }
    find.addEventListener("change", search);
    find.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        search();
      }
    });
    for (const box of controls.querySelectorAll("input[type=checkbox][data-group]")) {
      box.addEventListener("change", function () {
        svg.classList.toggle("am-hide-" + box.dataset.group, !box.checked);
        if (box.checked) hidden.delete(box.dataset.group);
        else hidden.add(box.dataset.group);
        relabel();
      });
    }
    for (const button of controls.querySelectorAll("button[data-zoom]")) {
      button.addEventListener("click", function () {
        if (button.dataset.zoom === "in") zoom(1 / 1.5);
        else if (button.dataset.zoom === "out") zoom(1.5);
        else {
          view = { x: base.x, y: base.y, w: base.w, h: base.h };
          apply();
        }
      });
    }
    // A record taking focus shows its ID, and the sizes follow the frame when it changes (full screen, a rotation).
    svg.addEventListener("focusin", relabel);
    svg.addEventListener("focusout", relabel);
    if (typeof ResizeObserver === "function") new ResizeObserver(relabel).observe(svg);
    relabel();
  }
})();
`;
