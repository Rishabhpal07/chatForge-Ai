import { readSSE } from "./sse";
import { buildStyles } from "./styles";

interface WidgetConfig {
  publicKey: string;
  name: string;
  chatUrl: string;
  theme: {
    primaryColor: string;
    position: "bottom-right" | "bottom-left";
    launcherText: string;
    welcomeMessage: string;
  };
}

const VISITOR_KEY = "chatforge_visitor";

function getVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function findScript(): HTMLScriptElement | null {
  const cur = document.currentScript as HTMLScriptElement | null;
  if (cur?.dataset.bot) return cur;
  return document.querySelector<HTMLScriptElement>("script[data-bot]");
}

/** Bootstrap: read config from the data-bot key, then mount the widget. */
export async function init(): Promise<void> {
  const script = findScript();
  const publicKey = script?.dataset.bot;
  if (!publicKey) {
    console.error("[chatforge] missing data-bot attribute on <script>");
    return;
  }
  const configBase =
    script?.dataset.api ||
    (script?.src ? new URL(script.src).origin : window.location.origin);

  try {
    const res = await fetch(`${configBase}/api/widget/${publicKey}`);
    if (!res.ok) throw new Error(`config ${res.status}`);
    const config = (await res.json()) as WidgetConfig;
    mount(config);
  } catch (err) {
    console.error("[chatforge] failed to load widget config", err);
  }
}

/** Render the launcher + chat panel inside an isolated Shadow DOM. */
export function mount(config: WidgetConfig): ShadowRoot {
  const host = document.createElement("div");
  host.id = "chatforge-widget-host";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  const theme = config.theme;
  const posClass = theme.position === "bottom-left" ? "pos-left" : "pos-right";

  const style = document.createElement("style");
  style.textContent = buildStyles(theme.primaryColor);
  root.appendChild(style);

  const launcher = document.createElement("button");
  launcher.className = `launcher ${posClass}`;
  launcher.textContent = theme.launcherText;

  const panel = document.createElement("div");
  panel.className = `panel ${posClass}`;
  panel.innerHTML = `
    <div class="header">${escapeHtml(config.name)}</div>
    <div class="messages" part="messages"></div>
    <form class="form">
      <input class="input" type="text" placeholder="Type a message…" autocomplete="off" />
      <button class="send" type="submit">Send</button>
    </form>`;

  root.appendChild(launcher);
  root.appendChild(panel);

  const messages = panel.querySelector<HTMLDivElement>(".messages")!;
  const form = panel.querySelector<HTMLFormElement>(".form")!;
  const input = panel.querySelector<HTMLInputElement>(".input")!;
  const send = panel.querySelector<HTMLButtonElement>(".send")!;

  if (theme.welcomeMessage) addBubble(messages, "bot", theme.welcomeMessage);

  launcher.addEventListener("click", () => panel.classList.toggle("open"));

  const visitorId = getVisitorId();
  let conversationId: string | undefined;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || send.disabled) return;
    input.value = "";
    send.disabled = true;
    addBubble(messages, "user", text);
    const bot = addBubble(messages, "bot", "");
    let raw = "";
    const render = () => {
      bot.innerHTML = renderMarkdown(raw);
      messages.scrollTop = messages.scrollHeight;
    };

    try {
      const res = await fetch(`${config.chatUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_key: config.publicKey,
          visitor_id: visitorId,
          conversation_id: conversationId,
          message: text,
        }),
      });
      if (!res.ok || !res.body) {
        bot.textContent = `Sorry, something went wrong (${res.status}).`;
        return;
      }
      for await (const evt of readSSE(res.body)) {
        if (evt.type === "token") {
          raw += evt.text;
          render();
        } else if (evt.type === "done") {
          conversationId = evt.conversationId;
        } else if (evt.type === "error") {
          raw += (raw ? "\n\n" : "") + (evt.message || "Sorry, something went wrong. Please try again.");
          render();
        }
      }
    } catch (err) {
      bot.textContent = "Sorry, I couldn't reach the server.";
      console.error("[chatforge] chat error", err);
    } finally {
      send.disabled = false;
      input.focus();
    }
  });

  return root;
}

function addBubble(
  container: HTMLElement,
  role: "user" | "bot",
  text: string,
): HTMLDivElement {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = text;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Inline markdown on an already HTML-escaped string: code, bold, italic, links. */
function renderInline(s: string): string {
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  return s;
}

/** Minimal, XSS-safe markdown → HTML: escapes everything first, then builds only our own
 * whitelisted tags. Handles paragraphs, bold/italic/code/links, bullet & numbered lists,
 * headings (as bold), and fenced code blocks. */
function renderMarkdown(src: string): string {
  const lines = escapeHtml(src).split("\n");
  let html = "";
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  let inCode = false;
  let code: string[] = [];
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  const flushPara = () => {
    if (para.length) { html += `<p>${renderInline(para.join(" "))}</p>`; para = []; }
  };
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) { html += `<pre><code>${code.join("\n")}</code></pre>`; code = []; inCode = false; }
      else { flushPara(); closeList(); inCode = true; }
      continue;
    }
    if (inCode) { code.push(line); continue; }
    const t = line.trim();
    if (!t) { flushPara(); closeList(); continue; }
    const h = t.match(/^#{1,6}\s+(.*)/);
    const ul = t.match(/^[-*]\s+(.*)/);
    const ol = t.match(/^\d+\.\s+(.*)/);
    if (h) { flushPara(); closeList(); html += `<strong class="md-h">${renderInline(h[1])}</strong>`; }
    else if (ul) {
      flushPara();
      if (list !== "ul") { closeList(); html += "<ul>"; list = "ul"; }
      html += `<li>${renderInline(ul[1])}</li>`;
    } else if (ol) {
      flushPara();
      if (list !== "ol") { closeList(); html += "<ol>"; list = "ol"; }
      html += `<li>${renderInline(ol[1])}</li>`;
    } else { closeList(); para.push(t); }
  }
  if (inCode) html += `<pre><code>${code.join("\n")}</code></pre>`;
  flushPara();
  closeList();
  return html;
}
