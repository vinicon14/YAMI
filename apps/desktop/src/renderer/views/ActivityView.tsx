import { useCallback, useEffect, useState } from "react";
import type { AuditEntry, YamiEvent } from "@yami/contracts";
import { Badge, Card, Empty } from "../components";
import { errorText, formatDateTime, useYami } from "../context";

const RISK_TONE: Record<AuditEntry["risk"], "neutral" | "ok" | "warn" | "danger" | "accent"> = {
  read: "ok",
  write: "warn",
  exec: "danger",
  ui: "accent",
  network: "accent",
};

const DECISION_LABEL: Record<AuditEntry["decision"], string> = {
  allow: "permitido",
  ask: "perguntado",
  deny: "negado",
};

function eventSummary(event: YamiEvent): string {
  switch (event.type) {
    case "turn.started":
      return `turno iniciado · ${event.providerId}/${event.modelId}`;
    case "message.delta":
      return `delta de ${event.text.length} caractere(s)`;
    case "message.completed":
      return `mensagem ${event.role} concluída (${event.text.length} caracteres)`;
    case "tool.call":
      return `ferramenta ${event.call.name} · ${event.decision}`;
    case "tool.result":
      return `resultado de ferramenta · ${event.ok ? "sucesso" : "falha"}`;
    case "approval.requested":
      return `aprovação pedida para ${event.tool} (${event.risk})`;
    case "approval.resolved":
      return `aprovação resolvida: ${event.decision}`;
    case "usage":
      return `uso · ${event.usage.inputTokens} entrada / ${event.usage.outputTokens} saída`;
    case "turn.completed":
      return "turno concluído";
    case "turn.failed":
      return `turno falhou: ${event.error}`;
    case "voice.state":
      return `voz: ${event.state}`;
    default:
      return (event as { type: string }).type;
  }
}

function eventTone(event: YamiEvent): "neutral" | "ok" | "warn" | "danger" | "accent" {
  switch (event.type) {
    case "turn.failed":
      return "danger";
    case "approval.requested":
      return "warn";
    case "turn.completed":
    case "message.completed":
      return "ok";
    case "tool.call":
    case "tool.result":
      return "accent";
    default:
      return "neutral";
  }
}

export function ActivityView(): React.JSX.Element {
  const { bridge, notify } = useYami();
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [events, setEvents] = useState<YamiEvent[]>([]);
  const [verification, setVerification] = useState<{ ok: boolean; brokenAt: number | null } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!bridge) return;
    try {
      const [entries, recent] = await Promise.all([
        bridge.audit.list(200),
        bridge.events.recent(100),
      ]);
      setAudit(entries);
      setEvents(recent);
    } catch (cause) {
      notify(errorText(cause), "error");
    }
  }, [bridge, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const verify = useCallback(async (): Promise<void> => {
    if (!bridge) return;
    setBusy(true);
    try {
      const result = await bridge.audit.verify();
      setVerification(result);
      notify(
        result.ok ? "Cadeia de auditoria íntegra." : "A cadeia de auditoria foi rompida.",
        result.ok ? "ok" : "error",
      );
    } catch (cause) {
      notify(errorText(cause), "error");
    } finally {
      setBusy(false);
    }
  }, [bridge, notify]);

  return (
    <div className="stack">
      <Card
        title="Integridade da auditoria"
        actions={
          verification ? (
            verification.ok ? (
              <Badge tone="ok">íntegra</Badge>
            ) : (
              <Badge tone="danger">rompida em #{verification.brokenAt}</Badge>
            )
          ) : (
            <Badge>não verificada</Badge>
          )
        }
        wide
      >
        <p className="muted">
          Cada entrada guarda o hash da anterior. Qualquer alteração ou remoção quebra a cadeia e é
          detectada por esta verificação.
        </p>
        <div className="button-row">
          <button type="button" className="btn btn-accent" onClick={() => void verify()} disabled={busy}>
            {busy ? "Verificando…" : "Verificar cadeia"}
          </button>
          <button type="button" className="btn" onClick={() => void load()}>
            Recarregar
          </button>
        </div>
        {verification && !verification.ok && (
          <div className="banner banner-error">
            A cadeia falhou na entrada #{verification.brokenAt}. Isso indica alteração manual do banco.
          </div>
        )}
      </Card>

      <Card title={`Auditoria (${audit.length})`} wide>
        {audit.length === 0 ? (
          <Empty>Nenhuma ação registrada ainda.</Empty>
        ) : (
          <ul className="list">
            {audit.map((entry) => (
              <li key={entry.id} className="list-row">
                <div className="list-body">
                  <strong>
                    <code>{entry.action}</code> <Badge tone={RISK_TONE[entry.risk]}>{entry.risk}</Badge>{" "}
                    <Badge tone={entry.decision === "deny" ? "danger" : "neutral"}>
                      {DECISION_LABEL[entry.decision]}
                    </Badge>
                  </strong>
                  <small>
                    {entry.actor} · {formatDateTime(entry.at)} · hash {entry.hash.slice(0, 12)}…
                  </small>
                  {entry.detail && <small className="mono-small">{entry.detail}</small>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Eventos recentes (${events.length})`} wide>
        {events.length === 0 ? (
          <Empty>Nenhum evento gravado ainda. Comece uma conversa.</Empty>
        ) : (
          <ul className="list">
            {events.map((event, index) => (
              <li key={`${event.id}-${index}`} className="list-row">
                <div className="list-body">
                  <strong>
                    <Badge tone={eventTone(event)}>{event.type}</Badge>{" "}
                    <small className="mono-small">{event.sessionId.slice(0, 8)}</small>
                  </strong>
                  <small>{eventSummary(event)}</small>
                  <small className="muted">{formatDateTime(event.at)}</small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
