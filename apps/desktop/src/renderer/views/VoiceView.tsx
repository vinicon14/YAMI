import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceStatus } from "@yami/contracts";
import { Badge, Card, Field } from "../components";
import { errorText, useYami } from "../context";

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

export function VoiceView(): React.JSX.Element {
  const { bridge, settings, refreshSettings, notify } = useYami();
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [text, setText] = useState("Olá, eu sou o YAMI. Estou pronto para ajudar.");
  const [speaking, setSpeaking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const check = useCallback(async (): Promise<void> => {
    if (!bridge) return;
    setChecking(true);
    try {
      setStatus(await bridge.voice.status());
    } catch (cause) {
      notify(errorText(cause), "error");
    } finally {
      setChecking(false);
    }
  }, [bridge, notify]);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    return () => {
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const speakFallback = useCallback((value: string): void => {
    if (!("speechSynthesis" in window)) {
      notify("Este ambiente não tem voz offline disponível.", "error");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = "pt-BR";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [notify]);

  const speak = useCallback(async (): Promise<void> => {
    const value = text.trim();
    if (!value) return;
    setSpeaking(true);
    try {
      if (bridge) {
        const audio = await bridge.voice.speak(value);
        const element = new Audio(`data:${audio.mime};base64,${audio.audioBase64}`);
        await element.play();
        return;
      }
      speakFallback(value);
    } catch {
      speakFallback(value);
      notify("VoiceStudio indisponível; usei a voz offline do sistema.", "info");
    } finally {
      setSpeaking(false);
    }
  }, [bridge, text, notify, speakFallback]);

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
        setBusy(true);
        try {
          const base64 = await blobToBase64(blob);
          const result = await bridge.voice.transcribe(base64, blob.type);
          setTranscript(result.text);
          if (result.text.trim()) {
            notify("Transcrição concluída.", "ok");
          } else {
            notify("Nenhuma fala reconhecida.", "info");
          }
        } catch (cause) {
          notify(errorText(cause), "error");
        } finally {
          setBusy(false);
        }
      };
      recorder.start();
      setRecording(true);
    } catch (cause) {
      notify(`Microfone indisponível: ${errorText(cause)}`, "error");
    }
  }, [recording, bridge, notify]);

  const updateSettings = useCallback(
    async (patch: Parameters<NonNullable<typeof bridge>["settings"]["update"]>[0]): Promise<void> => {
      if (!bridge) return;
      try {
        await bridge.settings.update(patch);
        await refreshSettings();
        notify("Configuração de voz salva.", "ok");
      } catch (cause) {
        notify(errorText(cause), "error");
      }
    },
    [bridge, refreshSettings, notify],
  );

  const fallbackAvailable = settings?.fallbackToLocal ?? true;

  return (
    <div className="stack">
      <Card
        title="VoiceStudio"
        actions={
          status?.available ? (
            <Badge tone="ok">disponível</Badge>
          ) : (
            <Badge tone="warn">offline</Badge>
          )
        }
        wide
      >
        <div className="kpi-row">
          <div className="kpi">
            <span>Endpoint</span>
            <strong className="kpi-text">{status?.url ?? settings?.voiceUrl ?? "—"}</strong>
            <small>processo separado, via HTTP</small>
          </div>
          <div className="kpi">
            <span>Perfil de voz</span>
            <strong className="kpi-text">{settings?.voiceProfileId ?? "padrão"}</strong>
            <small>usado na síntese</small>
          </div>
          <div className="kpi">
            <span>Verificado</span>
            <strong className="kpi-text">
              {status ? new Date(status.checkedAt).toLocaleTimeString("pt-BR") : "—"}
            </strong>
            <small>{checking ? "consultando…" : "última checagem"}</small>
          </div>
          <div className="kpi">
            <span>Voz offline</span>
            <strong className="kpi-text">{fallbackAvailable ? "pronta" : "desligada"}</strong>
            <small>speechSynthesis do Chromium</small>
          </div>
        </div>

        {status?.error && <div className="banner banner-error">{status.error}</div>}
        {!status?.available && (
          <p className="muted">
            O VoiceStudio não respondeu em <code>{settings?.voiceUrl ?? "—"}</code>. A síntese usa
            automaticamente a voz offline do sistema; a transcrição precisa do backend.
          </p>
        )}

        <div className="button-row">
          <button type="button" className="btn" onClick={() => void check()} disabled={checking}>
            {checking ? "Verificando…" : "Verificar conexão"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (bridge) void bridge.app.openPath(settings?.workspaceRoot ?? "").catch(() => undefined);
            }}
          >
            Abrir workspace
          </button>
        </div>
      </Card>

      <Card title="Síntese de voz (TTS)">
        <Field label="Texto" hint="Usa o VoiceStudio quando disponível; caso contrário, a voz offline.">
          <textarea rows={3} value={text} onChange={(event) => setText(event.target.value)} />
        </Field>
        <div className="button-row">
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => void speak()}
            disabled={!text.trim() || speaking}
          >
            {speaking ? "Falando…" : "Falar agora"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if ("speechSynthesis" in window) window.speechSynthesis.cancel();
            }}
          >
            Parar áudio
          </button>
        </div>
      </Card>

      <Card title="Transcrição (STT)">
        <p className="muted">
          Grave uma mensagem curta. O áudio vai para o VoiceStudio local e o texto aparece abaixo; nada
          é enviado para a nuvem.
        </p>
        <div className="button-row">
          <button
            type="button"
            className={`btn${recording ? " btn-danger" : ""}`}
            onClick={() => void toggleRecording()}
            disabled={busy}
          >
            {recording ? "Parar gravação" : busy ? "Transcrevendo…" : "Gravar"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setTranscript("");
            }}
            disabled={!transcript}
          >
            Limpar texto
          </button>
        </div>
        {transcript && (
          <div className="transcript">
            <span className="field-label">Transcrição</span>
            <p>{transcript}</p>
          </div>
        )}
      </Card>

      <Card title="Preferências de voz">
        <div className="form-grid">
          <Field label="URL do VoiceStudio">
            <input
              value={settings?.voiceUrl ?? ""}
              onChange={(event) => void updateSettings({ voiceUrl: event.target.value })}
              placeholder="http://127.0.0.1:3900"
            />
          </Field>
          <Field label="ID do perfil de voz" hint="Deixe em branco para usar a voz padrão do serviço.">
            <input
              value={settings?.voiceProfileId ?? ""}
              onChange={(event) =>
                void updateSettings({ voiceProfileId: event.target.value.trim() || null })
              }
              placeholder="ex.: 55bc743f"
            />
          </Field>
          <Field label="Falar respostas automaticamente">
            <select
              value={settings?.autoSpeak ? "yes" : "no"}
              onChange={(event) => void updateSettings({ autoSpeak: event.target.value === "yes" })}
            >
              <option value="no">Não</option>
              <option value="yes">Sim, ler cada resposta</option>
            </select>
          </Field>
          <Field label="Palavras de ativação" hint="Separadas por vírgula. Usadas quando a escuta estiver ativa.">
            <input
              value={(settings?.wakeWords ?? []).join(", ")}
              onChange={(event) =>
                void updateSettings({
                  wakeWords: event.target.value
                    .split(",")
                    .map((word) => word.trim().toLowerCase())
                    .filter(Boolean),
                })
              }
              placeholder="yami, jarvis"
            />
          </Field>
        </div>
      </Card>
    </div>
  );
}
