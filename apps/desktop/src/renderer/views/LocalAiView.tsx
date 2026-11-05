import { useCallback, useEffect, useState } from "react";
import type { LocalAiModel, LocalAiProgress, LocalAiStatus } from "@yami/contracts";
import { Badge, Card, Empty, Field } from "../components";
import { errorText, formatBytes, useYami } from "../context";

export function LocalAiView(): React.JSX.Element {
  const { bridge, settings, refreshSettings, notify } = useYami();
  const [status, setStatus] = useState<LocalAiStatus | null>(null);
  const [models, setModels] = useState<LocalAiModel[]>([]);
  const [selected, setSelected] = useState(settings?.localAiModel ?? "qwen2.5-0.5b");
  const [progress, setProgress] = useState<LocalAiProgress | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (!bridge) return;
    try {
      const [current, catalog] = await Promise.all([bridge.localAi.status(), bridge.localAi.models()]);
      setStatus(current);
      setModels(catalog);
      if (current.progress) setProgress(current.progress);
    } catch (cause) {
      notify(errorText(cause), "error");
    }
  }, [bridge, notify]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!bridge) return;
    const off = bridge.localAi.onProgress((next) => {
      setProgress(next);
      void refresh();
    });
    return off;
  }, [bridge, refresh]);

  const install = useCallback(async (): Promise<void> => {
    if (!bridge) return;
    setBusy(true);
    setProgress({
      stage: "download-binary",
      message: "Preparando a instalação…",
      percent: null,
    });
    try {
      const current = await bridge.localAi.install(selected);
      setStatus(current);
      await refreshSettings();
      notify("IA local instalada. Agora você pode iniciar o servidor.", "ok");
    } catch (cause) {
      notify(errorText(cause), "error");
    } finally {
      setBusy(false);
      void refresh();
    }
  }, [bridge, selected, notify, refreshSettings, refresh]);

  const start = useCallback(async (): Promise<void> => {
    if (!bridge) return;
    setBusy(true);
    try {
      setStatus(await bridge.localAi.start());
      notify("IA local em execução.", "ok");
    } catch (cause) {
      notify(errorText(cause), "error");
    } finally {
      setBusy(false);
      void refresh();
    }
  }, [bridge, notify, refresh]);

  const stop = useCallback(async (): Promise<void> => {
    if (!bridge) return;
    setBusy(true);
    try {
      await bridge.localAi.stop();
      notify("IA local parada.", "info");
    } catch (cause) {
      notify(errorText(cause), "error");
    } finally {
      setBusy(false);
      void refresh();
    }
  }, [bridge, notify, refresh]);

  const chooseModel = useCallback(
    async (modelId: string): Promise<void> => {
      setSelected(modelId);
      if (!bridge) return;
      try {
        await bridge.settings.update({ localAiModel: modelId });
        await refreshSettings();
      } catch (cause) {
        notify(errorText(cause), "error");
      }
    },
    [bridge, refreshSettings, notify],
  );

  const percent = progress?.percent ?? null;

  return (
    <div className="stack">
      <Card
        title="Estado da IA local"
        actions={
          status?.running ? (
            <Badge tone="ok">em execução</Badge>
          ) : status?.installed ? (
            <Badge tone="warn">instalada, parada</Badge>
          ) : (
            <Badge>não instalada</Badge>
          )
        }
      >
        <div className="kpi-row">
          <div className="kpi">
            <span>Modelo</span>
            <strong>{status?.modelId ?? "—"}</strong>
            <small>{selected}</small>
          </div>
          <div className="kpi">
            <span>Porta</span>
            <strong>{status?.port ?? 3910}</strong>
            <small>somente 127.0.0.1</small>
          </div>
          <div className="kpi">
            <span>Runtime</span>
            <strong>{status?.version ?? "—"}</strong>
            <small>{status?.binaryPath ? "llama-server localizado" : "não instalado"}</small>
          </div>
          <div className="kpi">
            <span>Fallback</span>
            <strong>{settings?.fallbackToLocal ? "ligado" : "desligado"}</strong>
            <small>texto apenas, sem ferramentas</small>
          </div>
        </div>

        {status?.error && <div className="banner banner-error">{status.error}</div>}
        {progress && progress.stage !== "idle" && (
          <div className="progress-block">
            <div className="progress-label">
              <span>{progress.message}</span>
              {percent !== null && <strong>{percent}%</strong>}
            </div>
            <div className="progress-track">
              <div
                className={`progress-fill${progress.stage === "error" ? " is-error" : ""}`}
                style={{ width: `${percent ?? 8}%` }}
              />
            </div>
            <small className="muted">Etapa: {progress.stage}</small>
          </div>
        )}

        <div className="button-row">
          {status?.running ? (
            <button type="button" className="btn btn-danger" onClick={() => void stop()} disabled={busy}>
              Parar servidor
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => void start()}
              disabled={busy || !status?.installed}
            >
              Iniciar servidor
            </button>
          )}
          <button type="button" className="btn" onClick={() => void refresh()} disabled={busy}>
            Atualizar estado
          </button>
          {status?.dir && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (bridge) void bridge.app.openPath(status.dir).catch(() => undefined);
              }}
            >
              Abrir pasta
            </button>
          )}
        </div>
      </Card>

      <Card title="Modelo de fallback">
        <Field
          label="Modelo"
          hint="O Qwen 0.5B responde rápido em português; o 1.5B melhora a qualidade e usa mais RAM."
        >
          <select value={selected} onChange={(event) => void chooseModel(event.target.value)}>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label} — ~{formatBytes(model.approxBytes)}
              </option>
            ))}
          </select>
        </Field>
        {models.length === 0 ? (
          <Empty>Nenhum modelo disponível.</Empty>
        ) : (
          <ul className="list">
            {models.map((model) => (
              <li key={model.id} className="list-row">
                <div className="list-body">
                  <strong>{model.label}</strong>
                  <small>{model.description}</small>
                  <small>
                    {model.fileName} · ~{formatBytes(model.approxBytes)}
                  </small>
                </div>
                <Badge tone={model.id === selected ? "accent" : "neutral"}>
                  {model.id === selected ? "selecionado" : "disponível"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <div className="button-row">
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => void install()}
            disabled={busy || status?.installing}
          >
            {status?.installed ? "Reinstalar / atualizar" : "Instalar IA local"}
          </button>
          {status?.installed && !status.running && (
            <button type="button" className="btn" onClick={() => void start()} disabled={busy}>
              Iniciar após instalar
            </button>
          )}
        </div>
        <p className="muted">
          O download baixa o runtime oficial do llama.cpp (GitHub) e o modelo GGUF do Hugging Face.
          Os arquivos ficam em <code>{status?.dir ?? "%APPDATA%/…/local-ai"}</code>, sem exigir
          administrador. Quando o fornecedor publica SHA-256, o arquivo é verificado antes de ser
          usado.
        </p>
      </Card>

      <Card title="O que a IA local pode e não pode fazer">
        <ul className="checklist">
          <li>Responde em texto e participa de conversas mesmo sem internet.</li>
          <li>Entra automaticamente quando nenhum provedor está conectado.</li>
          <li>Assume a conversa se o provedor principal falhar antes de produzir texto.</li>
          <li className="is-negative">Não executa ferramentas, não altera arquivos e não roda comandos.</li>
          <li className="is-negative">
            Não substitui um provedor para tarefas complexas; é um fallback rápido.
          </li>
        </ul>
      </Card>
    </div>
  );
}
