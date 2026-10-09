// The chat panel on intentset.org (SLICE-ASK). Loaded only when the site is built with the chat's address; without
// scripting, or without this file, the documentation is exactly as it was. It sends a question and the conversation so
// far to POST /ask and renders the answer as it streams back, one JSON event per line, with the sources each part
// cites. The conversation is kept in this tab's sessionStorage, so it survives moving between pages, and nowhere else.
(() => {
  const script = document.currentScript;
  const askUrl = script?.dataset.askUrl;
  const privacyUrl = script?.dataset.privacyUrl ?? "/privacy/";
  if (!askUrl || typeof fetch !== "function" || typeof TextDecoder !== "function") return;

  const STORAGE = "intentset-chat";
  const MAX_CHARS = 1000;
  const MESSAGES = {
    "too-long": `That question is longer than ${MAX_CHARS.toLocaleString("en")} characters. Try a shorter one.`,
    "too-many-turns": "This conversation has reached its length. Start a new one to keep asking.",
    "visitor-limit":
      "You have reached today's limit of questions. The chat answers again tomorrow, and the documentation is all here to read.",
    budget: "The chat is not answering right now. The documentation is all here to read.",
    off: "The chat is not answering right now. The documentation is all here to read.",
    declined: "The chat could not answer that one. Try asking it another way, or read on from the start page.",
    failed: "The answer could not be finished. Try again in a moment.",
  };

  const fresh = () => ({ conversationId: newId(), open: false, turns: [] });
  let state = load() ?? fresh();
  let busy = false;

  // ---- markup -------------------------------------------------------------------------------------------------------
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

  const launcher = el("button", {
    type: "button",
    class: "chat-launch",
    "aria-haspopup": "dialog",
    "aria-controls": "chat-panel",
    "aria-expanded": "false",
    text: "Ask the docs",
  });
  const close = el("button", { type: "button", class: "chat-icon", "aria-label": "Close the chat", text: "×" });
  const restart = el("button", { type: "button", class: "chat-text-button", text: "New conversation" });
  const notice = el(
    "p",
    { class: "chat-notice" },
    "Answers come only from this site's documentation, with links to their sources. Questions and answers are kept for 90 days to improve the documentation, with nothing that identifies you, so please leave out personal or confidential information. ",
    el("a", { href: privacyUrl, text: "Privacy" }),
  );
  const log = el("div", { class: "chat-log", role: "log", "aria-live": "polite", "aria-relevant": "additions text" });
  const input = el("textarea", {
    id: "chat-question",
    name: "question",
    rows: "2",
    maxlength: String(MAX_CHARS),
    placeholder: "Ask a question about Intentset",
    autocomplete: "off",
  });
  const send = el("button", { type: "submit", class: "chat-send", text: "Ask" });
  const form = el(
    "form",
    { class: "chat-form" },
    el("label", { for: "chat-question", class: "chat-visually-hidden", text: "Your question" }),
    input,
    send,
  );
  const panel = el(
    "dialog",
    { id: "chat-panel", class: "chat-panel", "aria-labelledby": "chat-title" },
    el("div", { class: "chat-head" }, el("h2", { id: "chat-title", text: "Ask the docs" }), restart, close),
    notice,
    log,
    form,
  );
  document.body.append(launcher, panel);

  // ---- behaviour ----------------------------------------------------------------------------------------------------
  function open() {
    if (!panel.open) panel.show();
    launcher.setAttribute("aria-expanded", "true");
    launcher.hidden = true;
    state.open = true;
    save();
    input.focus();
  }
  function shut() {
    panel.close();
    launcher.hidden = false;
    launcher.setAttribute("aria-expanded", "false");
    state.open = false;
    save();
    launcher.focus();
  }
  launcher.addEventListener("click", open);
  close.addEventListener("click", shut);
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      shut();
    }
  });
  restart.addEventListener("click", () => {
    if (busy) return;
    state = { ...fresh(), open: true };
    save();
    render();
    input.focus();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || busy) return;
    input.value = "";
    ask(question);
  });

  async function ask(question) {
    const history = state.turns
      .filter((turn) => turn.status === "done")
      .map((turn) => ({ question: turn.question, answer: turn.answer }));
    const turn = { question, text: "", sources: [], answer: [], status: "streaming", message: "" };
    state.turns.push(turn);
    setBusy(true);
    const view = renderTurn(turn);
    log.append(view.node);
    view.node.scrollIntoView({ block: "end" });
    try {
      const response = await fetch(askUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: state.conversationId, question, history }),
      });
      if (!response.body) throw new Error("no body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        let newline = buffer.indexOf("\n");
        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) apply(turn, JSON.parse(line));
          newline = buffer.indexOf("\n");
        }
        view.update();
        if (done) break;
      }
      if (turn.status === "streaming") fail(turn, "failed");
    } catch {
      fail(turn, "failed");
    }
    view.update();
    setBusy(false);
    save();
    input.focus();
  }

  function apply(turn, event) {
    if (event.type === "text") turn.text += event.text;
    else if (event.type === "sources") {
      for (const source of event.sources) {
        if (!turn.sources.some((known) => known.url === source.url)) turn.sources.push(source);
      }
    } else if (event.type === "done") {
      turn.status = "done";
      turn.answer = event.answer;
    } else if (event.type === "refused") fail(turn, event.reason);
    else if (event.type === "error") fail(turn, "failed");
  }

  function fail(turn, reason) {
    turn.status = "failed";
    turn.message = MESSAGES[reason] ?? MESSAGES.failed;
  }

  function setBusy(value) {
    busy = value;
    send.disabled = value;
    restart.disabled = value;
    log.setAttribute("aria-busy", String(value));
  }

  function renderTurn(turn) {
    const answer = el("div", { class: "chat-a" });
    const node = el("div", { class: "chat-turn" }, el("p", { class: "chat-q", text: turn.question }), answer);
    const update = () => {
      answer.replaceChildren(...markdown(turn.text));
      if (turn.status === "streaming" && !turn.text)
        answer.append(el("p", { class: "chat-pending", text: "Reading the documentation…" }));
      if (turn.sources.length) {
        const list = el("p", { class: "chat-sources" }, "Sources: ");
        turn.sources.forEach((source, i) => {
          if (i) list.append(", ");
          list.append(el("a", { href: source.url, text: source.title }));
        });
        answer.append(list);
      }
      if (turn.message) answer.append(el("p", { class: "chat-message", text: turn.message }));
    };
    update();
    return { node, update };
  }

  function render() {
    log.replaceChildren(...state.turns.map((turn) => renderTurn(turn).node));
  }

  // A small, safe Markdown: paragraphs, lists, inline code, bold, emphasis and http(s) links. Built as DOM nodes, never
  // as HTML, so nothing in an answer can become markup.
  function markdown(text) {
    const blocks = [];
    let list = null;
    for (const raw of text.split("\n")) {
      const line = raw.trimEnd();
      const item = /^\s*(?:[-*]|(\d+)\.)\s+(.*)$/.exec(line);
      if (item) {
        const ordered = item[1] !== undefined;
        if (!list || list.ordered !== ordered) {
          list = { ordered, node: el(ordered ? "ol" : "ul") };
          blocks.push(list.node);
        }
        list.node.append(el("li", {}, ...inline(item[2])));
      } else if (line.trim() === "") {
        list = null;
      } else {
        list = null;
        const last = blocks.at(-1);
        if (last?.tagName === "P" && !last.dataset.closed) last.append(" ", ...inline(line.trim()));
        else blocks.push(el("p", {}, ...inline(line.trim())));
      }
      if (line.trim() === "" && blocks.at(-1)?.tagName === "P") blocks.at(-1).dataset.closed = "1";
    }
    return blocks;
  }

  function inline(text) {
    const out = [];
    const pattern =
      /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)<]+[^\s)<.,;:!?])/g;
    let at = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > at) out.push(text.slice(at, match.index));
      if (match[1] !== undefined) out.push(el("code", { text: match[1] }));
      else if (match[2] !== undefined) out.push(el("strong", { text: match[2] }));
      else if (match[3] !== undefined) out.push(el("em", { text: match[3] }));
      else if (match[4] !== undefined) out.push(el("a", { href: match[5], text: match[4] }));
      else out.push(el("a", { href: match[6], text: match[6] }));
      at = match.index + match[0].length;
    }
    if (at < text.length) out.push(text.slice(at));
    return out;
  }

  function newId() {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function load() {
    try {
      const value = JSON.parse(sessionStorage.getItem(STORAGE) ?? "null");
      return value && typeof value.conversationId === "string" && Array.isArray(value.turns) ? value : null;
    } catch {
      return null;
    }
  }

  function save() {
    try {
      sessionStorage.setItem(STORAGE, JSON.stringify(state));
    } catch {
      // A tab that cannot store keeps the conversation until it navigates.
    }
  }

  render();
  if (state.open) {
    panel.show();
    launcher.hidden = true;
    launcher.setAttribute("aria-expanded", "true");
  }
})();
