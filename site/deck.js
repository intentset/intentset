// Present, for the introduction deck on intentset.org (INTRODUCTION in build.ts). The page is a Markset document that
// reads as a column of slides with their notes; this adds a Present button that shows one slide at a time, filling
// the screen, the way a presentation is given. Without scripting, or on a screen too small for the 16:9 frame, the
// page is exactly as it was. The slides are not copied or moved: presenting fixes the current one over the page, which
// deck.css draws (html.presenting), and makes everything else inert.
(() => {
  const main = document.querySelector("main.ms-document");
  const hint = main?.querySelector(".deck-hint");
  const slides = main ? [...main.querySelectorAll(":scope > .slide")] : [];
  if (!hint || slides.length === 0) return;

  // The frame's query in deck.css: below it the slides let go of 16:9, so there is nothing to present.
  const frame = window.matchMedia("(min-width: 60rem) and (min-height: 34rem)");
  const root = document.documentElement;
  let current = 0;
  let idleTimer = 0;

  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (name === "class") node.className = value;
      else if (name === "text") node.textContent = value;
      else node.setAttribute(name, value);
    }
    node.append(...children);
    return node;
  };

  // ---- markup -------------------------------------------------------------------------------------------------------
  const present = el("button", { type: "button", class: "deck-present-button", text: "Present" });
  const presentRow = el("p", { class: "deck-present" }, present);
  hint.before(presentRow);

  const counter = el("span", { class: "deck-count", "aria-live": "polite" });
  const previous = el("button", { type: "button", "aria-label": "Previous slide", text: "←" });
  const next = el("button", { type: "button", "aria-label": "Next slide", text: "→" });
  const notesToggle = el("button", { type: "button", "aria-pressed": "false", text: "Notes" });
  const exit = el("button", { type: "button", text: "Exit" });
  const notes = el("div", { class: "deck-notes", hidden: "" });
  const bar = el(
    "div",
    { class: "deck-bar", role: "toolbar", "aria-label": "Presentation", tabindex: "-1" },
    notes,
    el("div", { class: "deck-controls" }, previous, counter, next, notesToggle, exit),
  );

  // ---- presenting ---------------------------------------------------------------------------------------------------
  const presenting = () => root.classList.contains("presenting");

  // A slide's notes are the folded callout after it; the panel shows what it holds, without its title.
  const notesOf = (slide) => {
    const callout = slide.nextElementSibling;
    if (!callout?.classList.contains("notes")) return [];
    return [...callout.childNodes]
      .filter((n) => !(n instanceof Element && n.matches("summary")))
      .map((n) => n.cloneNode(true));
  };

  const show = (index) => {
    current = Math.max(0, Math.min(slides.length - 1, index));
    slides.forEach((slide, i) => {
      slide.classList.toggle("is-current", i === current);
      slide.inert = i !== current;
    });
    const slide = slides[current];
    counter.textContent = `${current + 1} / ${slides.length}`;
    previous.disabled = current === 0;
    next.disabled = current === slides.length - 1;
    notes.replaceChildren(...notesOf(slide));
    history.replaceState(null, "", `#${slide.id}`);
  };

  // Everything but the current slide and the bar is out of reach while presenting.
  const outside = () => [...document.body.children].filter((n) => n !== bar && !n.contains(main));
  const others = () => [...main.children].filter((n) => !n.classList.contains("slide"));

  const start = (index) => {
    if (presenting() || !frame.matches) return;
    document.body.append(bar);
    root.classList.add("presenting");
    for (const n of [...outside(), ...others()]) n.inert = true;
    show(index);
    root.requestFullscreen?.().catch(() => {});
    wake();
    // Focus moves into the presentation without marking a control, so Space presses nothing.
    bar.focus({ preventScroll: true });
  };

  const stop = () => {
    if (!presenting()) return;
    root.classList.remove("presenting", "idle");
    for (const n of [...outside(), ...others(), ...slides]) n.inert = false;
    for (const slide of slides) slide.classList.remove("is-current");
    bar.remove();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    slides[current].scrollIntoView({ block: "start" });
    present.focus({ preventScroll: true });
  };

  const toggleNotes = () => {
    const on = notes.hidden;
    notes.hidden = !on;
    root.classList.toggle("deck-with-notes", on);
    notesToggle.setAttribute("aria-pressed", String(on));
  };

  // The controls fade when the pointer rests, as a presentation's do, and return when it moves.
  const wake = () => {
    root.classList.remove("idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => presenting() && root.classList.add("idle"), 2500);
  };

  // ---- input --------------------------------------------------------------------------------------------------------
  // Starting from a slide's address presents that slide; otherwise the deck starts at the cover.
  present.addEventListener("click", () => {
    const named = slides.findIndex((s) => `#${s.id}` === location.hash);
    start(named === -1 ? 0 : named);
  });
  previous.addEventListener("click", () => show(current - 1));
  next.addEventListener("click", () => show(current + 1));
  notesToggle.addEventListener("click", toggleNotes);
  exit.addEventListener("click", stop);

  const KEYS = {
    ArrowRight: 1,
    ArrowDown: 1,
    PageDown: 1,
    " ": 1,
    ArrowLeft: -1,
    ArrowUp: -1,
    PageUp: -1,
    Backspace: -1,
  };
  document.addEventListener("keydown", (event) => {
    if (!presenting() || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key;
    if (key === "Escape") stop();
    else if (key === "Home") show(0);
    else if (key === "End") show(slides.length - 1);
    else if (key === "n" || key === "N") toggleNotes();
    else if (key in KEYS) {
      // Space and Enter on a focused control press it, so only a bare Space moves.
      if (key === " " && event.target instanceof HTMLButtonElement) return;
      show(current + (key === " " && event.shiftKey ? -1 : KEYS[key]));
    } else return;
    event.preventDefault();
    wake();
  });

  // A click on the slide, away from a link, moves on.
  for (const slide of slides) {
    slide.addEventListener("click", (event) => {
      if (presenting() && !(event.target instanceof Element && event.target.closest("a, button, summary"))) {
        show(current + 1);
      }
    });
  }

  document.addEventListener("pointermove", () => presenting() && wake());
  // Leaving full screen (the browser takes Esc for that) ends the presentation too.
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) stop();
  });
  const fit = () => {
    presentRow.hidden = !frame.matches;
    if (!frame.matches) stop();
  };
  frame.addEventListener("change", fit);
  fit();
})();
