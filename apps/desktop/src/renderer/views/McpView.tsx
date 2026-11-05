import { useCallback, useEffect, useState } from "react";
import type { McpServer, McpServerInput, McpTransport, ToolSpec } from "@yami/contracts";
import { Badge, Card, Empty, Field, Toggle } from "../components";
import { errorText, useYami } from "../context";

interface FormState {
  id: string | null;
  name: string;
  transport: McpTransport;
  command: string;
  args: string;
  url: string;
  headers: string;
  enabled: boolean;
}

const EMPTY: FormState = {
  id: null,
  name: "",
  transport: "stdio",
  command: "",
  args: "",
  url: "",
  headers: "",
  enabled: true,
};

function splitArgs(value: string): string[] {
  return (value.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []).map((item) => item.replace(/^"|"$/g, ""));
}

export function McpView(): React.JSX.Element {
  const { bridge, notify } = useYami();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [tools, setTools] = useState<Record<string, ToolSpec[]>>({});
  const [loadingTools, setLoadingTools] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!bridge) return;
    try {
      setServers(await bridge.mcp.list());
    } catch (cause) {
      notify(errorText(cause), "error");
    }
  }, [bridge, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (): Promise<void> => {
    if (!bridge) return;
    try {
      let headers: Record<string, string> = {};
      if (form.headers.trim()) {
        const parsed = JSON.parse(form.headers) as unknown;
        if (!parsed || typeof parsed !== "object") throw new Error("Cabeçalhos devem ser um objeto.");
        headers = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
        );
      }

      const input: McpServerInput = {
        id: form.id ?? undefined,
        name: form.name.trim(),
        transport: form.transport,
        command: form.command.trim() || null,
        args: splitArgs(form.args),
        url: form.url.trim() || null,
        headers,
        enabled: form.enabled,
      };
      await bridge.mcp.save(input);
      await load();
      setForm(EMPTY);
      notify("Servidor MCP salvo.", "ok");
    } catch (cause) {
      notify(errorText(cause), "error");
    }
  }, [bridge, form, load, notify]);

  const remove = useCallback(
    async (server: McpServer): Promise<void> => {
      if (!bridge) return;
      if (!window.confirm(`Remover o servidor MCP "${server.name}"?`)) return;
      try {
        await bridge.mcp.remove(server.id);
        await load();
        notify("Servidor removido.", "ok");
      } catch (cause) {
        notify(errorText(cause), "error");
      }
    },
    [bridge, load, notify],
  );

  const inspect = useCallback(
    async (server: McpServer): Promise<void> => {
      if (!bridge) return;
      setLoadingTools(server.id);
      try {
        const list = await bridge.mcp.tools(server.id);
        setTools((current) => ({ ...current, [server.id]: list }));
        notify(`${list.length} ferramenta(s) encontrada(s) em "${server.name}".`, "ok");
      } catch (cause) {
        notify(errorText(cause), "error");
      } finally {
        setLoadingTools(null);
      }
    },
    [bridge, notify],
  );

  const toggle = useCallback(
    async (server: McpServer, enabled: boolean): Promise<void> => {
      if (!bridge) return;
      try {
        await bridge.mcp.save({
          id: server.id,
          name: server.name,
          transport: server.transport,
          command: server.command,
          args: server.args,
          url: server.url,
          headers: server.headers,
          enabled,
        });
        await load();
      } catch (cause) {
        notify(errorText(cause), "error");
      }
    },
    [bridge, load, notify],
  );

  return (
    <div className="stack">
      <Card title={form.id ? "Editar servidor MCP" : "Novo servidor MCP"}>
        <div className="form-grid">
          <Field label="Nome">
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Ex.: arquivos, busca, github"
            />
          </Field>
          <Field label="Transporte">
            <select
              value={form.transport}
              onChange={(event) =>
                setForm({ ...form, transport: event.target.value as McpTransport })
              }
            >
              <option value="stdio">stdio (processo local)</option>
              <option value="http">HTTP (servidor remoto)</option>
            </select>
          </Field>

          {form.transport === "stdio" ? (
            <>
              <Field label="Comando" hint="No Windows, caminhos com espaço são citados automaticamente.">
                <input
                  value={form.command}
                  onChange={(event) => setForm({ ...form, command: event.target.value })}
                  placeholder="npx"
                />
              </Field>
              <Field label="Argumentos">
                <input
                  value={form.args}
                  onChange={(event) => setForm({ ...form, args: event.target.value })}
                  placeholder="-y @modelcontextprotocol/server-filesystem C:\pasta"
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="URL">
                <input
                  value={form.url}
                  onChange={(event) => setForm({ ...form, url: event.target.value })}
                  placeholder="https://servidor/mcp"
                />
              </Field>
              <Field label="Cabeçalhos" hint="JSON com valores em texto. Evite colar segredos em texto puro.">
                <textarea
                  rows={2}
                  value={form.headers}
                  onChange={(event) => setForm({ ...form, headers: event.target.value })}
                  placeholder='{"authorization":"Bearer …"}'
                />
              </Field>
            </>
          )}
        </div>
        <div className="button-row">
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => void save()}
            disabled={!form.name.trim()}
          >
            {form.id ? "Salvar" : "Adicionar"}
          </button>
          <button type="button" className="btn" onClick={() => setForm(EMPTY)}>
            Limpar
          </button>
        </div>
      </Card>

      <Card title={`Servidores configurados (${servers.length})`} wide>
        {servers.length === 0 ? (
          <Empty>
            Nenhum servidor MCP. As ferramentas de um servidor habilitado entram no chat com prefixo
            <code> mcp_</code>.
          </Empty>
        ) : (
          <ul className="list">
            {servers.map((server) => (
              <li key={server.id} className="list-row">
                <div className="list-body">
                  <strong>
                    {server.name} <Badge tone="accent">{server.transport}</Badge>
                  </strong>
                  <small>
                    {server.transport === "stdio"
                      ? `${server.command ?? "—"} ${server.args.join(" ")}`
                      : server.url ?? "—"}
                  </small>
                  {tools[server.id] && (
                    <div className="pill-row">
                      {tools[server.id]?.length === 0 ? (
                        <small className="muted">Nenhuma ferramenta publicada.</small>
                      ) : (
                        tools[server.id]?.map((tool) => (
                          <Badge key={tool.name}>{tool.name}</Badge>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div className="list-actions">
                  <Toggle
                    checked={server.enabled}
                    label={server.enabled ? "ativo" : "desligado"}
                    onChange={(next) => void toggle(server, next)}
                  />
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => void inspect(server)}
                    disabled={loadingTools === server.id}
                  >
                    {loadingTools === server.id ? "Consultando…" : "Ver ferramentas"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() =>
                      setForm({
                        id: server.id,
                        name: server.name,
                        transport: server.transport,
                        command: server.command ?? "",
                        args: server.args.join(" "),
                        url: server.url ?? "",
                        headers: Object.keys(server.headers).length
                          ? JSON.stringify(server.headers, null, 2)
                          : "",
                        enabled: server.enabled,
                      })
                    }
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn btn-small btn-danger"
                    onClick={() => void remove(server)}
                  >
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
