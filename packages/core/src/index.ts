export { openDatabase, migrate, SCHEMA_VERSION } from "./db";
export { EventStore } from "./events";
export type { StoredEvent } from "./events";
export { AgentService } from "./agents";
export type { CreateAgentInput, UpdateAgentInput } from "./agents";
export { ThreadService } from "./threads";
export type { AppendMessageInput, CreateTurnInput } from "./threads";
export { AuditLog, GENESIS_HASH } from "./audit";
export type { AuditInput } from "./audit";
export { PermissionEngine } from "./permissions";
export type { PermissionScope, ToolRequest } from "./permissions";
export { SecretStore } from "./secrets";
export { ProviderService, PROVIDER_PRESETS, LOCAL_PROVIDER_ID } from "./providers/registry";
export { OpenAiAdapter } from "./providers/openai";
export { AnthropicAdapter } from "./providers/anthropic";
export { CliAdapter } from "./providers/cli";
export { LocalAdapter, LOCAL_AI_PORT, LOCAL_AI_BASE_URL } from "./providers/local";
export type {
  ChatRequest,
  ProviderAdapter,
  ProviderMessage,
  ProviderStreamEvent,
  ProviderToolCall,
} from "./providers/types";
export { ToolRegistry } from "./tools";
export type { ToolContext } from "./tools";
export { McpClient, McpService } from "./mcp";
export { MemoryService, normalizeText } from "./memory";
export { SettingsService, defaultSettings } from "./settings";
export { VoiceService } from "./voice";
export {
  LocalAiService,
  LOCAL_AI_MODELS,
  LOCAL_AI_DEFAULT_PORT,
} from "./local-ai";
export type { LocalAiOptions } from "./local-ai";
export { Orchestrator } from "./orchestrator";
export type { OrchestratorDeps } from "./orchestrator";
