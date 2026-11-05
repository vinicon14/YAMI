import type {
  ProviderConfig,
  ProviderKind,
  ProviderTestResult,
  ToolSpec,
} from "@yami/contracts";

export type ProviderMessageRole = "system" | "user" | "assistant" | "tool";

export interface ProviderToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ProviderMessage {
  role: ProviderMessageRole;
  content: string;
  toolCallId?: string;
  /** Presente em mensagens de assistente que pediram ferramentas. */
  toolCalls?: ProviderToolCall[];
}

export interface ChatRequest {
  model: string;
  messages: ProviderMessage[];
  tools?: ToolSpec[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export type ProviderStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; call: ProviderToolCall }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "done"; stopReason: string | null };

export interface ProviderAdapter {
  readonly kind: ProviderKind;
  readonly config: ProviderConfig;
  stream(request: ChatRequest): AsyncIterable<ProviderStreamEvent>;
  test(): Promise<ProviderTestResult>;
  models(): Promise<string[]>;
}

export const REQUEST_TIMEOUT_MS = 120_000;

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/**
 * Remove sufixos de versão do endpoint para montar `/models` sem duplicar.
 * Ex.: `https://api.openai.com/v1` + `models` => `.../v1/models`.
 */
export function modelsUrl(baseUrl: string): string {
  return joinUrl(baseUrl, "models");
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs = 20_000,
): Promise<{ response: Response; json: unknown }> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  const response = await fetch(url, { ...init, signal });
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = text;
    }
  }
  return { response, json };
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
