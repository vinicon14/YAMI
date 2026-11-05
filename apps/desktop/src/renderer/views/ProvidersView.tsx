import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ProviderAuth,
  ProviderConfig,
  ProviderInput,
  ProviderKind,
  ProviderPreset,
  ProviderProtocol,
  ProviderTestResult,
} from "@yami/contracts";
import { Badge, Card, Empty, Field } from "../components";
import { errorText, useYami } from "../context";

interface FormState {
  id: string | null;
  name: string;
  kind: ProviderKind;
  auth: ProviderAuth;
  protocol: ProviderProtocol;
  baseUrl: string;
  command: string;
  args: string;
  apiKey: string;
  models: string;
  defaultModel: string;
  enabled: boolean;
}

const EMPTY: FormState = {
  id: null,
  name: "",
  kind: "http",
  auth: "api-key",
  protocol: "openai",
  baseUrl: "",
  command: "",
  args: "",
  apiKey: "",
  models: "",
  defaultModel: "",
  enabled: true,
};

const KIND_LABEL: Record<ProviderKind, string> = {
  http: "HTTP (API compatível)",
  cli: "CLI instalada",
  acp: "ACP (agent protocol)",
  local: "IA local (llama.cpp)",
};

const AUTH_LABEL: Record<ProviderAuth, string> = {
  none: "Sem autenticação",
  "api-key": "Chave de API",
  oauth: "OAuth",
  "cli-login": "Login da CLI",
};

function toForm(provider: ProviderConfig): FormState {
  return {
    id: provider.id,
    name: provider.name,
    kind: provider.kind,
    auth: provider.auth,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl ?? "",
    command: provider.command ?? "",
    args: provider.args.join(" "),
    apiKey: "",
    models: provider.models.join(", "),
    defaultModel: provider.defaultModel ?? "",
    enabled: provider.enabled,
  };
}

function fromPreset(preset: ProviderPreset): FormState {
  return {
    ...EMPTY,
    name: preset.name,
    kind: preset.kind,
    auth: preset.auth,
    protocol: preset.protocol,
    baseUrl: preset.baseUrl ?? "",
    models: preset.models.join(", "),
    defaultModel: preset.defaultModel ?? "",
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitArgs(value: string): string[] {
  return (value.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []).map((item) => item.replace(/^"|"$/g, ""));
}

export function ProvidersView(): React.JSX.Element {
  const { bridge, settings, refreshSettings, notify } = useYami();
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [testing, setTesting] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; value: ProviderTestResult } | null>(null);
  const [saving, setSaving] = useState(false);
  const [detected, setDetected] = useState<
    Array<{ name: string; command: string; preset?: string; installed: boolean; path: string | null }>
  >([]);

  const load = useCallback(async (): Promise<void> => {
    if (!bridge) return;
    try {
      const [list, catalog] = await Promise.all([bridge.providers.list(), bridge.providers.presets()]);
      setProviders(list);
      setPresets(catalog);
    } catch (cause) {
      notify(errorText(cause), "error");
    }
  }, [bridge, notify]);

  const detect = useCallback(async (): Promise<void> => {
    if (!bridge) return;
    try {
      setDetected(await bridge.providers.detectClis());
    } catch (cause) {
      notify(errorText(cause), "error");
    }
  }, [bridge, notify]);

  useEffect(() => {
    void load();
    void detect();
  }, [load, detect]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = useCallback(async (): Promise<void> => {
    if (!bridge) return;
    setSaving(true);
    try {
      const input: ProviderInput = {
        id: form.id ?? undefined,
        name: form.name.trim(),
        kind: form.kind,
        auth: form.auth,
        protocol: form.protocol,
        baseUrl: form.baseUrl.trim() || null,
        command: form.command.trim() || null,
        args: splitArgs(form.args),
        models: splitList(form.models),
        defaultModel: form.defaultModel.trim() || null,
        enabled: form.enabled,
      };
      if (form.apiKey.trim()) input.apiKey = form.apiKey.trim();

      const saved = await bridge.providers.save(input);
      await load();
      setForm(toForm(saved));
      notify(`Provedor "${saved.name}" salvo.`, "ok");
    } catch (cause) {
      notify(errorText(cause), "error");
    } finally {
      setSaving(false);
    }
  }, [bridge, form, load, notify]);

  const remove = useCallback(
    async (provider: ProviderConfig): Promise<void> => {
      if (!bridge) return;
      if (!window.confirm(`Remover o provedor "${provider.name}" e a chave salva?`)) return;
      try {
        await bridge.providers.remove(provider.id);
        await load();
        if (form.id === provider.id) setForm(EMPTY);
        notify("Provedor removido.", "ok");
      } catch (cause) {
        notify(errorText(cause), "error");
      }
    },
    [bridge, form.id, load, notify],
  );

  const test = useCallback(
    async (provider: ProviderConfig): Promise<void> => {
      if (!bridge) return;
      setTesting(provider.id);
      setResult(null);
      try {
        const value = await bridge.providers.test(provider.id);
        setResult({ id: provider.id, value });
      } catch (cause) {
        setResult({
          id: provider.id,
          value: { ok: false, message: errorText(cause), models: [], latencyMs: null },
        });
      } finally {
        setTesting(null);
      }
    },
    [bridge],
  );

  const isLocal = form.kind === "local";
  const needsCommand = form.kind === "cli" || form.kind === "acp";
  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.name === form.name) ?? null,
    [presets, form.name],
  );

  return (
    <div className="stack">
      <Card title="Conexões prontas" wide>
        <p className="muted">
          Escolha um preset para preencher o formulário. Nada é gravado sem salvar, e a chave fica
          cifrada em um cofre separado do banco.
        </p>
        <div className="preset-grid">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`preset${selectedPreset?.id === preset.id ? " is-active" : ""}`}
              onClick={() => setForm(fromPreset(preset))}
            >
              <strong>{preset.name}</strong>
              <small>{preset.description}</small>
              <span className="preset-meta">
                {preset.kind} · {preset.protocol}
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card title={form.id ? "Editar provedor" : "Novo provedor"}>
        <div className="form-grid">
          <Field label="Nome">
            <input value={form.name} onChange={(event) => update("name", event.target.value)} />
          </Field>
          <Field label="Tipo">
            <select
              value={form.kind}
              onChange={(event) => update("kind", event.target.value as ProviderKind)}
            >
              {(Object.keys(KIND_LABEL) as ProviderKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABEL[kind]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Autenticação">
            <select
              value={form.auth}
              onChange={(event) => update("auth", event.target.value as ProviderAuth)}
            >
              {(Object.keys(AUTH_LABEL) as ProviderAuth[]).map((auth) => (
                <option key={auth} value={auth}>
                  {AUTH_LABEL[auth]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Protocolo" hint="Define o formato do streaming e das ferramentas.">
            <select
              value={form.protocol}
              onChange={(event) => update("protocol", event.target.value as ProviderProtocol)}
              disabled={isLocal}
            >
              <option value="openai">OpenAI (Chat Completions)</option>
              <option value="anthropic">Anthropic (Messages)</option>
            </select>
          </Field>

          {!needsCommand && (
            <Field
              label="URL base"
              hint={isLocal ? "Para a IA local o padrão é http://127.0.0.1:3910/v1." : undefined}
            >
              <input
                value={form.baseUrl}
                onChange={(event) => update("baseUrl", event.target.value)}
                placeholder="https://api.exemplo.com/v1"
              />
            </Field>
          )}

          {needsCommand && (
            <>
              <Field label="Comando" hint="Ex.: codex, claude, gemini">
                <input
                  value={form.command}
                  onChange={(event) => update("command", event.target.value)}
                />
              </Field>
              <Field label="Argumentos" hint="Separados por espaço. Use aspas para caminhos.">
                <input value={form.args} onChange={(event) => update("args", event.target.value)} />
              </Field>
            </>
          )}

          <Field
            label="Chave de API"
            hint={
              form.id
                ? "Deixe em branco para manter a chave atual."
                : "Gravada com AES-256-GCM no cofre local."
            }
          >
            <input
              type="password"
              value={form.apiKey}
              onChange={(event) => update("apiKey", event.target.value)}
              placeholder={form.id ? "•••••• (mantida)" : "sk-…"}
              autoComplete="off"
            />
          </Field>
          <Field label="Modelos" hint="Separados por vírgula. A lista do endpoint tem prioridade.">
            <input value={form.models} onChange={(event) => update("models", event.target.value)} />
          </Field>
          <Field label="Modelo padrão">
            <input
              value={form.defaultModel}
              onChange={(event) => update("defaultModel", event.target.value)}
            />
          </Field>
          <Field label="Ativo">
            <select
              value={form.enabled ? "yes" : "no"}
              onChange={(event) => update("enabled", event.target.value === "yes")}
            >
              <option value="yes">Sim</option>
              <option value="no">Não</option>
            </select>
          </Field>
        </div>

        <div className="button-row">
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => void save()}
            disabled={!form.name.trim() || saving}
          >
            {saving ? "Salvando…" : form.id ? "Salvar" : "Adicionar provedor"}
          </button>
          <button type="button" className="btn" onClick={() => setForm(EMPTY)}>
            Limpar formulário
          </button>
          {form.id && form.id !== "local" && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                const provider = providers.find((item) => item.id === form.id);
                if (provider) void remove(provider);
              }}
            >
              Remover
            </button>
          )}
        </div>

        {form.id && result?.id === form.id && (
          <div className={`banner ${result.value.ok ? "banner-ok" : "banner-error"}`}>
            {result.value.ok ? "Conectado" : "Falha"} — {result.value.message}
            {result.value.latencyMs !== null && ` · ${result.value.latencyMs} ms`}
          </div>
        )}
        {isLocal && (
          <p className="muted">
            O provedor local é gerenciado pela aba <strong>IA local</strong>. Ele nunca recebe
            ferramentas: apenas responde em texto.
          </p>
        )}
      </Card>

      <Card title="Conexão fácil (CLIs detectadas)" wide>
        <p className="muted">
          Detecta CLIs de provedores instaladas no sistema e conecta com um clique. A autenticação
          continua sendo feita pela própria CLI (ex.: <code>codex login</code>).
        </p>
        <div className="button-row" style={{ marginBottom: 10 }}>
          <button type="button" className="btn" onClick={() => void detect()}>
            Re-detectar
          </button>
        </div>
        {detected.length === 0 ? (
          <Empty>Nenhuma CLI conhecida detectada.</Empty>
        ) : (
          <ul className="list">
            {detected.map((item) => (
              <li key={item.command} className="list-row">
                <div className="list-body">
                  <strong>
                    {item.name}{" "}
                    <Badge tone={item.installed ? "ok" : "neutral"}>
                      {item.installed ? "instalada" : "ausente"}
                    </Badge>
                  </strong>
                  <small>{item.path ?? "não encontrada no PATH"}</small>
                </div>
                <div className="list-actions">
                  {item.installed && item.preset && (
                    <button
                      type="button"
                      className="btn btn-small btn-accent"
                      onClick={() => {
                        const preset = presets.find((p) => p.name === item.preset);
                        if (preset) setForm(fromPreset(preset));
                        else
                          setForm({
                            ...EMPTY,
                            name: item.name,
                            kind: "cli",
                            auth: "cli-login",
                            command: item.command,
                            args: "",
                          });
                      }}
                    >
                      Conectar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Provedores salvos (${providers.length})`} wide>
        {providers.length === 0 ? (
          <Empty>Nenhum provedor salvo.</Empty>
        ) : (
          <ul className="list">
            {providers.map((provider) => (
              <li key={provider.id} className="list-row">
                <div className="list-body">
                  <strong>
                    {provider.name}{" "}
                    {settings?.defaultProviderId === provider.id && <Badge tone="accent">padrão</Badge>}
                  </strong>
                  <small>
                    {KIND_LABEL[provider.kind]} · {provider.protocol} ·{" "}
                    {provider.baseUrl ?? provider.command ?? "sem endpoint"} ·{" "}
                    {provider.hasSecret ? "chave salva" : "sem chave"}
                  </small>
                  {result?.id === provider.id && (
                    <small className={result.value.ok ? "text-ok" : "text-danger"}>
                      {result.value.ok ? "✓" : "✗"} {result.value.message}
                    </small>
                  )}
                </div>
                <div className="list-actions">
                  <Badge tone={provider.enabled ? "ok" : "neutral"}>
                    {provider.enabled ? "ativo" : "desligado"}
                  </Badge>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => setForm(toForm(provider))}
                  >
                    Editar
                  </button>
                  {settings?.defaultProviderId !== provider.id && provider.kind !== "local" && (
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={async () => {
                        if (!bridge) return;
                        try {
                          await bridge.settings.update({ defaultProviderId: provider.id });
                          await refreshSettings();
                          notify(`"${provider.name}" agora é o provedor padrão.`, "ok");
                        } catch (cause) {
                          notify(errorText(cause), "error");
                        }
                      }}
                    >
                      Tornar padrão
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => void test(provider)}
                    disabled={testing === provider.id}
                  >
                    {testing === provider.id ? "Testando…" : "Testar"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="muted" style={{ marginTop: 10 }}>
          Provedor padrão atual: <code>{settings?.defaultProviderId ?? "nenhum (usa a IA local)"}</code>
          {" · "}
          <button
            type="button"
            className="link-button"
            onClick={async () => {
              if (!bridge) return;
              try {
                await bridge.settings.update({ defaultProviderId: null });
                await refreshSettings();
                notify("Provedor padrão limpo.", "ok");
              } catch (cause) {
                notify(errorText(cause), "error");
              }
            }}
          >
            limpar padrão
          </button>
        </p>
      </Card>
    </div>
  );
}
