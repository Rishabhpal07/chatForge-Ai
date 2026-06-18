/** Server-Sent Events parsing for the chat stream. */

export type WidgetEvent =
  | { type: "token"; text: string }
  | { type: "citations"; citations: unknown[] }
  | { type: "done"; conversationId: string; messageId: string }
  | { type: "error"; code: string; message: string };

/** Pure: split a growing buffer into complete SSE events + the unparsed remainder. */
export function parseSSEBuffer(buffer: string): {
  events: WidgetEvent[];
  rest: string;
} {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: WidgetEvent[] = [];
  for (const part of parts) {
    for (const line of part.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        events.push(JSON.parse(line.slice(6)) as WidgetEvent);
      } catch {
        // ignore malformed lines
      }
    }
  }
  return { events, rest };
}

/** Async-iterate parsed events from a fetch response body stream. */
export async function* readSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<WidgetEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const { events, rest } = parseSSEBuffer(buf);
    buf = rest;
    for (const e of events) yield e;
  }
}
