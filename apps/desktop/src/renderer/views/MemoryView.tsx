import { useCallback, useEffect, useMemo, useState } from "react";
import type { Memory } from "@yami/contracts";
import { Badge, Card, Empty, Field } from "../components";
import { errorText, formatDateTime, useYami } from "../context";

export function MemoryView(): React.JSX.Element {
  const { bridge, agents, notify } = useYami();
  const [agentId, setAgentId] = useState<string>("");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (agents.length === 0) {
      setAgentId("");
      return;
    }
    setAgentId((current) =>
      current && agents.some((agent) => agent.id === current) ? current : (agents[0]?.id ?? ""),
    );
  }, [agents]);

  const load = useCallback(async (): Promise<void> => {
    if (!bridge) return;
    try {
      setMemories(await bridge.memory.list(agentId || undefined, 200));
    } catch (cause) {
      notify(errorText(cause), "error");
    }
  }, [bridge, agentId, notify]);

  useEffect(() => {
    setQuery("");
    void load();
  }, [load]);

  const search = useCallback(async (): Promise<void> => {
    if (!bridge || !agentId) return;
    const trimmed = query.trim();
    if (!trimmed) {
      void load();
      return;
    }
    setSearching(true);
    try {
      setMemories(await bridge.memory.search(agentId, trimmed, 50));
    } catch (cause) {
      notify(errorText(cause), "error");
    } finally {
      setSearching(false);
    }
  }, [bridge, agentId, query, load, notify]);

  const create = useCallback(async (): Promise<void> => {
    if (!bridge || !agentId || !text.trim()) return;
    setBusy(true);
    try {
      await bridge.memory.create({ agentId, text: text.trim(), origin: "manual" });
      setText("");
      await load();
      notify("Memória salva.", "ok");
    } catch (cause) {
      notify(errorText(cause), "error");
    } finally {
      setBusy(false);
    }
  }, [bridge, agentId, text, load, notify]);

  const remove = useCallback(
    async (memory: Memory): Promise<void> => {
      if (!bridge) return;
      if (!window.confirm("Apagar esta memória permanentemente?")) return;
      try {
        await bridge.memory.remove(memory.id);
        setMemories((current) => current.filter((item) => item.id !== memory.id));
        notify("Memória removida.", "ok");
      } catch (cause) {
        notify(errorText(cause), "error");
      }
    },
    [bridge, notify],
  );

  const agent = useMemo(() => agents.find((item) => item.id === agentId) ?? null, [agents, agentId]);

  return (
    <div className="stack">
      <Card title="Nova memória" wide>
        <div className="form-grid">
          <Field label="Agente">
            <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
              {agents.length === 0 && <option value="">Nenhum agente</option>}
              {agents.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Lembrança"
            hint="Preferências, fatos e decisões que o agente deve recordar nas próximas conversas."
          >
            <textarea
              rows={3}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Ex.: Prefiro respostas curtas e em português do Brasil."
            />
          </Field>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => void create()}
            disabled={!agentId || !text.trim() || busy}
          >
            {busy ? "Salvando…" : "Salvar memória"}
          </button>
        </div>
      </Card>

      <Card
        title={`Memórias${agent ? ` — ${agent.name}` : ""}`}
        actions={
          <div className="search-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void search();
              }}
              placeholder="Buscar (FTS)…"
            />
            <button
              type="button"
              className="btn btn-small"
              onClick={() => void search()}
              disabled={!agentId || searching}
            >
              {searching ? "Buscando…" : "Buscar"}
            </button>
            {query.trim() && (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  setQuery("");
                  void load();
                }}
              >
                Limpar
              </button>
            )}
          </div>
        }
        wide
      >
        {!agentId ? (
          <Empty>Crie um agente para guardar memórias.</Empty>
        ) : memories.length === 0 ? (
          <Empty>
            {query.trim()
              ? "Nenhuma memória corresponde à busca."
              : "Nenhuma memória ainda. O agente também grava lembranças ao conversar."}
          </Empty>
        ) : (
          <ul className="list">
            {memories.map((memory) => (
              <li key={memory.id} className="list-row">
                <div className="list-body">
                  <p className="memory-text">{memory.text}</p>
                  <small>
                    <Badge tone={memory.origin === "manual" ? "accent" : "neutral"}>
                      {memory.origin}
                    </Badge>{" "}
                    {formatDateTime(memory.updatedAt)}
                    {memory.sourceTurnId && ` · turno ${memory.sourceTurnId.slice(0, 8)}`}
                  </small>
                </div>
                <div className="list-actions">
                  <button
                    type="button"
                    className="btn btn-small btn-danger"
                    onClick={() => void remove(memory)}
                  >
                    Apagar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Como a memória entra no contexto">
        <ul className="checklist">
          <li>A busca usa o índice FTS5 do SQLite, sem enviar nada para fora.</li>
          <li>Memórias do agente entram no prompt de sistema das próximas conversas.</li>
          <li>Você pode apagar qualquer lembrança a qualquer momento.</li>
          <li className="is-negative">A memória não executa ações; ela apenas informa o modelo.</li>
        </ul>
      </Card>
    </div>
  );
}
