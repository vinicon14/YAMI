import type {
  SpeechAudio,
  Transcription,
  VoiceStatus,
} from "@yami/contracts";

/**
 * Cliente HTTP do VoiceStudio (processo separado, AGPL-3.0).
 * Nenhum código do backend é copiado: falamos apenas pelas rotas públicas.
 */
export class VoiceService {
  constructor(
    private readonly baseUrl: () => string,
    private readonly profileId: () => string | null,
  ) {}

  get url(): string {
    return this.baseUrl().replace(/\/+$/, "");
  }

  async status(): Promise<VoiceStatus> {
    const checkedAt = new Date().toISOString();
    try {
      const response = await fetch(`${this.url}/health`, {
        signal: AbortSignal.timeout(2500),
      });
      return {
        available: response.ok,
        url: this.url,
        error: response.ok ? null : `HTTP ${response.status}`,
        checkedAt,
      };
    } catch (error) {
      return {
        available: false,
        url: this.url,
        error: error instanceof Error ? error.message : String(error),
        checkedAt,
      };
    }
  }

  async transcribe(audioBase64: string, mime: string): Promise<Transcription> {
    const bytes = Buffer.from(audioBase64, "base64");
    if (bytes.length === 0) throw new Error("Áudio vazio.");
    const form = new FormData();
    form.append("audio", new Blob([new Uint8Array(bytes)], { type: mime || "audio/webm" }), "audio.webm");

    const response = await fetch(`${this.url}/transcribe`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      throw new Error(`VoiceStudio recusou a transcrição (HTTP ${response.status}).`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const text =
      typeof payload.text === "string"
        ? payload.text
        : typeof payload.transcription === "string"
          ? payload.transcription
          : typeof payload.result === "string"
            ? payload.result
            : "";
    const duration =
      typeof payload.duration === "number"
        ? Math.round(payload.duration * 1000)
        : typeof payload.duration_ms === "number"
          ? Math.round(payload.duration_ms)
          : null;

    return { text: text.trim(), durationMs: duration };
  }

  async speak(text: string): Promise<SpeechAudio> {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Texto vazio para sintetizar.");
    const form = new FormData();
    form.append("text", trimmed);
    const profile = this.profileId();
    if (profile) form.append("profile_id", profile);
    form.append("stream", "false");

    const response = await fetch(`${this.url}/generate`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      throw new Error(`VoiceStudio recusou a síntese (HTTP ${response.status}).`);
    }

    const mime = response.headers.get("content-type") ?? "audio/wav";
    if (mime.includes("application/json")) {
      const payload = (await response.json()) as Record<string, unknown>;
      const error = typeof payload.error === "string" ? payload.error : "resposta inesperada";
      throw new Error(`VoiceStudio não gerou áudio: ${error}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) throw new Error("VoiceStudio devolveu áudio vazio.");
    return { audioBase64: buffer.toString("base64"), mime };
  }
}
