import { useCallback, useEffect, useMemo, useState } from "react";
import type { Agent, YamiEvent } from "@yami/contracts";

type Section = "overview" | "agents" | "providers" | "voice" | "permissions" | "settings";

interface NavItem {
  id: Section;
  label: string;
  glyph: string;
  ready: boolean;
}

const NAV: NavItem[] = [
  { id: "overview", label: "Visão geral", glyph: "◈", ready: true },
  { id: "agents", label: "Agentes", glyph: "⬡", ready: true },
  { id: "providers", label: "Provedores", glyph: "⇄", ready: false },
  { id: "voice", label: "Voz", glyph: "◉", ready: false },
  { id: "permissions", label: "Permissões", glyph: "⛨", ready: false },
  { id: "settings", label: "Configurações", glyph: "⚙", ready: false },
];

const PLANNED: Record<string, { phase: string; description: string }> = {
  providers: {
    phase: "Marco M2",
    description:
      "Adaptadores HTTP, ACP/CLI e runtimes locais. Nenhum provedor está conectado porque a camada ainda não foi implementada.",
  },
  voice: {
    phase: "Marco M4",
    description:
      "Pipeline VoiceStudio (STT/TTS), VAD, wake word e interrupção de fala. A integração ainda não existe no código.",
  },
  permissions: {
    phase: "Marco M1",
    description:
      "O motor de permissões já existe em @yami/core com testes, mas ainda não tem painel de concessão nem auditoria persistida.",
  },
  settings: {
    phase: "Marco M3",
    description: "Configurações de workspace, privacidade, backup e inicialização.",
  },
};

export function App(): React.JSX.Element {
  const [section, setSection] = useState<Section>("overview");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [events, setEvents] = useState<YamiEvent[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const bridge = window.yami;
  const connected = Boolean(bridge);

  const refresh = useCallback(async () => {
    if (!bridge) {
      setLoading(false);
      return;
    }
    try {
      const [list, recent] = await Promise.all([
        bridge.agents.list(),
        bridge.events.recent(50),
      ]);
      setAgents(list);
      setEvents(recent);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createAgent = useCallback(async () => {
    if (!bridge || !name.trim()) return;
    try {
      const agent = await bridge.agents.create({ name: name.trim() });
      setAgents((current) => [...current, agent]);
      setName("");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [bridge, name]);

  const stats = useMemo(
    () => [
      { label: "Agentes", value: String(agents.length) },
      { label: "Eventos", value: String(events.length) },
      { label: "Provedores", value: "0" },
      { label: "Voz", value: "off" },
    ],
    [agents.length, events.length],
  );

  return (
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
              {!item.ready && <span className="nav-badge">planejado</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span className={`dot${connected ? " dot-on" : " dot-off"}`} aria-hidden="true" />
          <span>{connected ? "Core conectado" : "Fora do Electron"}</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{NAV.find((item) => item.id === section)?.label}</h1>
            <p className="subtitle">Fundação M0 · contratos, persistência e permissões</p>
          </div>
          <div className="chips">
            {stats.map((stat) => (
              <div className="chip" key={stat.label}>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>
        </header>

        {error && (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        )}

        {!connected && (
          <div className="banner">
            Esta interface foi aberta fora do Electron. Rode <code>pnpm dev</code> para carregar o
            núcleo.
          </div>
        )}

        {section === "overview" && (
          <section className="grid">
            <article className="card card-wide">
              <h2>O que já funciona</h2>
              <ul className="checklist">
                <li>Contratos canônicos de evento, agente, provedor e risco de ferramenta.</li>
                <li>SQLite com log de eventos, agentes, mensagens e auditoria (migrations versionadas).</li>
                <li>Motor de permissões com raízes autorizadas e confirmação para ações destrutivas.</li>
                <li>Shell Electron com IPC tipado, preload isolado e CSP restritiva.</li>
              </ul>
            </article>
            <article className="card">
              <h2>Próximo marco</h2>
              <p>
                M1 fecha o núcleo: fila de tarefas, sessões de agente, auditoria encadeada e painel de
                permissões. Nenhum provedor é simulado antes disso.
              </p>
            </article>
            <article className="card">
              <h2>Hardware detectado</h2>
              <p>
                i5-13420H · 15,6 GB RAM · Intel UHD (sem GPU dedicada). Modelos locais ficam limitados a
                ~3–8B em Q4; o plano prevê aviso de requisitos.
              </p>
            </article>
          </section>
        )}

        {section === "agents" && (
          <section className="panel">
            <div className="panel-head">
              <h2>Agentes</h2>
              <div className="creator">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void createAgent();
                  }}
                  placeholder="Nome do agente"
                  aria-label="Nome do agente"
                />
                <button type="button" onClick={() => void createAgent()} disabled={!name.trim()}>
                  Criar
                </button>
              </div>
            </div>

            {loading ? (
              <p className="muted">Carregando…</p>
            ) : agents.length === 0 ? (
              <p className="muted">Nenhum agente ainda. Crie o primeiro acima.</p>
            ) : (
              <ul className="agent-list">
                {agents.map((agent) => (
                  <li key={agent.id} className="agent-row">
                    <span className="avatar" aria-hidden="true">
                      {agent.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="agent-body">
                      <strong>{agent.name}</strong>
                      <small>{agent.workspacePath}</small>
                    </div>
                    <span className="tag">{agent.access}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {section !== "overview" && section !== "agents" && (
          <section className="panel">
            <h2>{PLANNED[section]?.phase}</h2>
            <p className="muted">{PLANNED[section]?.description}</p>
            <p className="muted">
              Este painel está vazio de propósito: nada é exibido como funcional antes de existir
              implementação e teste.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
