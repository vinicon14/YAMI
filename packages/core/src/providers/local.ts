import type { ProviderConfig, ProviderTestResult } from "@yami/contracts";
import { OpenAiAdapter } from "./openai";
import type {
  ChatRequest,
  ProviderAdapter,
  ProviderStreamEvent,
} from "./types";

export const LOCAL_AI_PORT = 3910;
export const LOCAL_AI_BASE_URL = `http://127.0.0.1:${LOCAL_AI_PORT}/v1`;

/**
 * Adaptador da IA local (llama-server). Fala o protocolo OpenAI, mas nunca
 * recebe ferramentas: a IA local só responde texto; quem executa ações são os
 * provedores conectados com permissão explícita.
 */
export class LocalAdapter implements ProviderAdapter {
  readonly kind = "local" as const;
  readonly config: ProviderConfig;
  private readonly inner: OpenAiAdapter;

  constructor(config: ProviderConfig) {
    this.config = { ...config, baseUrl: config.baseUrl || LOCAL_AI_BASE_URL };
    this.inner = new OpenAiAdapter(this.config, null, { includeUsage: true });
  }

  stream(request: ChatRequest): AsyncIterable<ProviderStreamEvent> {
    return this.inner.stream({ ...request, tools: undefined });
  }

  async test(): Promise<ProviderTestResult> {
    const started = Date.now();
    try {
      const response = await fetch(`http://127.0.0.1:${LOCAL_AI_PORT}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) {
        return {
          ok: false,
          message: `O llama-server respondeu HTTP ${response.status}.`,
          models: [],
          latencyMs: Date.now() - started,
        };
      }
      const models = await this.models();
      return {
        ok: true,
        message: "IA local pronta.",
        models,
        latencyMs: Date.now() - started,
      };
    } catch {
      return {
        ok: false,
        message: "IA local não está em execução.",
        models: [],
        latencyMs: Date.now() - started,
      };
    }
  }

  async models(): Promise<string[]> {
    return [...this.config.models];
  }
}
