import { contextBridge, ipcRenderer } from "electron";
import type {
  Agent,
  AppSettings,
  ApprovalDecision,
  ApprovalRequest,
  AuditEntry,
  ChatMessage,
  LocalAiModel,
  LocalAiProgress,
  LocalAiStatus,
  McpServer,
  McpServerInput,
  Memory,
  MemoryInput,
  ProviderConfig,
  ProviderInput,
  ProviderPreset,
  ProviderTestResult,
  SpeechAudio,
  StreamDelta,
  Thread,
  ToolDescriptor,
  ToolSpec,
  Transcription,
  TurnEnded,
  VoiceStatus,
  YamiBridge,
  YamiEvent,
} from "@yami/contracts";

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const bridge: YamiBridge = {
  version: "0.1.0",
  app: {
    paths: () => ipcRenderer.invoke("yami:app:paths") as Promise<{
      userData: string;
      workspace: string;
    }>,
    openPath: (path) => ipcRenderer.invoke("yami:app:open-path", path) as Promise<void>,
  },
  agents: {
    list: () => ipcRenderer.invoke("yami:agents:list") as Promise<Agent[]>,
    create: (input) => ipcRenderer.invoke("yami:agents:create", input) as Promise<Agent>,
    update: (id, input) => ipcRenderer.invoke("yami:agents:update", id, input) as Promise<Agent>,
    remove: (id) => ipcRenderer.invoke("yami:agents:remove", id) as Promise<boolean>,
  },
  providers: {
    list: () => ipcRenderer.invoke("yami:providers:list") as Promise<ProviderConfig[]>,
    presets: () => ipcRenderer.invoke("yami:providers:presets") as Promise<ProviderPreset[]>,
    save: (input: ProviderInput) =>
      ipcRenderer.invoke("yami:providers:save", input) as Promise<ProviderConfig>,
    remove: (id) => ipcRenderer.invoke("yami:providers:remove", id) as Promise<boolean>,
    test: (id) => ipcRenderer.invoke("yami:providers:test", id) as Promise<ProviderTestResult>,
    models: (id) => ipcRenderer.invoke("yami:providers:models", id) as Promise<string[]>,
  },
  threads: {
    list: (agentId) => ipcRenderer.invoke("yami:threads:list", agentId) as Promise<Thread[]>,
    create: (input) => ipcRenderer.invoke("yami:threads:create", input) as Promise<Thread>,
    rename: (id, title) =>
      ipcRenderer.invoke("yami:threads:rename", id, title) as Promise<void>,
    remove: (id) => ipcRenderer.invoke("yami:threads:remove", id) as Promise<boolean>,
    messages: (threadId, limit) =>
      ipcRenderer.invoke("yami:threads:messages", threadId, limit) as Promise<ChatMessage[]>,
  },
  chat: {
    send: (input) =>
      ipcRenderer.invoke("yami:chat:send", input) as Promise<{
        turnId: string;
        messageId: string;
      }>,
    cancel: (turnId) => ipcRenderer.invoke("yami:chat:cancel", turnId) as Promise<void>,
  },
  stream: {
    onDelta: (callback) => subscribe<StreamDelta>("yami:stream:delta", callback),
    onTurnEnd: (callback) => subscribe<TurnEnded>("yami:stream:end", callback),
    onNotice: (callback) =>
      subscribe<{ turnId: string; text: string }>("yami:stream:notice", callback),
  },
  approvals: {
    onRequest: (callback) => subscribe<ApprovalRequest>("yami:approvals:request", callback),
    respond: (id, decision: ApprovalDecision) =>
      ipcRenderer.invoke("yami:approvals:respond", id, decision) as Promise<void>,
  },
  tools: {
    list: () => ipcRenderer.invoke("yami:tools:list") as Promise<ToolDescriptor[]>,
    setEnabled: (name, enabled) =>
      ipcRenderer.invoke("yami:tools:set-enabled", name, enabled) as Promise<void>,
  },
  mcp: {
    list: () => ipcRenderer.invoke("yami:mcp:list") as Promise<McpServer[]>,
    save: (input: McpServerInput) =>
      ipcRenderer.invoke("yami:mcp:save", input) as Promise<McpServer>,
    remove: (id) => ipcRenderer.invoke("yami:mcp:remove", id) as Promise<boolean>,
    tools: (id) => ipcRenderer.invoke("yami:mcp:tools", id) as Promise<ToolSpec[]>,
  },
  memory: {
    list: (agentId, limit) =>
      ipcRenderer.invoke("yami:memory:list", agentId, limit) as Promise<Memory[]>,
    search: (agentId, query, limit) =>
      ipcRenderer.invoke("yami:memory:search", agentId, query, limit) as Promise<Memory[]>,
    create: (input: MemoryInput) =>
      ipcRenderer.invoke("yami:memory:create", input) as Promise<Memory>,
    remove: (id) => ipcRenderer.invoke("yami:memory:remove", id) as Promise<boolean>,
  },
  voice: {
    status: () => ipcRenderer.invoke("yami:voice:status") as Promise<VoiceStatus>,
    transcribe: (audioBase64, mime) =>
      ipcRenderer.invoke("yami:voice:transcribe", audioBase64, mime) as Promise<Transcription>,
    speak: (text) => ipcRenderer.invoke("yami:voice:speak", text) as Promise<SpeechAudio>,
  },
  localAi: {
    status: () => ipcRenderer.invoke("yami:local-ai:status") as Promise<LocalAiStatus>,
    models: () => ipcRenderer.invoke("yami:local-ai:models") as Promise<LocalAiModel[]>,
    install: (modelId) =>
      ipcRenderer.invoke("yami:local-ai:install", modelId) as Promise<LocalAiStatus>,
    start: () => ipcRenderer.invoke("yami:local-ai:start") as Promise<LocalAiStatus>,
    stop: () => ipcRenderer.invoke("yami:local-ai:stop") as Promise<void>,
    onProgress: (callback) => subscribe<LocalAiProgress>("yami:local-ai:progress", callback),
  },
  settings: {
    get: () => ipcRenderer.invoke("yami:settings:get") as Promise<AppSettings>,
    update: (input) =>
      ipcRenderer.invoke("yami:settings:update", input) as Promise<AppSettings>,
  },
  audit: {
    list: (limit) => ipcRenderer.invoke("yami:audit:list", limit) as Promise<AuditEntry[]>,
    verify: () =>
      ipcRenderer.invoke("yami:audit:verify") as Promise<{
        ok: boolean;
        brokenAt: number | null;
      }>,
  },
  events: {
    recent: (limit) => ipcRenderer.invoke("yami:events:recent", limit) as Promise<YamiEvent[]>,
  },
};

contextBridge.exposeInMainWorld("yami", bridge);
