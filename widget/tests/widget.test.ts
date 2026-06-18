import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseSSEBuffer } from "../src/sse";
import { init } from "../src/widget";

describe("parseSSEBuffer", () => {
  it("extracts complete events and keeps the partial remainder", () => {
    const { events, rest } = parseSSEBuffer(
      'data: {"type":"token","text":"Hi"}\n\ndata: {"type":"to',
    );
    expect(events).toEqual([{ type: "token", text: "Hi" }]);
    expect(rest).toBe('data: {"type":"to');
  });
});

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

const CONFIG = {
  publicKey: "pk_test_123",
  name: "Acme Bot",
  chatUrl: "http://ai.local",
  theme: {
    primaryColor: "#4f46e5",
    position: "bottom-right",
    launcherText: "Chat",
    welcomeMessage: "Hello!",
  },
};

describe("widget mount + chat", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    const script = document.createElement("script");
    script.dataset.bot = "pk_test_123";
    script.dataset.api = "http://web.local";
    document.body.appendChild(script);
    localStorage.clear();
  });

  it("loads config, renders launcher, and streams a chat answer", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "http://web.local/api/widget/pk_test_123") {
        return new Response(JSON.stringify(CONFIG), { status: 200 });
      }
      if (url === "http://ai.local/chat") {
        return {
          ok: true,
          status: 200,
          body: sseStream([
            'data: {"type":"citations","citations":[]}\n\n',
            'data: {"type":"token","text":"Paris"}\n\n',
            'data: {"type":"token","text":" it is."}\n\n',
            'data: {"type":"done","conversationId":"c1","messageId":"m1"}\n\n',
          ]),
        } as unknown as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await init();

    const host = document.getElementById("chatforge-widget-host")!;
    expect(host).toBeTruthy();
    const root = host.shadowRoot!;
    expect(root.querySelector(".launcher")?.textContent).toBe("Chat");
    expect(root.querySelector(".header")?.textContent).toBe("Acme Bot");
    expect(root.querySelector(".msg.bot")?.textContent).toBe("Hello!");

    // send a message
    const input = root.querySelector<HTMLInputElement>(".input")!;
    const form = root.querySelector<HTMLFormElement>(".form")!;
    input.value = "What is the capital of France?";
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));

    // wait for the streamed answer to render
    await vi.waitFor(() => {
      const bubbles = root.querySelectorAll(".msg.bot");
      expect(bubbles[bubbles.length - 1].textContent).toBe("Paris it is.");
    });

    const userBubble = root.querySelector(".msg.user");
    expect(userBubble?.textContent).toBe("What is the capital of France?");
    expect(fetchMock).toHaveBeenCalledWith("http://ai.local/chat", expect.any(Object));
  });

  it("does nothing without data-bot", async () => {
    document.body.innerHTML = ""; // remove the script
    vi.stubGlobal("fetch", vi.fn());
    await init();
    expect(document.getElementById("chatforge-widget-host")).toBeNull();
  });
});
