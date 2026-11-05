import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ApprovalDecision,
  ApprovalRequest,
  ChatMessage,
  Thread,
} from "@yami/contracts";
import { Badge, Empty } from "../components";
import { errorText, formatDateTime, useYami } from "../context";

interface PendingTurn {
  turnId: string;
  messageId: string;
  threadId: string;
}

interface StreamingMessage {
  messageId: string;
  text: string;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o áudio."));
    reader.readAsDataURL(blob);
  });
}

export function ChatView(): React.JSX.Element {
  const { bridge, agents, settings, notify } = useYami();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [streaming, setStreaming] = useState<StreamingMessage | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [recording, setRecording] = useState(false);
  const [threadsReload, setThreadsReload] = useState(0);

  const activeThreadRef = useRef<string | null>(null);
  const pendingRef = useRef<PendingTurn | null>(null);
  const settingsRef = useRef(settings);
  const orphanDeltas = useRef<Array<{ messageId: string; text: string }>>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    activeThreadRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const speak = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (bridge) {
        try {
          const audio = await bridge.voice.speak(trimmed);
          const element = new Audio(`data:${audio.mime};base64,${audio.audioBase64}`);
          await element.play();
          return;
        } catch {
          // VoiceStudio indisponível: usa a voz offline do Chromium.
        }
      }
      if ("speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(trimmed);
        utterance.lang = "pt-BR";
        window.speechSynthesis.speak(utterance);
      }
    },
    [bridge],
  );

  const loadMessages = useCallback(
    async (threadId: string, speakLast = false): Promise<void> => {
      if (!bridge) return;
      try {
        const list = await bridge.threads.messages(threadId, 300);
        if (activeThreadRef.current !== threadId) return;
        setMessages(list);
        if (speakLast && settingsRef.current?.autoSpeak) {
          const last = [...list].reverse().find((message) => message.role === "assistant");
          if (last?.content.trim()) void speak(last.content);
        }
      } catch (cause) {
        notify(errorText(cause), "error");
      }
    },
    [bridge, notify, speak],
  );

  // Seleciona o primeiro agente quando a lista chega.
  useEffect(() => {
    if (agents.length === 0) {
      setSelectedAgentId(null);
      return;
    }
    setSelectedAgentId((current) =>
      current && agents.some((agent) => agent.id === current) ? current : (agents[0]?.id ?? null),
    );
  }, [agents]);

  // Lista as conversas do agente selecionado.
  useEffect(() => {
    if (!bridge || !selectedAgentId) {
      setThreads([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await bridge.threads.list(selectedAgentId);
        if (cancelled) return;
        setThreads(list);
        setActiveThreadId((current) =>
          current && list.some((thread) => thread.id === current) ? current : (list[0]?.id ?? null),
        );
      } catch (cause) {
        if (!cancelled) notify(errorText(cause), "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge, selectedAgentId, threadsReload, notify]);

  // Carrega as mensagens da conversa ativa.
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    void loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages]);

  // Assina eventos de streaming, aprovação e fim de turno.
  useEffect(() => {
    if (!bridge) return;

    const offDelta = bridge.stream.onDelta((payload) => {
      const current = pendingRef.current;
      if (!current || payload.turnId !== current.turnId) {
        orphanDeltas.current.push({ messageId: payload.messageId, text: payload.delta });
        if (orphanDeltas.current.length > 200) orphanDeltas.current.shift();
        return;
      }
      setStreaming((existing) => {
        if (existing && existing.messageId === payload.messageId) {
          return { messageId: existing.messageId, text: existing.text + payload.delta };
        }
        return { messageId: payload.messageId, text: payload.delta };
      });
    });

    const offEnd = bridge.stream.onTurnEnd((payload) => {
      const current = pendingRef.current;
      if (!current || payload.turnId !== current.turnId) return;
      pendingRef.current = null;
      setPending(null);
      setStreaming(null);
      if (payload.error) {
        notify(payload.error, payload.status === "cancelled" ? "info" : "error");
      }
      void loadMessages(payload.threadId, true);
      setThreadsReload((value) => value + 1);
    });

    const offNotice = bridge.stream.onNotice((payload) => notify(payload.text, "info"));

    const offApproval = bridge.approvals.onRequest((request) => {
      setApprovals((current) => [...current, request]);
    });

    return () => {
      offDelta();
      offEnd();
      offNotice();
      offApproval();
    };
  }, [bridge, loadMessages, notify]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming]);

  useEffect(() => {
    return () => {
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const activeAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  const createThread = useCallback(async (): Promise<Thread | null> => {
    if (!bridge || !selectedAgentId) return null;
    try {
      const thread = await bridge.threads.create({ agentId: selectedAgentId });
      setThreads((current) => [thread, ...current]);
      setActiveThreadId(thread.id);
      return thread;
    } catch (cause) {
      notify(errorText(cause), "error");
      return null;
    }
  }, [bridge, selectedAgentId, notify]);

  const send = useCallback(async (): Promise<void> => {
    if (!bridge || !selectedAgentId || !draft.trim() || pending) return;
    const text = draft.trim();

    let threadId = activeThreadId;
    if (!threadId) {
      const thread = await createThread();
      if (!thread) return;
      threadId = thread.id;
    }

    setDraft("");
    try {
      const turn = await bridge.chat.send({ threadId, text });
      const next: PendingTurn = { ...turn, threadId };
      pendingRef.current = next;
      setPending(next);

      const buffered = orphanDeltas.current.filter((item) => item.messageId === turn.messageId);
      orphanDeltas.current = orphanDeltas.current.filter(
        (item) => item.messageId !== turn.messageId,
      );
      setStreaming({
        messageId: turn.messageId,
        text: buffered.map((item) => item.text).join(""),
      });

      void loadMessages(threadId);
    } catch (cause) {
      notify(errorText(cause), "error");
      setDraft(text);
    }
  }, [bridge, selectedAgentId, draft, pending, activeThreadId, createThread, loadMessages, notify]);

  const cancel = useCallback(async (): Promise<void> => {
    if (!bridge || !pending) return;
    try {
      await bridge.chat.cancel(pending.turnId);
    } catch (cause) {
      notify(errorText(cause), "error");
    }
  }, [bridge, pending, notify]);

  const respondApproval = useCallback(
    async (decision: ApprovalDecision): Promise<void> => {
      const request = approvals[0];
      if (!bridge || !request) return;
      try {
        await bridge.approvals.respond(request.id, decision);
      } catch (cause) {
        notify(errorText(cause), "error");
      } finally {
        setApprovals((current) => current.filter((item) => item.id !== request.id));
      }
    },
    [approvals, bridge, notify],
  );

  const toggleRecording = useCallback(async (): Promise<void> => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      notify("Este ambiente não expõe o microfone.", "error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (!bridge || blob.size === 0) return;
        try {
          const base64 = await blobToBase64(blob);
          const result = await bridge.voice.transcribe(base64, blob.type);
          if (result.text.trim()) {
            setDraft((current) => (current ? `${current} ${result.text.trim()}` : result.text.trim()));
          } else {
            notify("Nenhuma fala reconhecida.", "info");
          }
        } catch (cause) {
          notify(errorText(cause), "error");
        }
      };
      recorder.start();
      setRecording(true);
    } catch (cause) {
      notify(`Microfone indisponível: ${errorText(cause)}`, "error");
    }
  }, [recording, bridge, notify]);

  const removeThread = useCallback(
    async (id: string): Promise<void> => {
      if (!bridge) return;
      if (!window.confirm("Apagar esta conversa e todas as mensagens dela?")) return;
      try {
        await bridge.threads.remove(id);
        setThreads((current) => current.filter((thread) => thread.id !== id));
        if (activeThreadId === id) setActiveThreadId(null);
      } catch (cause) {
        notify(errorText(cause), "error");
      }
    },
    [bridge, activeThreadId, notify],
  );

  const currentApproval = approvals[0] ?? null;
  const canSend = Boolean(draft.trim()) && !pending && Boolean(selectedAgentId);

  return (
    <section className="chat-layout">
      <aside className="chat-side">
        <div className="field">
          <span className="field-label">Agente</span>
          <select
            value={selectedAgentId ?? ""}
            onChange={(event) => setSelectedAgentId(event.target.value || null)}
          >
            {agents.length === 0 && <option value="">Nenhum agente</option>}
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>

        <button type="button" className="btn btn-accent btn-block" onClick={() => void createThread()}>
          Nova conversa
        </button>

        <div className="thread-list">
          {threads.length === 0 ? (
            <p className="empty">Nenhuma conversa ainda.</p>
          ) : (
            threads.map((thread) => (
              <div
                key={thread.id}
                className={`thread-row${thread.id === activeThreadId ? " is-active" : ""}`}
              >
                <button
                  type="button"
                  className="thread-button"
                  onClick={() => setActiveThreadId(thread.id)}
                >
                  <strong>{thread.title}</strong>
                  <small>
                    {thread.messageCount} mensagem(ns) · {formatDateTime(thread.updatedAt)}
                  </small>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  title="Apagar conversa"
                  onClick={() => void removeThread(thread.id)}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <div className="chat-main">
        <header className="chat-head">
          <div>
            <strong>{activeAgent?.name ?? "Sem agente"}</strong>
            <small>
              {activeAgent
                ? `${activeAgent.access} · ${activeAgent.workspacePath}`
                : "Crie um agente para começar"}
            </small>
          </div>
          {pending ? (
            <Badge tone="warn">respondendo…</Badge>
          ) : (
            <Badge tone="ok">pronto</Badge>
          )}
        </header>

        <div className="messages">
          {messages.length === 0 && !streaming ? (
            <Empty>
              Envie uma mensagem para começar. As ações de ferramenta aparecem aqui e pedem aprovação
              quando necessário.
            </Empty>
          ) : (
            messages.map((message) => (
              <article key={message.id} className={`message message-${message.role}`}>
                <header>
                  <span>{message.role === "user" ? "Você" : activeAgent?.name ?? "YAMI"}</span>
                  <small>{formatDateTime(message.createdAt)}</small>
                </header>
                <div className="message-body">{message.content}</div>
                {message.toolCalls.length > 0 && (
                  <div className="pill-row">
                    {message.toolCalls.map((call) => (
                      <Badge key={call.id} tone="accent">
                        ⚙ {call.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </article>
            ))
          )}

          {streaming && (
            <article className="message message-assistant is-streaming">
              <header>
                <span>{activeAgent?.name ?? "YAMI"}</span>
                <small>ao vivo</small>
              </header>
              <div className="message-body">
                {streaming.text || <span className="typing">…</span>}
              </div>
            </article>
          )}
          <div ref={bottomRef} />
        </div>

        {currentApproval && (
          <div className="approval" role="alertdialog" aria-label="Solicitação de aprovação">
            <div className="approval-head">
              <strong>Aprovação necessária</strong>
              <Badge tone="warn">{currentApproval.risk}</Badge>
            </div>
            <p>
              <code>{currentApproval.tool}</code> — {currentApproval.reason}
            </p>
            <pre className="approval-input">
              {JSON.stringify(currentApproval.input, null, 2).slice(0, 1200)}
            </pre>
            <div className="button-row">
              <button
                type="button"
                className="btn btn-accent"
                onClick={() => void respondApproval("allow-once")}
              >
                Permitir uma vez
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void respondApproval("allow-session")}
              >
                Permitir nesta sessão
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void respondApproval("deny")}
              >
                Negar
              </button>
            </div>
            {approvals.length > 1 && (
              <p className="muted">{approvals.length - 1} outra(s) solicitação(ões) na fila.</p>
            )}
          </div>
        )}

        <div className="composer">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder={
              pending ? "Aguarde a resposta ou cancele…" : "Escreva para o YAMI (Enter envia)"
            }
            rows={3}
            disabled={pending !== null || !selectedAgentId}
          />
          <div className="composer-actions">
            <button
              type="button"
              className={`btn${recording ? " btn-danger" : ""}`}
              onClick={() => void toggleRecording()}
              title="Transcrever pelo microfone"
            >
              {recording ? "Parar gravação" : "Falar"}
            </button>
            {pending ? (
              <button type="button" className="btn btn-danger" onClick={() => void cancel()}>
                Cancelar
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-accent"
                onClick={() => void send()}
                disabled={!canSend}
              >
                Enviar
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
