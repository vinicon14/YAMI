import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { AgentService, EventStore, openDatabase } from "@yami/core";

let db: DatabaseSync | null = null;
let agents: AgentService | null = null;
let events: EventStore | null = null;

function database(): { agents: AgentService; events: EventStore } {
  if (!db || !agents || !events) {
    db = openDatabase(join(app.getPath("userData"), "yami.db"));
    agents = new AgentService(db);
    events = new EventStore(db);
  }
  return { agents, events };
}

function workspaceRoot(): string {
  return join(app.getPath("userData"), "workspace");
}

function registerIpc(): void {
  ipcMain.handle("yami:agents:list", () => database().agents.list());

  ipcMain.handle("yami:agents:create", (_event, input: { name?: unknown; instructions?: unknown }) => {
    const name = typeof input?.name === "string" ? input.name : "";
    return database().agents.create({
      name,
      instructions: typeof input?.instructions === "string" ? input.instructions : "",
      workspacePath: workspaceRoot(),
    });
  });

  ipcMain.handle("yami:events:recent", (_event, limit?: unknown) => {
    const size = typeof limit === "number" && Number.isFinite(limit) ? limit : 50;
    return database().events.list(Math.min(Math.max(size, 1), 200));
  });
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
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

  window.once("ready-to-show", () => window.show());

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
        const agents = bridge ? await bridge.agents.list() : null;
        const events = bridge ? await bridge.events.recent(5) : null;
        return {
          title: document.title,
          brand: document.querySelector(".brand-text strong")?.textContent ?? null,
          navItems: document.querySelectorAll(".nav-item").length,
          bridge: Boolean(bridge),
          agents: agents ? agents.length : null,
          events: events ? events.length : null,
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
      (result.navItems as number) >= 6;
    app.exit(ok ? 0 : 1);
  } catch (error) {
    console.error(`[yami] smoke falhou: ${error instanceof Error ? error.message : String(error)}`);
    app.exit(1);
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  db?.close();
  db = null;
});
