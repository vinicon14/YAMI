import type { ProviderConfig, ProviderTestResult, ToolSpec } from "@yami/contracts";
import { parseSse } from "./sse";
import {
  asRecord,
  errorMessage,
  fetchJson,
  joinUrl,
  modelsUrl,
  REQUEST_TIMEOUT_MS,
  type ChatRequest,
  type ProviderAdapter,
  type ProviderMessage,
  type ProviderStreamEvent,
  type ProviderToolCall,
} from "./types";

interface OpenAiAdapterOptions {
  /** Alguns provedores locais não suportam o parâmetro `stream_options`. */
  includeUsage?: boolean;
}

/**
 * Adaptador para qualquer endpoint compatível com a API de Chat Completions
 * da OpenAI: OpenAI, OpenRouter, Groq, DeepSeek, Mistral, xAI, Gemini
 * (endpoint compatível), Ollama, LM Studio e o llama-server local.
 */
export class OpenAiAdapter implements ProviderAdapter {
  readonly kind = "http" as const;

  constructor(
    readonly config: ProviderConfig,
    private readonly secret: string | null,
    private readonly options: OpenAiAdapterOptions = {},
  ) {}

  get baseUrl(): string {
    if (!this.config.baseUrl) {
      throw new Error(`O provedor "${this.config.name}" não tem URL base configurada.`);
    }
    return this.config.baseUrl;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "text/event-stream",
    };
    if (this.secret) headers.authorization = `Bearer ${this.secret}`;
    return headers;
  }

  async *stream(request: ChatRequest): AsyncIterable<ProviderStreamEvent> {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeout])
      : timeout;

    const body: Record<string, unknown> = {
      model: request.model,
      stream: true,
      messages: toOpenAiMessages(request.messages),
    };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map(toOpenAiTool);
    }
    if (this.options.includeUsage !== false) {
      body.stream_options = { include_usage: true };
    }

    const response = await fetch(joinUrl(this.baseUrl, "chat/completions"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      throw new Error(await describeHttpError(response));
    }
    if (!response.body) {
      throw new Error("O provedor respondeu sem corpo de streaming.");
    }

    const pending = new Map<number, ProviderToolCall>();
    let stopReason: string | null = null;

    for await (const message of parseSse(
      response.body as unknown as AsyncIterable<Uint8Array>,
    )) {
      if (!message.data || message.data === "[DONE]") continue;

      let payload: Record<string, unknown>;
      try {
        payload = asRecord(JSON.parse(message.data));
      } catch {
        continue;
      }

      const choice = asRecord((payload.choices as unknown[] | undefined)?.[0]);
      const delta = asRecord(choice.delta);

      const content = delta.content;
      if (typeof content === "string" && content) {
        yield { type: "text", text: content };
      }

      const rawCalls = delta.tool_calls;
      if (Array.isArray(rawCalls)) {
        for (const raw of rawCalls) {
          const entry = asRecord(raw);
          const index = typeof entry.index === "number" ? entry.index : 0;
          const fn = asRecord(entry.function);
          const current = pending.get(index) ?? {
            id: typeof entry.id === "string" && entry.id ? entry.id : `call-${index}`,
            name: "",
            arguments: "",
          };
          if (typeof entry.id === "string" && entry.id) current.id = entry.id;
          if (typeof fn.name === "string") current.name += fn.name;
          if (typeof fn.arguments === "string") current.arguments += fn.arguments;
          pending.set(index, current);
        }
      }

      if (typeof choice.finish_reason === "string") stopReason = choice.finish_reason;

      const usage = asRecord(payload.usage);
      if (typeof usage.prompt_tokens === "number" || typeof usage.completion_tokens === "number") {
        yield {
          type: "usage",
          inputTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0,
          outputTokens:
            typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0,
        };
      }
    }

    for (const call of pending.values()) {
      if (call.name) yield { type: "tool_call", call };
    }
    yield { type: "done", stopReason };
  }

  async test(): Promise<ProviderTestResult> {
    const started = Date.now();
    try {
      const models = await this.models();
      return {
        ok: true,
        message:
          models.length > 0
            ? `${models.length} modelo(s) disponível(is).`
            : "Conexão estabelecida.",
        models,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return {
        ok: false,
        message: errorMessage(error),
        models: [],
        latencyMs: Date.now() - started,
      };
    }
  }

  async models(): Promise<string[]> {
    try {
      const { response, json } = await fetchJson(modelsUrl(this.baseUrl), {
        headers: this.headers(),
      });
      if (!response.ok) throw new Error(await describeHttpError(response, json));
      const data = asRecord(json).data;
      if (Array.isArray(data)) {
        const ids = data
          .map((item) => asRecord(item).id)
          .filter((id): id is string => typeof id === "string")
          .sort((a, b) => a.localeCompare(b));
        if (ids.length > 0) return ids;
      }
    } catch (error) {
      if (this.config.models.length > 0) {
        // Provedor sem endpoint de listagem: usa o catálogo configurado.
        return [...this.config.models];
      }
      throw error;
    }
    return [...this.config.models];
  }
}

export function toOpenAiMessages(messages: ProviderMessage[]): unknown[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        tool_call_id: message.toolCallId ?? "",
        content: message.content,
      };
    }
    if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.arguments },
        })),
      };
    }
    return { role: message.role, content: message.content };
  });
}

function toOpenAiTool(tool: ToolSpec): unknown {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}

export async function describeHttpError(
  response: Response,
  parsed?: unknown,
): Promise<string> {
  let detail = "";
  if (typeof parsed === "string") detail = parsed;
  else if (parsed) {
    const record = asRecord(parsed);
    const error = asRecord(record.error);
    if (typeof error.message === "string") detail = error.message;
    else if (typeof record.message === "string") detail = record.message;
  } else {
    try {
      detail = (await response.text()).slice(0, 500);
    } catch {
      detail = "";
    }
  }
  const suffix = detail ? `: ${detail}` : "";
  return `HTTP ${response.status} ${response.statusText}${suffix}`.trim();
}
