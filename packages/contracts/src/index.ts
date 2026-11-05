import { z } from "zod";

/**
 * Contrato canônico do YAMI.
 *
 * Todo provedor (HTTP, ACP/CLI ou runtime local) normaliza sua saída para estes
 * tipos. Nenhum provedor fala diretamente com a interface.
 */

export const ToolRiskSchema = z.enum(["read", "write", "exec", "ui", "network"]);
export type ToolRisk = z.infer<typeof ToolRiskSchema>;

export const PermissionDecisionSchema = z.enum(["allow", "ask", "deny"]);
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;

export const AccessLevelSchema = z.enum(["restricted", "workspace", "full"]);
export type AccessLevel = z.infer<typeof AccessLevelSchema>;

export const ProviderKindSchema = z.enum(["http", "acp", "cli", "local"]);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

export const ProviderAuthSchema = z.enum(["none", "api-key", "oauth", "cli-login"]);
export type ProviderAuth = z.infer<typeof ProviderAuthSchema>;

export const ProviderDescriptorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: ProviderKindSchema,
  auth: ProviderAuthSchema,
  baseUrl: z.string().optional(),
  models: z.array(z.string()).default([]),
  connected: z.boolean().default(false),
});
export type ProviderDescriptor = z.infer<typeof ProviderDescriptorSchema>;

export const AgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  instructions: z.string().default(""),
  workspacePath: z.string().min(1),
  providerId: z.string().nullable().default(null),
  modelId: z.string().nullable().default(null),
  access: AccessLevelSchema.default("workspace"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Agent = z.infer<typeof AgentSchema>;

export const ToolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  risk: ToolRiskSchema,
  input: z.unknown(),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const UsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative().optional(),
});
export type Usage = z.infer<typeof UsageSchema>;

const baseEvent = {
  id: z.string().min(1),
  sessionId: z.string().min(1),
  at: z.string(),
} as const;

export const YamiEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...baseEvent,
    type: z.literal("turn.started"),
    agentId: z.string(),
    providerId: z.string(),
    modelId: z.string(),
  }),
  z.object({
    ...baseEvent,
    type: z.literal("message.delta"),
    messageId: z.string(),
    text: z.string(),
  }),
  z.object({
    ...baseEvent,
    type: z.literal("tool.call"),
    call: ToolCallSchema,
    decision: PermissionDecisionSchema,
  }),
  z.object({
    ...baseEvent,
    type: z.literal("tool.result"),
    callId: z.string(),
    ok: z.boolean(),
    output: z.unknown(),
  }),
  z.object({
    ...baseEvent,
    type: z.literal("usage"),
    usage: UsageSchema,
  }),
  z.object({
    ...baseEvent,
    type: z.literal("turn.completed"),
    messageId: z.string(),
  }),
  z.object({
    ...baseEvent,
    type: z.literal("turn.failed"),
    error: z.string(),
  }),
  z.object({
    ...baseEvent,
    type: z.literal("voice.state"),
    state: z.enum([
      "idle",
      "armed",
      "listening",
      "thinking",
      "speaking",
      "interrupted",
      "error",
    ]),
  }),
]);
export type YamiEvent = z.infer<typeof YamiEventSchema>;
export type YamiEventType = YamiEvent["type"];

export const ChatMessageSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string(),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/** Superfície exposta pelo preload para o renderer. Mantida estreita de propósito. */
export interface YamiBridge {
  version: string;
  agents: {
    list(): Promise<Agent[]>;
    create(input: { name: string; instructions?: string }): Promise<Agent>;
  };
  events: {
    recent(limit?: number): Promise<YamiEvent[]>;
  };
}
