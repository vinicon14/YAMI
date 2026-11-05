import type { ProviderConfig, ProviderTestResult, ToolSpec } from "@yami/contracts";
import { describeHttpError } from "./openai";
import { parseSse } from "./sse";
import {
  asRecord,
  errorMessage,
  fetchJson,
  joinUrl,
  REQUEST_TIMEOUT_MS,
  type ChatRequest,
  type ProviderAdapter,
  type ProviderMessage,
  type ProviderStreamEvent,
  type ProviderToolCall,
} from "./types";

interface AnthropicBlock {
  type: string;
  [key: string]: unknown;
}

interface AnthropicTurn {
  role: "user" | "assistant";
  content: AnthropicBlock[];
}

/**
 * Adaptador da API de Messages da Anthropic (streaming + tool use).
 */
export class AnthropicAdapter implements ProviderAdapter {
  readonly kind = "http" as const;

  constructor(
    readonly config: ProviderConfig,
    private readonly secret: string | null,
  ) {}

  private get baseUrl(): string {
    return this.config.baseUrl || "https://api.anthropic.com";
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      accept: "text/event-stream",
      "anthropic-version": "2023-06-01",
      ...(this.secret ? { "x-api-key": this.secret } : {}),
    };
  }

  async *stream(request: ChatRequest): AsyncIterable<ProviderStreamEvent> {
    if (!this.secret) {
      throw new Error("A Anthropic exige uma chave de API.");
    }

    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    const { system, turns } = toAnthropicMessages(request.messages);

    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages: turns,
      stream: true,
    };
    if (system) body.system = system;
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map(toAnthropicTool);
    }

    const response = await fetch(this.endpoint("messages"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) throw new Error(await describeHttpError(response));
    if (!response.body) throw new Error("A Anthropic respondeu sem corpo de streaming.");

    const blocks = new Map<number, { type: string; id: string; name: string; json: string }>();
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: string | null = null;
    const emitted = new Set<number>();

    for await (const message of parseSse(
      response.body as unknown as AsyncIterable<Uint8Array>,
    )) {
      if (!message.data) continue;
      let payload: Record<string, unknown>;
      try {
        payload = asRecord(JSON.parse(message.data));
      } catch {
        continue;
      }
      const type = typeof payload.type === "string" ? payload.type : message.event;

      if (type === "message_start") {
        const usage = asRecord(asRecord(payload.message).usage);
        if (typeof usage.input_tokens === "number") inputTokens = usage.input_tokens;
      } else if (type === "content_block_start") {
        const index = typeof payload.index === "number" ? payload.index : 0;
        const block = asRecord(payload.content_block);
        blocks.set(index, {
          type: typeof block.type === "string" ? block.type : "text",
          id: typeof block.id === "string" ? block.id : `call-${index}`,
          name: typeof block.name === "string" ? block.name : "",
          json: "",
        });
      } else if (type === "content_block_delta") {
        const index = typeof payload.index === "number" ? payload.index : 0;
        const delta = asRecord(payload.delta);
        if (delta.type === "text_delta" && typeof delta.text === "string" && delta.text) {
          yield { type: "text", text: delta.text };
        } else if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
          const block = blocks.get(index);
          if (block) block.json += delta.partial_json;
        }
      } else if (type === "content_block_stop") {
        const index = typeof payload.index === "number" ? payload.index : 0;
        const block = blocks.get(index);
        if (block && block.type === "tool_use" && block.name && !emitted.has(index)) {
          emitted.add(index);
          yield {
            type: "tool_call",
            call: { id: block.id, name: block.name, arguments: block.json || "{}" },
          };
        }
      } else if (type === "message_delta") {
        const delta = asRecord(payload.delta);
        if (typeof delta.stop_reason === "string") stopReason = delta.stop_reason;
        const usage = asRecord(payload.usage);
        if (typeof usage.output_tokens === "number") outputTokens = usage.output_tokens;
      } else if (type === "error") {
        const error = asRecord(payload.error);
        throw new Error(
          typeof error.message === "string" ? error.message : "Erro de streaming da Anthropic.",
        );
      }
    }

    if (inputTokens > 0 || outputTokens > 0) {
      yield { type: "usage", inputTokens, outputTokens };
    }
    yield { type: "done", stopReason };
  }

  async test(): Promise<ProviderTestResult> {
    const started = Date.now();
    try {
      const models = await this.models();
      return {
        ok: true,
        message: models.length > 0 ? `${models.length} modelo(s) disponível(is).` : "Conexão estabelecida.",
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
      const { response, json } = await fetchJson(this.endpoint("models"), {
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
      if (this.config.models.length > 0) return [...this.config.models];
      throw error;
    }
    return [...this.config.models];
  }

  private endpoint(path: string): string {
    const base = this.baseUrl.replace(/\/+$/, "");
    return /\/v\d+$/.test(base) ? joinUrl(base, path) : joinUrl(base, `v1/${path}`);
  }
}

function toAnthropicTool(tool: ToolSpec): unknown {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  };
}

export function toAnthropicMessages(messages: ProviderMessage[]): {
  system: string;
  turns: AnthropicTurn[];
} {
  const systemParts: string[] = [];
  const turns: AnthropicTurn[] = [];

  const push = (role: "user" | "assistant", block: AnthropicBlock): void => {
    const last = turns[turns.length - 1];
    if (last && last.role === role) {
      last.content.push(block);
      return;
    }
    turns.push({ role, content: [block] });
  };

  for (const message of messages) {
    if (message.role === "system") {
      if (message.content.trim()) systemParts.push(message.content.trim());
      continue;
    }

    if (message.role === "tool") {
      push("user", {
        type: "tool_result",
        tool_use_id: message.toolCallId ?? "",
        content: message.content,
      });
      continue;
    }

    if (message.role === "assistant") {
      if (message.content.trim()) {
        push("assistant", { type: "text", text: message.content });
      }
      for (const call of message.toolCalls ?? []) {
        let input: unknown = {};
        try {
          input = call.arguments ? (JSON.parse(call.arguments) as unknown) : {};
        } catch {
          input = {};
        }
        push("assistant", {
          type: "tool_use",
          id: call.id,
          name: call.name,
          input,
        });
      }
      continue;
    }

    push("user", { type: "text", text: message.content });
  }

  return { system: systemParts.join("\n\n"), turns };
}

export type { ProviderToolCall };
