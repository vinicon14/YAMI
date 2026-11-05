import { useCallback, useEffect, useState } from "react";
import type { LocalAiStatus, ProviderConfig, ToolDescriptor } from "@yami/contracts";
import { Card, Badge } from "../components";
import { errorText, useYami } from "../context";

export function OverviewView(): React.JSX.Element {
  const { bridge, agents, settings, go, notify } = useYami();
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [tools, setTools] = useState<ToolDescriptor[]>([]);
  const [localAi, setLocalAi] = useState<LocalAiStatus | null>(null);

  const load = useCallback(async () => {
    if (!bridge) return;
    try {
      const [providerList, toolList, status] = await Promise.all([
        bridge.providers.list(),
        bridge.tools.list(),
        bridge.localAi.status(),
      ]);
      setProviders(providerList);
      setTools(toolList);
      setLocalAi(status);
    } catch (cause) {
      notify(errorText(cause), "error");
    }
  }, [bridge, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const enabledProviders = providers.filter((provider) => provider.enabled);
  const connected = enabledProviders.filter((provider) => provider.kind !== "local");
  const enabledTools = tools.filter((tool) => tool.enabled);

  return (
    <>
      <section className="grid">
        <Card title="Conexões reais" wide>
          <div className="kpi-row">
            <div className="kpi">
              <span>Provedores conectáveis</span>
              <strong>{connected.length}</strong>
              <small>{connected.length === 0 ? "conecte um provedor ou use a IA local" : "HTTP e CLIs"}</small>
            </div>
            <div className="kpi">
              <span>Ferramentas ativas</span>
              <strong>{enabledTools.length}</strong>
              <small>de {tools.length} disponíveis</small>
            </div>
            <div className="kpi">
              <span>Agentes</span>
              <strong>{agents.length}</strong>
              <small>permissões independentes</small>
            </div>
            <div className="kpi">
              <span>IA local</span>
              <strong>{localAi?.running ? "ativa" : localAi?.installed ? "instalada" : "ausente"}</strong>
              <small>porta {localAi?.port ?? "—"}</small>
            </div>
          </div>
        </Card>

        <Card title="Como o YAMI decide quem responde">
          <ol className="steps">
            <li>
              Usa o provedor do agente, se definido.
            </li>
            <li>Se não houver, usa o provedor padrão das configurações.</li>
            <li>
              Se nenhum estiver conectado ou o principal falhar antes de responder, a IA local entra
              como fallback — apenas texto, sem executar ferramentas.
            </li>
            <li>
              Toda ação de escrita, shell ou destrutiva passa pelo motor de permissões e pode exigir
              aprovação.
            </li>
          </ol>
        </Card>

        <Card title="Atalhos">
          <div className="button-row">
            <button type="button" className="btn btn-accent" onClick={() => go("chat")}>
              Abrir conversa
            </button>
            <button type="button" className="btn" onClick={() => go("providers")}>
              Conectar provedor
            </button>
            <button type="button" className="btn" onClick={() => go("localai")}>
              Instalar IA local
            </button>
            <button type="button" className="btn" onClick={() => go("voice")}>
              Configurar voz
            </button>
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            Workspace autorizado: <code>{settings?.workspaceRoot ?? "—"}</code>
          </p>
        </Card>

        <Card title="Privacidade e limites" wide>
          <div className="pill-row">
            <Badge tone="accent">credenciais cifradas AES-256-GCM</Badge>
            <Badge tone="ok">auditoria encadeada por hash</Badge>
            <Badge tone="warn">ações destrutivas sempre pedem confirmação</Badge>
            <Badge>execução restrita ao workspace</Badge>
            <Badge>provedores externos recebem apenas o que você enviar</Badge>
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            O YAMI não copia código nem identidade visual de outros produtos. VoiceStudio conversa por
            HTTP/MCP em um processo separado.
          </p>
        </Card>
      </section>
    </>
  );
}
