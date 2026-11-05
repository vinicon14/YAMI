import { z } from "zod";

/**
 * Contrato canônico do YAMI.
 *
 * Todo provedor (HTTP, ACP/CLI ou runtime local) normaliza sua saída para estes
 * tipos. Nenhum provedor fala diretamente com a interface.
 */

/* ------------------------------------------------------------------ */
/* Permissões                                                          */
/* ------------------------------------------------------------------ */

export const ToolRiskSchema = z.enum(["read", "write", "exec", "ui", "network"]);
export type ToolRisk = z.infer<typeof ToolRiskSchema>;

export const PermissionDecisionSchema = z.enum(["allow", "ask", "deny"]);
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;

export const AccessLevelSchema = z.enum(["restricted", "workspace", "full"]);
export type AccessLevel = z.infer<typeof AccessLevelSchema>;

export const ApprovalDecisionSchema = z.enum(["allow-once", "allow-session", "deny"]);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

/* ------------------------------------------------------------------ */
/* Provedores                                                          */
/* ------------------------------------------------------------------ */

export const ProviderKindSchema = z.enum(["http", "acp", "cli", "local"]);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

export const ProviderAuthSchema = z.enum(["none", "api-key", "oauth", "cli-login"]);
export type ProviderAuth = z.infer<typeof ProviderAuthSchema>;

/** Formato do protocolo HTTP usado pelo adaptador. */
export const ProviderProtocolSchema = z.enum(["openai", "anthropic"]);
export type ProviderProtocol = z.infer<typeof ProviderProtocolSchema>;

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

/** Configuração persistida. A chave nunca aparece aqui: só `hasSecret`. */
export const ProviderConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: ProviderKindSchema,
  auth: ProviderAuthSchema,
  protocol: ProviderProtocolSchema.default("openai"),
  baseUrl: z.string().nullable().default(null),
  models: z.array(z.string()).default([]),
  defaultModel: z.string().nullable().default(null),
  command: z.string().nullable().default(null),
  args: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  hasSecret: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const ProviderInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Informe um nome."),
  kind: ProviderKindSchema,
  auth: ProviderAuthSchema.default("none"),
  protocol: ProviderProtocolSchema.optional(),
  baseUrl: z.string().nullable().optional(),
  apiKey: z.string().nullable().optional(),
  models: z.array(z.string()).optional(),
  defaultModel: z.string().nullable().optional(),
  command: z.string().nullable().optional(),
  args: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});
export type ProviderInput = z.infer<typeof ProviderInputSchema>;

export const ProviderPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  kind: ProviderKindSchema,
  auth: ProviderAuthSchema,
  protocol: ProviderProtocolSchema.default("openai"),
  baseUrl: z.string().nullable().default(null),
  defaultModel: z.string().nullable().default(null),
  models: z.array(z.string()).default([]),
});
export type ProviderPreset = z.infer<typeof ProviderPresetSchema>;

export const ProviderTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  models: z.array(z.string()).default([]),
  latencyMs: z.number().int().nonnegative().nullable().default(null),
});
export type ProviderTestResult = z.infer<typeof ProviderTestResultSchema>;

/* ------------------------------------------------------------------ */
/* Agentes, threads e turnos                                           */
/* ------------------------------------------------------------------ */

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

export const ThreadSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messageCount: z.number().int().nonnegative().default(0),
});
export type Thread = z.infer<typeof ThreadSchema>;

export const TurnStatusSchema = z.enum(["running", "completed", "failed", "cancelled"]);
export type TurnStatus = z.infer<typeof TurnStatusSchema>;

export const TurnSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  agentId: z.string().min(1),
  status: TurnStatusSchema,
  providerId: z.string().nullable(),
  modelId: z.string().nullable(),
  error: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});
export type Turn = z.infer<typeof TurnSchema>;

export const ToolCallRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  arguments: z.string().default(""),
});
export type ToolCallRecord = z.infer<typeof ToolCallRecordSchema>;

export const ChatRoleSchema = z.enum(["user", "assistant", "system", "tool"]);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

export const ChatMessageSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  turnId: z.string().nullable().default(null),
  role: ChatRoleSchema,
  content: z.string(),
  toolCalls: z.array(ToolCallRecordSchema).default([]),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/* ------------------------------------------------------------------ */
/* Ferramentas, aprovação e MCP                                        */
/* ------------------------------------------------------------------ */

export const ToolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  risk: ToolRiskSchema,
  input: z.unknown(),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ToolSpecSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()),
});
export type ToolSpec = z.infer<typeof ToolSpecSchema>;

export const ToolDescriptorSchema = ToolSpecSchema.extend({
  risk: ToolRiskSchema,
  destructive: z.boolean().default(false),
  enabled: z.boolean().default(true),
  source: z.enum(["builtin", "mcp"]).default("builtin"),
});
export type ToolDescriptor = z.infer<typeof ToolDescriptorSchema>;

export const ToolResultSchema = z.object({
  callId: z.string().min(1),
  ok: z.boolean(),
  output: z.unknown(),
  error: z.string().nullable().default(null),
  durationMs: z.number().int().nonnegative().default(0),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

export const ApprovalRequestSchema = z.object({
  id: z.string().min(1),
  turnId: z.string().min(1),
  callId: z.string().min(1),
  tool: z.string().min(1),
  risk: ToolRiskSchema,
  input: z.unknown(),
  reason: z.string(),
  createdAt: z.string(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const McpTransportSchema = z.enum(["stdio", "http"]);
export type McpTransport = z.infer<typeof McpTransportSchema>;

export const McpServerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  transport: McpTransportSchema,
  command: z.string().nullable().default(null),
  args: z.array(z.string()).default([]),
  url: z.string().nullable().default(null),
  headers: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type McpServer = z.infer<typeof McpServerSchema>;

export const McpServerInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Informe um nome."),
  transport: McpTransportSchema,
  command: z.string().nullable().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().nullable().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
});
export type McpServerInput = z.infer<typeof McpServerInputSchema>;

/* ------------------------------------------------------------------ */
/* Memória                                                             */
/* ------------------------------------------------------------------ */

export const MemorySchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  text: z.string().min(1),
  origin: z.string().default("manual"),
  sourceTurnId: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Memory = z.infer<typeof MemorySchema>;

export const MemoryInputSchema = z.object({
  agentId: z.string().min(1),
  text: z.string().min(1, "A memória não pode estar vazia."),
  origin: z.string().default("manual"),
  sourceTurnId: z.string().nullable().optional(),
});
export type MemoryInput = z.infer<typeof MemoryInputSchema>;

/* ------------------------------------------------------------------ */
/* Voz                                                                 */
/* ------------------------------------------------------------------ */

export const VoiceStatusSchema = z.object({
  available: z.boolean(),
  url: z.string(),
  error: z.string().nullable().default(null),
  checkedAt: z.string(),
});
export type VoiceStatus = z.infer<typeof VoiceStatusSchema>;

export const TranscriptionSchema = z.object({
  text: z.string(),
  durationMs: z.number().int().nonnegative().nullable().default(null),
});
export type Transcription = z.infer<typeof TranscriptionSchema>;

export const SpeechAudioSchema = z.object({
  audioBase64: z.string(),
  mime: z.string(),
});
export type SpeechAudio = z.infer<typeof SpeechAudioSchema>;

/* ------------------------------------------------------------------ */
/* Uso, auditoria e configurações                                      */
/* ------------------------------------------------------------------ */

export const UsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative().optional(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const AuditEntrySchema = z.object({
  id: z.number().int(),
  at: z.string(),
  actor: z.string(),
  action: z.string(),
  risk: ToolRiskSchema,
  decision: PermissionDecisionSchema,
  detail: z.string(),
  prevHash: z.string(),
  hash: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const AppSettingsSchema = z.object({
  workspaceRoot: z.string(),
  voiceUrl: z.string(),
  voiceProfileId: z.string().nullable().default(null),
  autoSpeak: z.boolean().default(false),
  wakeWords: z.array(z.string()).default(["yami", "jarvis"]),
  maxToolSteps: z.number().int().min(1).max(20).default(6),
  autoApproveRead: z.boolean().default(true),
  defaultProviderId: z.string().nullable().default(null),
  localAiEnabled: z.boolean().default(true),
  fallbackToLocal: z.boolean().default(true),
  localAiModel: z.string().default("qwen2.5-0.5b"),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

/* ------------------------------------------------------------------ */
/* IA local                                                            */
/* ------------------------------------------------------------------ */

export const LocalAiStageSchema = z.enum([
  "idle",
  "download-binary",
  "extract-binary",
  "download-model",
  "verify",
  "starting",
  "ready",
  "error",
]);
export type LocalAiStage = z.infer<typeof LocalAiStageSchema>;

export const LocalAiProgressSchema = z.object({
  stage: LocalAiStageSchema,
  message: z.string(),
  percent: z.number().min(0).max(100).nullable().default(null),
});
export type LocalAiProgress = z.infer<typeof LocalAiProgressSchema>;

export const LocalAiStatusSchema = z.object({
  installed: z.boolean(),
  running: z.boolean(),
  installing: z.boolean(),
  modelId: z.string(),
  modelPath: z.string().nullable(),
  binaryPath: z.string().nullable(),
  port: z.number().int().positive(),
  version: z.string().nullable(),
  dir: z.string(),
  progress: LocalAiProgressSchema.nullable(),
  error: z.string().nullable(),
});
export type LocalAiStatus = z.infer<typeof LocalAiStatusSchema>;

export const LocalAiModelSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().default(""),
  fileName: z.string().min(1),
  approxBytes: z.number().int().positive(),
});
export type LocalAiModel = z.infer<typeof LocalAiModelSchema>;

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */

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
    type: z.literal("message.completed"),
    messageId: z.string(),
    role: ChatRoleSchema,
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
    type: z.literal("approval.requested"),
    approvalId: z.string(),
    callId: z.string(),
    tool: z.string(),
    risk: ToolRiskSchema,
  }),
  z.object({
    ...baseEvent,
    type: z.literal("approval.resolved"),
    approvalId: z.string(),
    decision: ApprovalDecisionSchema,
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

/* ------------------------------------------------------------------ */
/* Ponte do preload                                                    */
/* ------------------------------------------------------------------ */

export interface StreamDelta {
  turnId: string;
  messageId: string;
  delta: string;
}

export interface TurnEnded {
  turnId: string;
  threadId: string;
  status: TurnStatus;
  error: string | null;
}

export interface YamiBridge {
  version: string;
  app: {
    paths(): Promise<{ userData: string; workspace: string }>;
    openPath(path: string): Promise<void>;
  };
  agents: {
    list(): Promise<Agent[]>;
    create(input: { name: string; instructions?: string }): Promise<Agent>;
    update(
      id: string,
      input: {
        name?: string;
        instructions?: string;
        providerId?: string | null;
        modelId?: string | null;
        access?: AccessLevel;
      },
    ): Promise<Agent>;
    remove(id: string): Promise<boolean>;
  };
  providers: {
    list(): Promise<ProviderConfig[]>;
    presets(): Promise<ProviderPreset[]>;
    save(input: ProviderInput): Promise<ProviderConfig>;
    remove(id: string): Promise<boolean>;
    test(id: string): Promise<ProviderTestResult>;
    models(id: string): Promise<string[]>;
    detectClis(): Promise<
      Array<{ name: string; command: string; preset?: string; installed: boolean; path: string | null }>
    >;
  };
  threads: {
    list(agentId?: string): Promise<Thread[]>;
    create(input: { agentId: string; title?: string }): Promise<Thread>;
    rename(id: string, title: string): Promise<void>;
    remove(id: string): Promise<boolean>;
    messages(threadId: string, limit?: number): Promise<ChatMessage[]>;
  };
  chat: {
    send(input: { threadId: string; text: string }): Promise<{ turnId: string; messageId: string }>;
    cancel(turnId: string): Promise<void>;
  };
  stream: {
    onDelta(callback: (payload: StreamDelta) => void): () => void;
    onTurnEnd(callback: (payload: TurnEnded) => void): () => void;
    onNotice(callback: (payload: { turnId: string; text: string }) => void): () => void;
  };
  approvals: {
    onRequest(callback: (request: ApprovalRequest) => void): () => void;
    respond(id: string, decision: ApprovalDecision): Promise<void>;
  };
  tools: {
    list(): Promise<ToolDescriptor[]>;
    setEnabled(name: string, enabled: boolean): Promise<void>;
  };
  mcp: {
    list(): Promise<McpServer[]>;
    save(input: McpServerInput): Promise<McpServer>;
    remove(id: string): Promise<boolean>;
    tools(id: string): Promise<ToolSpec[]>;
  };
  memory: {
    list(agentId?: string, limit?: number): Promise<Memory[]>;
    search(agentId: string, query: string, limit?: number): Promise<Memory[]>;
    create(input: MemoryInput): Promise<Memory>;
    remove(id: string): Promise<boolean>;
  };
  voice: {
    status(): Promise<VoiceStatus>;
    transcribe(audioBase64: string, mime: string): Promise<Transcription>;
    speak(text: string): Promise<SpeechAudio>;
  };
  localAi: {
    status(): Promise<LocalAiStatus>;
    models(): Promise<LocalAiModel[]>;
    install(modelId?: string): Promise<LocalAiStatus>;
    start(): Promise<LocalAiStatus>;
    stop(): Promise<void>;
    onProgress(callback: (progress: LocalAiProgress) => void): () => void;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(input: Partial<AppSettings>): Promise<AppSettings>;
  };
  audit: {
    list(limit?: number): Promise<AuditEntry[]>;
    verify(): Promise<{ ok: boolean; brokenAt: number | null }>;
  };
  events: {
    recent(limit?: number): Promise<YamiEvent[]>;
  };
}
