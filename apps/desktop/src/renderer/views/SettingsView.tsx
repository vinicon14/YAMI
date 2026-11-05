import { useCallback, useEffect, useState } from "react";
import type { AppSettings, LocalAiModel, ProviderConfig } from "@yami/contracts";
import { Badge, Card, Field } from "../components";
import { errorText, useYami } from "../context";

export function SettingsView(): React.JSX.Element {
  const { bridge, settings, refreshSettings, notify } = useYami();
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [models, setModels] = useState<LocalAiModel[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    if (!bridge) return;
    void Promise.all([bridge.providers.list(), bridge.localAi.models()])
      .then(([providerList, modelList]) => {
        setProviders(providerList);
        setModels(modelList);
      })
      .catch((cause: unknown) => notify(errorText(cause), "error"));
  }, [bridge, notify]);

  const update = useCallback(
    async (patch: Partial<AppSettings>): Promise<void> => {
      if (!bridge) return;
      setSaveState("saving");
      try {
        await bridge.settings.update(patch);
        await refreshSettings();
        setSaveState("saved");
        window.setTimeout(() => setSaveState("idle"), 1600);
      } catch (cause) {
        notify(errorText(cause), "error");
        setSaveState("idle");
      }
    },
    [bridge, refreshSettings, notify],
  );

  const externalProviders = providers.filter((provider) => provider.kind !== "local");

  return (
    <div className="stack">
      <Card
        title="Workspace e execução"
        actions={
          saveState === "saving" ? (
            <Badge tone="warn">salvando…</Badge>
          ) : saveState === "saved" ? (
            <Badge tone="ok">salvo</Badge>
          ) : (
            <Badge>local</Badge>
          )
        }
        wide
      >
        <div className="form-grid">
          <Field
            label="Workspace autorizado"
            hint="Raiz onde ferramentas de disco e shell podem atuar. Caminhos relativos partem daqui."
          >
            <input
              value={settings?.workspaceRoot ?? ""}
              onChange={(event) => void update({ workspaceRoot: event.target.value })}
            />
          </Field>
          <Field label="Passos máximos por turno" hint="Limite de chamadas de ferramenta antes de encerrar.">
            <input
              type="number"
              min={1}
              max={20}
              value={settings?.maxToolSteps ?? 6}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 20) {
                  void update({ maxToolSteps: Math.round(parsed) });
                }
              }}
            />
          </Field>
          <Field label="Aprovar leituras automaticamente">
            <select
              value={settings?.autoApproveRead ? "yes" : "no"}
              onChange={(event) => void update({ autoApproveRead: event.target.value === "yes" })}
            >
              <option value="yes">Sim (escritas e comandos ainda pedem confirmação)</option>
              <option value="no">Não, perguntar sempre</option>
            </select>
          </Field>
          <Field label="Abrir workspace">
            <button
              type="button"
              className="btn"
              onClick={() => {
                const path = settings?.workspaceRoot;
                if (bridge && path) void bridge.app.openPath(path).catch(() => undefined);
              }}
            >
              Abrir pasta autorizada
            </button>
          </Field>
        </div>
      </Card>

      <Card title="Provedor padrão">
        <Field
          label="Quem responde quando o agente não define um provedor"
          hint="Se estiver vazio ou falhar, a IA local assume quando o fallback está ligado."
        >
          <select
            value={settings?.defaultProviderId ?? ""}
            onChange={(event) => void update({ defaultProviderId: event.target.value || null })}
          >
            <option value="">Nenhum — usar a IA local</option>
            {externalProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name} ({provider.kind})
              </option>
            ))}
          </select>
        </Field>
        {externalProviders.length === 0 && (
          <p className="muted">
            Nenhum provedor externo salvo. Conecte um na aba <strong>Provedores</strong>.
          </p>
        )}
      </Card>

      <Card title="IA local e fallback">
        <div className="form-grid">
          <Field label="Habilitar IA local">
            <select
              value={settings?.localAiEnabled ? "yes" : "no"}
              onChange={(event) => void update({ localAiEnabled: event.target.value === "yes" })}
            >
              <option value="yes">Sim</option>
              <option value="no">Não</option>
            </select>
          </Field>
          <Field label="Usar como fallback">
            <select
              value={settings?.fallbackToLocal ? "yes" : "no"}
              onChange={(event) => void update({ fallbackToLocal: event.target.value === "yes" })}
            >
              <option value="yes">Sim, quando o principal falhar</option>
              <option value="no">Não</option>
            </select>
          </Field>
          <Field
            label="Modelo local"
            hint="O 0.5B é mais rápido; o 1.5B melhora a qualidade. Instale na aba IA local."
          >
            <select
              value={settings?.localAiModel ?? "qwen2.5-0.5b"}
              onChange={(event) => void update({ localAiModel: event.target.value })}
            >
              {models.length === 0 && <option value="qwen2.5-0.5b">qwen2.5-0.5b</option>}
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="muted">
          A IA local responde apenas em texto e nunca executa ferramentas, altera arquivos ou roda
          comandos.
        </p>
      </Card>

      <Card title="Privacidade e dados">
        <ul className="checklist">
          <li>Credenciais ficam cifradas com AES-256-GCM em um cofre separado do banco.</li>
          <li>O banco e o workspace vivem na pasta de dados do aplicativo, não no repositório.</li>
          <li>A auditoria é encadeada por hash e verificável na aba Atividade.</li>
          <li>Ações destrutivas sempre exigem confirmação, mesmo com acesso amplo.</li>
          <li className="is-negative">
            Nada é enviado a provedores externos além do conteúdo que você escreve e do contexto
            necessário.
          </li>
        </ul>
      </Card>
    </div>
  );
}
