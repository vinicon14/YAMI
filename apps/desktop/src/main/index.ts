import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type {
  AccessLevel,
  AppSettings,
  ApprovalDecision,
  LocalAiProgress,
  ProviderInput,
  StreamDelta,
  TurnEnded,
  YamiEvent,
} from "@yami/contracts";
import {
  AgentService,
  AuditLog,
  EventStore,
  LocalAiService,
  LOCAL_AI_DEFAULT_PORT,
  McpService,
  MemoryService,
  Orchestrator,
  PermissionEngine,
  ProviderService,
  SCHEMA_VERSION,
  SecretStore,
  SettingsService,
  ThreadService,
  ToolRegistry,
  VoiceService,
  openDatabase,
} from "@yami/core";

interface Core {
  db: DatabaseSync;
  agents: AgentService;
  threads: ThreadService;
  events: EventStore;
  audit: AuditLog;
  providers: ProviderService;
  tools: ToolRegistry;
  mcp: McpService;
  memory: MemoryService;
  settings: SettingsService;
  voice: VoiceService;
  localAi: LocalAiService;
  orchestrator: Orchestrator;
}

let core: Core | null = null;
let mainWindow: BrowserWindow | null = null;

/* ------------------------------------------------------------------ */
/* Broadcast                                                           */
/* ------------------------------------------------------------------ */

function broadcast(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function broadcastEvent(event: YamiEvent): void {
  broadcast("yami:event", event);
}

/* ------------------------------------------------------------------ */
/* Inicialização                                                       */
/* ------------------------------------------------------------------ */

function workspaceRoot(): string {
  return join(app.getPath("userData"), "workspace");
}

function boot(): Core {
  if (core) return core;

  const userData = app.getPath("userData");
  mkdirSync(workspaceRoot(), { recursive: true });

  const db = openDatabase(join(userData, "yami.db"));
  const secrets = new SecretStore(db, join(userData, "yami.key"));
  const settings = new SettingsService(db, workspaceRoot());
  const agents = new AgentService(db);
  const threads = new ThreadService(db);
  const events = new EventStore(db);
  const audit = new AuditLog(db);
  const providers = new ProviderService(db, secrets);
  const tools = new ToolRegistry();
  const mcp = new McpService(db);
  const memory = new MemoryService(db);

  // Garante as linhas do provedor local e do agente padrão na primeira execução.
  providers.ensureLocal();
  if (agents.list().length === 0) {
    agents.create({
      name: "YAMI",
      instructions:
        "Você é o YAMI, o assistente pessoal deste computador. Seja direto, confirme ações destrutivas e use o workspace autorizado.",
      workspacePath: settings.get().workspaceRoot,
      access: "workspace",
    });
  }

  const localAi = new LocalAiService({
    dir: join(userData, "local-ai"),
    port: LOCAL_AI_DEFAULT_PORT,
    onProgress: (progress: LocalAiProgress) => broadcast("yami:local-ai:progress", progress),
  });

  const voice = new VoiceService(
    () => settings.get().voiceUrl,
    () => settings.get().voiceProfileId,
  );

  const orchestrator = new Orchestrator({
    db,
    agents,
    threads,
    events,
    audit,
    providers,
    tools,
    memory,
    mcp,
    settings,
    permissions: new PermissionEngine(),
    ensureLocal: async () => {
      const current = settings.get();
      if (!current.localAiEnabled) return false;
      return localAi.ensureRunning();
    },
    publish: (event) => broadcastEvent(event),
    onDelta: (payload: StreamDelta) => broadcast("yami:stream:delta", payload),
    onApproval: (request) => broadcast("yami:approvals:request", request),
    onTurnEnd: (payload: TurnEnded) => broadcast("yami:stream:end", payload),
    onNotice: (payload) => broadcast("yami:stream:notice", payload),
  });

  core = {
    db,
    agents,
    threads,
    events,
    audit,
    providers,
    tools,
    mcp,
    memory,
    settings,
    voice,
    localAi,
    orchestrator,
  };
  return core;
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

function registerIpc(): void {
  ipcMain.handle("yami:app:paths", () => ({
    userData: app.getPath("userData"),
    workspace: core?.settings.get().workspaceRoot ?? workspaceRoot(),
  }));

  ipcMain.handle("yami:app:open-path", async (_event, target: unknown) => {
    if (typeof target !== "string" || !target.trim()) throw new Error("Caminho inválido.");
    const result = await shell.openPath(target);
    if (result) throw new Error(result);
  });

  /* Agentes ---------------------------------------------------------- */

  ipcMain.handle("yami:agents:list", () => boot().agents.list());

  ipcMain.handle("yami:agents:create", (_event, input: { name?: unknown; instructions?: unknown }) => {
    const self = boot();
    return self.agents.create({
      name: typeof input?.name === "string" ? input.name : "",
      instructions: typeof input?.instructions === "string" ? input.instructions : "",
      workspacePath: self.settings.get().workspaceRoot,
    });
  });

  ipcMain.handle(
    "yami:agents:update",
    (
      _event,
      id: unknown,
      input: {
        name?: unknown;
        instructions?: unknown;
        providerId?: unknown;
        modelId?: unknown;
        access?: unknown;
      },
    ) => {
      if (typeof id !== "string") throw new Error("Agente inválido.");
      const patch: Parameters<AgentService["update"]>[1] = {};
      if (typeof input?.name === "string") patch.name = input.name;
      if (typeof input?.instructions === "string") patch.instructions = input.instructions;
      if (input?.providerId === null || typeof input?.providerId === "string") {
        patch.providerId = input.providerId;
      }
      if (input?.modelId === null || typeof input?.modelId === "string") {
        patch.modelId = input.modelId;
      }
      if (input?.access === "restricted" || input?.access === "workspace" || input?.access === "full") {
        patch.access = input.access as AccessLevel;
      }
      return boot().agents.update(id, patch);
    },
  );

  ipcMain.handle("yami:agents:remove", (_event, id: unknown) => {
    if (typeof id !== "string") return false;
    return boot().agents.remove(id);
  });

  /* Provedores ------------------------------------------------------- */

  ipcMain.handle("yami:providers:list", () => boot().providers.list());
  ipcMain.handle("yami:providers:presets", () => boot().providers.presets());
  ipcMain.handle("yami:providers:save", (_event, input: ProviderInput) => boot().providers.save(input));
  ipcMain.handle("yami:providers:remove", (_event, id: unknown) => {
    if (typeof id !== "string") return false;
    return boot().providers.remove(id);
  });
  ipcMain.handle("yami:providers:test", (_event, id: unknown) => {
    if (typeof id !== "string") throw new Error("Provedor inválido.");
    return boot().providers.test(id);
  });
  ipcMain.handle("yami:providers:models", (_event, id: unknown) => {
    if (typeof id !== "string") throw new Error("Provedor inválido.");
    return boot().providers.models(id);
  });

  /* Conversas -------------------------------------------------------- */

  ipcMain.handle("yami:threads:list", (_event, agentId?: unknown) =>
    boot().threads.list(typeof agentId === "string" ? agentId : undefined),
  );
  ipcMain.handle("yami:threads:create", (_event, input: { agentId?: unknown; title?: unknown }) => {
    if (typeof input?.agentId !== "string") throw new Error("Agente inválido.");
    const title = typeof input?.title === "string" ? input.title : "Nova conversa";
    return boot().threads.create(input.agentId, title);
  });
  ipcMain.handle("yami:threads:rename", (_event, id: unknown, title: unknown) => {
    if (typeof id !== "string" || typeof title !== "string") throw new Error("Dados inválidos.");
    boot().threads.rename(id, title.trim() || "Nova conversa");
  });
  ipcMain.handle("yami:threads:remove", (_event, id: unknown) => {
    if (typeof id !== "string") return false;
    return boot().threads.remove(id);
  });
  ipcMain.handle("yami:threads:messages", (_event, threadId: unknown, limit?: unknown) => {
    if (typeof threadId !== "string") throw new Error("Conversa inválida.");
    return boot().threads.messages(threadId, typeof limit === "number" ? limit : 200);
  });

  /* Chat ------------------------------------------------------------- */

  ipcMain.handle("yami:chat:send", (_event, input: { threadId?: unknown; text?: unknown }) => {
    if (typeof input?.threadId !== "string" || typeof input?.text !== "string") {
      throw new Error("Mensagem inválida.");
    }
    return boot().orchestrator.send({ threadId: input.threadId, text: input.text });
  });
  ipcMain.handle("yami:chat:cancel", (_event, turnId: unknown) => {
    if (typeof turnId === "string") boot().orchestrator.cancel(turnId);
  });

  /* Aprovações ------------------------------------------------------- */

  ipcMain.handle("yami:approvals:respond", (_event, id: unknown, decision: unknown) => {
    if (typeof id !== "string") throw new Error("Aprovação inválida.");
    if (decision !== "allow-once" && decision !== "allow-session" && decision !== "deny") {
      throw new Error("Decisão inválida.");
    }
    boot().orchestrator.respondApproval(id, decision as ApprovalDecision);
  });

  /* Ferramentas ------------------------------------------------------ */

  ipcMain.handle("yami:tools:list", () => {
    const self = boot();
    return self.tools.descriptors(toolState(self.db));
  });
  ipcMain.handle("yami:tools:set-enabled", (_event, name: unknown, enabled: unknown) => {
    if (typeof name !== "string" || typeof enabled !== "boolean") {
      throw new Error("Dados inválidos.");
    }
    const self = boot();
    self.db
      .prepare(
        `INSERT INTO tools (name, enabled, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
      )
      .run(name, enabled ? 1 : 0, new Date().toISOString());
    self.orchestrator.invalidateTools();
  });

  /* MCP -------------------------------------------------------------- */

  ipcMain.handle("yami:mcp:list", () => boot().mcp.list());
  ipcMain.handle("yami:mcp:save", (_event, input: unknown) => {
    const self = boot();
    const saved = self.mcp.save(input);
    self.orchestrator.invalidateTools();
    return saved;
  });
  ipcMain.handle("yami:mcp:remove", (_event, id: unknown) => {
    if (typeof id !== "string") return false;
    const self = boot();
    const removed = self.mcp.remove(id);
    self.orchestrator.invalidateTools();
    return removed;
  });
  ipcMain.handle("yami:mcp:tools", (_event, id: unknown) => {
    if (typeof id !== "string") throw new Error("Servidor inválido.");
    return boot().mcp.tools(id);
  });

  /* Memória ---------------------------------------------------------- */

  ipcMain.handle("yami:memory:list", (_event, agentId?: unknown, limit?: unknown) =>
    boot().memory.list(
      typeof agentId === "string" ? agentId : undefined,
      typeof limit === "number" ? limit : 100,
    ),
  );
  ipcMain.handle("yami:memory:search", (_event, agentId: unknown, query: unknown, limit?: unknown) => {
    if (typeof agentId !== "string" || typeof query !== "string") {
      throw new Error("Busca inválida.");
    }
    return boot().memory.search(agentId, query, typeof limit === "number" ? limit : 20);
  });
  ipcMain.handle("yami:memory:create", (_event, input: unknown) => boot().memory.create(input as never));
  ipcMain.handle("yami:memory:remove", (_event, id: unknown) => {
    if (typeof id !== "string") return false;
    return boot().memory.remove(id);
  });

  /* Voz -------------------------------------------------------------- */

  ipcMain.handle("yami:voice:status", () => boot().voice.status());
  ipcMain.handle("yami:voice:transcribe", (_event, audio: unknown, mime: unknown) => {
    if (typeof audio !== "string" || !audio) throw new Error("Áudio vazio.");
    return boot().voice.transcribe(audio, typeof mime === "string" ? mime : "audio/webm");
  });
  ipcMain.handle("yami:voice:speak", (_event, text: unknown) => {
    if (typeof text !== "string") throw new Error("Texto inválido.");
    return boot().voice.speak(text);
  });

  /* IA local --------------------------------------------------------- */

  ipcMain.handle("yami:local-ai:status", () => boot().localAi.status());
  ipcMain.handle("yami:local-ai:models", () => boot().localAi.models());
  ipcMain.handle("yami:local-ai:install", (_event, modelId?: unknown) =>
    boot().localAi.install(typeof modelId === "string" ? modelId : undefined),
  );
  ipcMain.handle("yami:local-ai:start", () => boot().localAi.start());
  ipcMain.handle("yami:local-ai:stop", () => boot().localAi.stop());

  /* Configurações ---------------------------------------------------- */

  ipcMain.handle("yami:settings:get", () => boot().settings.get());
  ipcMain.handle("yami:settings:update", (_event, input: Partial<AppSettings>) =>
    boot().settings.update(input ?? {}),
  );

  /* Auditoria e eventos ---------------------------------------------- */

  ipcMain.handle("yami:audit:list", (_event, limit?: unknown) =>
    boot().audit.list(typeof limit === "number" ? limit : 100),
  );
  ipcMain.handle("yami:audit:verify", () => boot().audit.verify());
  ipcMain.handle("yami:events:recent", (_event, limit?: unknown) => {
    const size = typeof limit === "number" && Number.isFinite(limit) ? limit : 50;
    return boot()
      .events.list(Math.min(Math.max(size, 1), 200))
      .map((stored) => stored.event);
  });

  ipcMain.handle("yami:diagnostics", () => {
    const self = boot();
    return {
      schemaVersion: SCHEMA_VERSION,
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      userData: app.getPath("userData"),
      workspace: self.settings.get().workspaceRoot,
    };
  });
}

function toolState(db: DatabaseSync): Map<string, boolean> {
  const rows = db.prepare("SELECT name, enabled FROM tools").all() as Array<{
    name: string;
    enabled: number;
  }>;
  return new Map(rows.map((row) => [row.name, Boolean(row.enabled)]));
}

/* ------------------------------------------------------------------ */
/* Janela                                                              */
/* ------------------------------------------------------------------ */

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: "#0b0d12",
    title: "YAMI",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;

  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("did-fail-load", (_event, code, description) => {
    console.error(`[yami] falha ao carregar a interface: ${code} ${description}`);
    if (isSmokeRun()) app.exit(1);
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[yami] processo de renderização encerrado: ${details.reason}`);
    if (isSmokeRun()) app.exit(1);
  });

  window.webContents.on("did-finish-load", () => {
    if (isSmokeRun()) void runSmoke(window);
  });

  void window.loadFile(join(__dirname, "../../dist/renderer/index.html"));
}

function isSmokeRun(): boolean {
  return process.argv.includes("--yami-smoke");
}

/**
 * Verificação ponta a ponta usada pelo `pnpm smoke`.
 * Carrega o renderer real, atravessa o preload e chama o IPC que abre o SQLite.
 */
async function runSmoke(window: BrowserWindow): Promise<void> {
  try {
    const result = (await window.webContents.executeJavaScript(`
      (async () => {
        const bridge = window.yami;
        if (!bridge) {
          return { bridge: false };
        }
        const [agents, events, providers, settings, tools, localAi] = await Promise.all([
          bridge.agents.list(),
          bridge.events.recent(5),
          bridge.providers.list(),
          bridge.settings.get(),
          bridge.tools.list(),
          bridge.localAi.status(),
        ]);
        return {
          title: document.title,
          brand: document.querySelector(".brand-text strong")?.textContent ?? null,
          navItems: document.querySelectorAll(".nav-item").length,
          bridge: true,
          agents: agents.length,
          events: events.length,
          providers: providers.length,
          tools: tools.length,
          models: localAi.models ?? null,
          workspace: settings.workspaceRoot,
          localAiPort: localAi.port,
        };
      })()
    `)) as Record<string, unknown>;

    console.log(`YAMI_SMOKE ${JSON.stringify(result)}`);
    const ok =
      result.title === "YAMI" &&
      result.brand === "YAMI" &&
      result.bridge === true &&
      typeof result.agents === "number" &&
      typeof result.events === "number" &&
      typeof result.providers === "number" &&
      typeof result.tools === "number" &&
      (result.navItems as number) >= 6;
    app.exit(ok ? 0 : 1);
  } catch (error) {
    console.error(`[yami] smoke falhou: ${error instanceof Error ? error.message : String(error)}`);
    app.exit(1);
  }
}

/* ------------------------------------------------------------------ */
/* Ciclo de vida                                                       */
/* ------------------------------------------------------------------ */

app.whenReady().then(() => {
  boot();
  registerIpc();

  // A interface usa o microfone para transcrição local via VoiceStudio.
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === "media" || permission === "clipboard-read");
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  const current = core;
  core = null;
  if (!current) return;
  void current.localAi.stop();
  try {
    current.db.close();
  } catch (error) {
    console.error(`[yami] falha ao fechar o banco: ${String(error)}`);
  }
});
