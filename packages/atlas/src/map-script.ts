/**
 * The map's one script (ADR 0015), served beside the pages as `atlas-map.js` and loaded only by the map page. It adds
 * to the SVG that `map.ts` draws and changes nothing in it that a reader without the script needs: it shows the
 * controls, then lets a reader find a record by ID, show or hide each family, pan by dragging, zoom with the wheel or
 * the buttons, and select a record to dim everything but it and its links, with a panel listing them. A second
 * activation of a selected record follows its link. Escape clears the selection.
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

    function apply() {
      svg.setAttribute("viewBox", view.x + " " + view.y + " " + view.w + " " + view.h);
      svg.classList.toggle("am-zoomed", view.w < base.w / 2.5);
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
      if (event.key === "Escape" && selected) {
        const was = selected;
        clear();
        was.focus();
      }
    });

    function clear() {
      selected = null;
      svg.classList.remove("am-focus");
      for (const el of svg.querySelectorAll(".am-selected, .am-near")) el.classList.remove("am-selected", "am-near");
      panel.hidden = true;
      panel.replaceChildren();
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
      if (move) centre(el);
      describe(el, list);
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
  }
})();
`;
