import { z } from "zod";

export const chatRoleSchema = z.enum(["user", "assistant", "system"]);
export type ChatRole = z.infer<typeof chatRoleSchema>;

/** A retrieved-source citation attached to an assistant answer. */
export const citationSchema = z.object({
  documentId: z.string().uuid(),
  sourceUri: z.string(),
  chunkId: z.string().uuid(),
  score: z.number(),
  snippet: z.string(),
});
export type Citation = z.infer<typeof citationSchema>;

/** Public chat request sent by the widget to the AI service `/chat`. */
export const chatRequestSchema = z.object({
  publicKey: z.string(),
  visitorId: z.string(),
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/**
 * Server-Sent Events streamed back from `/chat`.
 * - `token`: an incremental answer chunk
 * - `citations`: emitted once before/with the first token
 * - `done`: final event with conversation + message ids
 * - `error`: terminal error
 */
export const chatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("token"), text: z.string() }),
  z.object({ type: z.literal("citations"), citations: z.array(citationSchema) }),
  z.object({
    type: z.literal("done"),
    conversationId: z.string().uuid(),
    messageId: z.string().uuid(),
  }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
