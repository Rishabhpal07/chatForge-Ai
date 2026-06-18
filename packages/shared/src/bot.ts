import { z } from "zod";

/** Visual theme for the embeddable widget. */
export const botThemeSchema = z.object({
  primaryColor: z.string().default("#4f46e5"),
  position: z.enum(["bottom-right", "bottom-left"]).default("bottom-right"),
  launcherText: z.string().max(40).default("Chat with us"),
  welcomeMessage: z.string().max(500).default("Hi! How can I help you today?"),
  avatarUrl: z.string().url().optional(),
});
export type BotTheme = z.infer<typeof botThemeSchema>;

export const botStatusSchema = z.enum(["draft", "active", "disabled"]);
export type BotStatus = z.infer<typeof botStatusSchema>;

/** Full bot configuration as stored / returned to the dashboard. */
export const botSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(120),
  publicKey: z.string(), // pk_live_xxx — used by the widget
  systemPrompt: z.string().max(8000),
  model: z.string(), // OpenRouter model id
  temperature: z.number().min(0).max(2).default(0.2),
  theme: botThemeSchema,
  allowedDomains: z.array(z.string()).default([]),
  status: botStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Bot = z.infer<typeof botSchema>;

/** Payload to create or update a bot from the dashboard. */
export const upsertBotSchema = z.object({
  name: z.string().min(1).max(120),
  systemPrompt: z.string().max(8000).optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  theme: botThemeSchema.partial().optional(),
  allowedDomains: z.array(z.string()).optional(),
  status: botStatusSchema.optional(),
});
export type UpsertBotInput = z.infer<typeof upsertBotSchema>;

/** Public subset of a bot, served to the widget at bootstrap (no secrets). */
export const publicBotConfigSchema = z.object({
  publicKey: z.string(),
  name: z.string(),
  theme: botThemeSchema,
  /** Base URL of the AI service the widget should POST /chat to. */
  chatUrl: z.string(),
});
export type PublicBotConfig = z.infer<typeof publicBotConfigSchema>;
