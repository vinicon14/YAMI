import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Agent, AppSettings, LocalAiStatus } from "@yami/contracts";
import { YamiContext, errorText, type NoticeKind, type Section } from "./context";
import { OverviewView } from "./views/OverviewView";
import { ChatView } from "./views/ChatView";
import { AgentsView } from "./views/AgentsView";
import { ProvidersView } from "./views/ProvidersView";
import { LocalAiView } from "./views/LocalAiView";
import { ToolsView } from "./views/ToolsView";
import { McpView } from "./views/McpView";
import { MemoryView } from "./views/MemoryView";
import { VoiceView } from "./views/VoiceView";
import { ActivityView } from "./views/ActivityView";
import { SettingsView } from "./views/SettingsView";

interface NavItem {
  id: Section;
  label: string;
  glyph: string;
  subtitle: string;
}

const NAV: NavItem[] = [
  { id: "overview", label: "Visão geral", glyph: "◈", subtitle: "Estado do assistente" },
  { id: "chat", label: "Conversar", glyph: "✦", subtitle: "Chat com streaming e aprovações" },
  { id: "agents", label: "Agentes", glyph: "⬡", subtitle: "Identidade, provedor e permissões" },
  { id: "providers", label: "Provedores", glyph: "⇄", subtitle: "Conexões HTTP e CLIs reais" },
  { id: "localai", label: "IA local", glyph: "▣", subtitle: "Fallback offline com llama.cpp" },
  { id: "tools", label: "Ferramentas", glyph: "⌘", subtitle: "Disco, shell e riscos" },
  { id: "mcp", label: "MCP", glyph: "⌗", subtitle: "Servidores stdio e HTTP" },
  { id: "memory", label: "Memória", glyph: "❖", subtitle: "Lembranças com busca FTS" },
  { id: "voice", label: "Voz", glyph: "◉", subtitle: "STT e TTS do VoiceStudio" },
  { id: "activity", label: "Atividade", glyph: "⛨", subtitle: "Auditoria e eventos" },
  { id: "settings", label: "Configurações", glyph: "⚙", subtitle: "Workspace, voz e padrões" },
];

interface Toast {
  id: number;
  text: string;
  kind: NoticeKind;
}

export function App(): React.JSX.Element {
  const bridge = window.yami ?? null;
  const [section, setSection] = useState<Section>("overview");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [localAi, setLocalAi] = useState<LocalAiStatus | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);
  const toastId = useRef(1);

  const notify = useCallback((text: string, kind: NoticeKind = "info") => {
    const id = toastId.current;
    toastId.current += 1;
    setToasts((current) => [...current.slice(-3), { id, text, kind }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 6000);
  }, []);

  const refreshSettings = useCallback(async () => {
    if (!bridge) return;
    try {
      setSettings(await bridge.settings.get());
      setBootError(null);
    } catch (cause) {
      setBootError(errorText(cause));
    }
  }, [bridge]);

  const refreshAgents = useCallback(async () => {
    if (!bridge) return;
    try {
      setAgents(await bridge.agents.list());
    } catch (cause) {
      setBootError(errorText(cause));
    }
  }, [bridge]);

  useEffect(() => {
    void refreshSettings();
    void refreshAgents();
  }, [refreshSettings, refreshAgents]);

  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    const poll = async (): Promise<void> => {
      try {
        const status = await bridge.localAi.status();
        if (!cancelled) setLocalAi(status);
      } catch {
        if (!cancelled) setLocalAi(null);
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [bridge]);

  const go = useCallback((next: Section) => setSection(next), []);

  const value = useMemo(
    () => ({
      bridge,
      settings,
      agents,
      refreshSettings,
      refreshAgents,
      notify,
      go,
    }),
    [bridge, settings, agents, refreshSettings, refreshAgents, notify, go],
  );

  const current = NAV.find((item) => item.id === section) ?? NAV[0];
  const health = localAi?.running
    ? { label: "IA local ativa", tone: "dot-on" }
    : localAi?.installed
      ? { label: "IA local instalada", tone: "dot-warn" }
      : { label: "IA local não instalada", tone: "dot-off" };

  return (
    <YamiContext.Provider value={value}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <span>Y</span>
            </div>
            <div className="brand-text">
              <strong>YAMI</strong>
              <small>assistente pessoal</small>
            </div>
          </div>

          <nav className="nav" aria-label="Seções">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-item${section === item.id ? " is-active" : ""}`}
                onClick={() => setSection(item.id)}
              >
                <span className="nav-glyph" aria-hidden="true">
                  {item.glyph}
                </span>
                <span className="nav-label">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-foot">
            <span className={`dot ${health.tone}`} aria-hidden="true" />
            <span>{bridge ? health.label : "Fora do Electron"}</span>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div>
              <h1>{current?.label}</h1>
              <p className="subtitle">{current?.subtitle}</p>
            </div>
            <div className="chips">
              <div className="chip">
                <span>Agentes</span>
                <strong>{agents.length}</strong>
              </div>
              <div className="chip">
                <span>Provedores</span>
                <strong>{settings?.defaultProviderId ? "1+" : "0"}</strong>
              </div>
              <div className="chip">
                <span>IA local</span>
                <strong>{localAi?.running ? "on" : localAi?.installed ? "std" : "off"}</strong>
              </div>
            </div>
          </header>

          {!bridge && (
            <div className="banner">
              Esta interface foi aberta fora do Electron. Rode <code>pnpm dev</code> para carregar o
              núcleo.
            </div>
          )}

          {bootError && (
            <div className="banner banner-error" role="alert">
              {bootError}
            </div>
          )}

          {section === "overview" && <OverviewView />}
          {section === "chat" && <ChatView />}
          {section === "agents" && <AgentsView />}
          {section === "providers" && <ProvidersView />}
          {section === "localai" && <LocalAiView />}
          {section === "tools" && <ToolsView />}
          {section === "mcp" && <McpView />}
          {section === "memory" && <MemoryView />}
          {section === "voice" && <VoiceView />}
          {section === "activity" && <ActivityView />}
          {section === "settings" && <SettingsView />}
        </main>

        <div className="toasts" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast toast-${toast.kind}`}>
              {toast.text}
            </div>
          ))}
        </div>
      </div>
    </YamiContext.Provider>
  );
}
