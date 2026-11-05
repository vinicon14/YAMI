import { useCallback, useEffect, useState } from "react";
import type { ToolDescriptor } from "@yami/contracts";
import { Badge, Card, Empty, Toggle } from "../components";
import { errorText, useYami } from "../context";

const RISK_TONE: Record<ToolDescriptor["risk"], "neutral" | "ok" | "warn" | "danger" | "accent"> = {
  read: "ok",
  write: "warn",
  exec: "danger",
  ui: "accent",
  network: "accent",
};

export function ToolsView(): React.JSX.Element {
  const { bridge, notify } = useYami();
  const [tools, setTools] = useState<ToolDescriptor[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!bridge) return;
    try {
      setTools(await bridge.tools.list());
    } catch (cause) {
      notify(errorText(cause), "error");
    }
  }, [bridge, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(
    async (tool: ToolDescriptor, enabled: boolean): Promise<void> => {
      if (!bridge) return;
      setBusy(tool.name);
      try {
        await bridge.tools.setEnabled(tool.name, enabled);
        setTools((current) =>
          current.map((item) => (item.name === tool.name ? { ...item, enabled } : item)),
        );
      } catch (cause) {
        notify(errorText(cause), "error");
      } finally {
        setBusy(null);
      }
    },
    [bridge, notify],
  );

  return (
    <div className="stack">
      <Card title="Ferramentas embutidas" wide>
        <p className="muted">
          Mesmo habilitadas, escritas e comandos passam pelo motor de permissões do agente. Ações
          destrutivas sempre pedem confirmação. Caminhos relativos são resolvidos dentro do workspace
          do agente.
        </p>
        {tools.length === 0 ? (
          <Empty>Nenhuma ferramenta registrada.</Empty>
        ) : (
          <ul className="list">
            {tools.map((tool) => (
              <li key={tool.name} className="list-row">
                <div className="list-body">
                  <strong>
                    <code>{tool.name}</code>{" "}
                    <Badge tone={RISK_TONE[tool.risk]}>{tool.risk}</Badge>{" "}
                    {tool.destructive && <Badge tone="danger">destrutiva</Badge>}
                  </strong>
                  <small>{tool.description}</small>
                  <details className="schema">
                    <summary>Esquema de entrada</summary>
                    <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
                  </details>
                </div>
                <div className="list-actions">
                  <Toggle
                    checked={tool.enabled}
                    disabled={busy === tool.name}
                    label={tool.enabled ? "ativa" : "desligada"}
                    onChange={(next) => void toggle(tool, next)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Como o agente acessa o disco">
        <ul className="checklist">
          <li>
            <code>fs.list</code>, <code>fs.read</code> e <code>fs.search</code> são leitura.
          </li>
          <li>
            <code>fs.write</code>, <code>fs.mkdir</code> e <code>fs.delete</code> exigem nível de
            acesso compatível; <code>fs.delete</code> sempre pergunta.
          </li>
          <li>
            <code>shell.run</code> é execução: negado em nível restrito e confirmado nos demais.
          </li>
          <li>Fugas por <code>..</code> ou links simbólicos são bloqueadas.</li>
        </ul>
      </Card>
    </div>
  );
}
