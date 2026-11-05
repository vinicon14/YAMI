import { useCallback, useEffect, useState } from "react";
import type { AccessLevel, Agent, ProviderConfig } from "@yami/contracts";
import { Badge, Card, Empty, Field } from "../components";
import { errorText, useYami } from "../context";

const ACCESS_LABEL: Record<AccessLevel, string> = {
  restricted: "Restrito (só leitura)",
  workspace: "Workspace (escrita com aprovação)",
  full: "Amplo (ainda pede confirmação no destrutivo)",
};

function AgentEditor({
  agent,
  providers,
  onChanged,
}: {
  agent: Agent;
  providers: ProviderConfig[];
  onChanged: () => Promise<void>;
}): React.JSX.Element {
  const { bridge, notify } = useYami();
  const [name, setName] = useState(agent.name);
  const [instructions, setInstructions] = useState(agent.instructions);
  const [providerId, setProviderId] = useState(agent.providerId ?? "");
  const [modelId, setModelId] = useState(agent.modelId ?? "");
  const [access, setAccess] = useState<AccessLevel>(agent.access);
  const [saving, setSaving] = useState(false);

  const provider = providers.find((item) => item.id === providerId) ?? null;

  const save = useCallback(async (): Promise<void> => {
    if (!bridge) return;
    setSaving(true);
    try {
      await bridge.agents.update(agent.id, {
        name: name.trim() || agent.name,
        instructions,
        providerId: providerId || null,
        modelId: modelId.trim() || null,
        access,
      });
      await onChanged();
      notify("Agente atualizado.", "ok");
    } catch (cause) {
      notify(errorText(cause), "error");
    } finally {
      setSaving(false);
    }
  }, [bridge, agent, name, instructions, providerId, modelId, access, onChanged, notify]);

  const remove = useCallback(async (): Promise<void> => {
    if (!bridge) return;
    if (!window.confirm(`Remover o agente "${agent.name}"? As conversas dele continuam no banco.`)) {
      return;
    }
    try {
      await bridge.agents.remove(agent.id);
      await onChanged();
      notify("Agente removido.", "ok");
    } catch (cause) {
      notify(errorText(cause), "error");
    }
  }, [bridge, agent, onChanged, notify]);

  return (
    <Card
      title={agent.name}
      actions={
        <>
          <Badge tone="accent">{access}</Badge>
          <button type="button" className="btn btn-small btn-danger" onClick={() => void remove()}>
            Remover
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Nome">
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Acesso ao disco">
          <select value={access} onChange={(event) => setAccess(event.target.value as AccessLevel)}>
            {(["restricted", "workspace", "full"] as const).map((level) => (
              <option key={level} value={level}>
                {ACCESS_LABEL[level]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Provedor">
          <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
            <option value="">Usar o padrão das configurações</option>
            {providers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Modelo" hint={provider ? `Sugestões: ${provider.models.join(", ") || "—"}` : undefined}>
          <input
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            placeholder={provider?.defaultModel ?? "modelo padrão do provedor"}
          />
        </Field>
        <Field label="Instruções do agente" hint="Entram no prompt de sistema de todas as conversas.">
          <textarea
            rows={3}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </Field>
      </div>
      <p className="muted">Workspace autorizado: <code>{agent.workspacePath}</code></p>
      <div className="button-row">
        <button type="button" className="btn btn-accent" onClick={() => void save()} disabled={saving}>
          {saving ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </Card>
  );
}

export function AgentsView(): React.JSX.Element {
  const { bridge, agents, refreshAgents, notify, settings } = useYami();
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    void bridge.providers
      .list()
      .then(setProviders)
      .catch((cause: unknown) => notify(errorText(cause), "error"));
  }, [bridge, notify]);

  const create = useCallback(async (): Promise<void> => {
    if (!bridge || !name.trim()) return;
    setCreating(true);
    try {
      await bridge.agents.create({ name: name.trim(), instructions });
      setName("");
      setInstructions("");
      await refreshAgents();
      notify("Agente criado.", "ok");
    } catch (cause) {
      notify(errorText(cause), "error");
    } finally {
      setCreating(false);
    }
  }, [bridge, name, instructions, refreshAgents, notify]);

  return (
    <div className="stack">
      <Card title="Novo agente">
        <div className="form-grid">
          <Field label="Nome">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Trabalho, Estudos, Casa"
            />
          </Field>
          <Field
            label="Instruções"
            hint={`O workspace padrão é ${settings?.workspaceRoot ?? "definido pelo app"}.`}
          >
            <textarea
              rows={3}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Como este agente deve se comportar?"
            />
          </Field>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => void create()}
            disabled={!name.trim() || creating}
          >
            {creating ? "Criando…" : "Criar agente"}
          </button>
        </div>
      </Card>

      {agents.length === 0 ? (
        <Empty>Nenhum agente. O YAMI cria um agente padrão na primeira execução.</Empty>
      ) : (
        agents.map((agent) => (
          <AgentEditor key={agent.id} agent={agent} providers={providers} onChanged={refreshAgents} />
        ))
      )}
    </div>
  );
}
