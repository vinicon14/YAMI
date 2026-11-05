import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  ProviderInputSchema,
  type ProviderConfig,
  type ProviderPreset,
  type ProviderTestResult,
} from "@yami/contracts";
import type { SecretStore } from "../secrets";
import { AnthropicAdapter } from "./anthropic";
import { CliAdapter } from "./cli";
import { LocalAdapter, LOCAL_AI_BASE_URL } from "./local";
import { OpenAiAdapter } from "./openai";
import type { ProviderAdapter } from "./types";

interface ProviderRow {
  id: string;
  name: string;
  kind: string;
  auth: string;
  protocol: string;
  base_url: string | null;
  models_json: string;
  default_model: string | null;
  command: string | null;
  args_json: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export const LOCAL_PROVIDER_ID = "local";

/**
 * Catálogo de conexões prontas. Não grava nada até o usuário salvar — evita
 * poluir a interface com provedores que nunca serão usados.
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, GPT-4.1 e modelos de raciocínio.",
    kind: "http",
    auth: "api-key",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude Sonnet, Opus e Haiku.",
    kind: "http",
    auth: "api-key",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-5",
    models: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Catálogo unificado com centenas de modelos.",
    kind: "http",
    auth: "api-key",
    protocol: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    models: ["openai/gpt-4o-mini", "anthropic/claude-sonnet-4.5", "google/gemini-2.5-flash"],
  },
  {
    id: "groq",
    name: "Groq",
    description: "Inferência muito rápida em modelos abertos.",
    kind: "http",
    auth: "api-key",
    protocol: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "Modelos de chat e raciocínio de baixo custo.",
    kind: "http",
    auth: "api-key",
    protocol: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "mistral",
    name: "Mistral AI",
    description: "Modelos europeus Mistral e Codestral.",
    kind: "http",
    auth: "api-key",
    protocol: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    models: ["mistral-small-latest", "mistral-large-latest", "codestral-latest"],
  },
  {
    id: "xai",
    name: "xAI",
    description: "Modelos Grok.",
    kind: "http",
    auth: "api-key",
    protocol: "openai",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-3-mini",
    models: ["grok-3-mini", "grok-3", "grok-4"],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Endpoint compatível com OpenAI do Google AI Studio.",
    kind: "http",
    auth: "api-key",
    protocol: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Modelos locais servidos pelo Ollama (porta 11434).",
    kind: "http",
    auth: "none",
    protocol: "openai",
    baseUrl: "http://127.0.0.1:11434/v1",
    defaultModel: "qwen2.5:3b",
    models: ["qwen2.5:3b", "llama3.2:3b"],
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    description: "Servidor local compatível com OpenAI (porta 1234).",
    kind: "http",
    auth: "none",
    protocol: "openai",
    baseUrl: "http://127.0.0.1:1234/v1",
    defaultModel: "local-model",
    models: [],
  },
  {
    id: "codex-cli",
    name: "Codex CLI",
    description:
      "Executa o Codex instalado na máquina. A CLI usa as próprias permissões, fora do motor do YAMI.",
    kind: "cli",
    auth: "cli-login",
    protocol: "openai",
    baseUrl: null,
    defaultModel: "codex",
    models: ["codex"],
  },
];

export class ProviderService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly secrets: SecretStore,
  ) {}

  presets(): ProviderPreset[] {
    return PROVIDER_PRESETS.map((preset) => ({ ...preset }));
  }

  list(): ProviderConfig[] {
    const rows = this.db
      .prepare("SELECT * FROM providers ORDER BY created_at ASC")
      .all() as unknown as ProviderRow[];
    return rows.map((row) => this.toConfig(row));
  }

  get(id: string): ProviderConfig | null {
    const row = this.db.prepare("SELECT * FROM providers WHERE id = ?").get(id) as
      | ProviderRow
      | undefined;
    return row ? this.toConfig(row) : null;
  }

  save(input: unknown): ProviderConfig {
    const parsed = ProviderInputSchema.parse(input);
    const existing = parsed.id ? this.getRaw(parsed.id) : undefined;
    const id = parsed.id ?? randomUUID();
    const now = new Date().toISOString();

    const kind = parsed.kind;
    const protocol = parsed.protocol ?? (existing?.protocol as "openai" | "anthropic") ?? "openai";
    let baseUrl = parsed.baseUrl === undefined ? (existing?.base_url ?? null) : parsed.baseUrl;
    let command = parsed.command === undefined ? (existing?.command ?? null) : parsed.command;
    let args = parsed.args ?? (existing ? safeArray(existing.args_json) : []);

    if (kind === "local") {
      baseUrl = baseUrl || LOCAL_AI_BASE_URL;
      command = null;
      args = [];
    }
    if (kind === "http" || kind === "local") {
      if (!baseUrl) throw new Error("Informe a URL base do provedor.");
      command = null;
      args = [];
    }
    if (kind === "cli" || kind === "acp") {
      if (!command) throw new Error("Informe o comando do executável.");
      baseUrl = baseUrl ?? null;
    }

    let models = parsed.models ?? (existing ? safeArray(existing.models_json) : []);
    const defaultModel =
      parsed.defaultModel === undefined
        ? (existing?.default_model ?? models[0] ?? null)
        : parsed.defaultModel;
    if (defaultModel && !models.includes(defaultModel)) models = [defaultModel, ...models];

    const enabled = parsed.enabled === undefined ? Boolean(existing?.enabled ?? 1) : parsed.enabled;

    if (parsed.apiKey !== undefined) {
      if (parsed.apiKey === null || parsed.apiKey.trim() === "") this.secrets.delete(id);
      else this.secrets.set(id, parsed.apiKey);
    }

    if (existing) {
      this.db
        .prepare(
          `UPDATE providers
           SET name = ?, kind = ?, auth = ?, protocol = ?, base_url = ?, models_json = ?,
               default_model = ?, command = ?, args_json = ?, enabled = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          parsed.name.trim(),
          kind,
          parsed.auth,
          protocol,
          baseUrl,
          JSON.stringify(models),
          defaultModel,
          command,
          JSON.stringify(args),
          enabled ? 1 : 0,
          now,
          id,
        );
    } else {
      this.db
        .prepare(
          `INSERT INTO providers
             (id, name, kind, auth, protocol, base_url, models_json, default_model,
              command, args_json, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          parsed.name.trim(),
          kind,
          parsed.auth,
          protocol,
          baseUrl,
          JSON.stringify(models),
          defaultModel,
          command,
          JSON.stringify(args),
          enabled ? 1 : 0,
          now,
          now,
        );
    }

    const saved = this.get(id);
    if (!saved) throw new Error("Falha ao salvar o provedor.");
    return saved;
  }

  remove(id: string): boolean {
    this.secrets.delete(id);
    const result = this.db.prepare("DELETE FROM providers WHERE id = ?").run(id);
    return Number(result.changes) > 0;
  }

  adapter(id: string): ProviderAdapter {
    const config = this.get(id);
    if (!config) throw new Error("Provedor não encontrado.");
    if (!config.enabled) throw new Error(`O provedor "${config.name}" está desativado.`);
    const secret = this.secrets.get(id);

    switch (config.kind) {
      case "local":
        return new LocalAdapter(config);
      case "cli":
        return new CliAdapter(config, secret);
      case "http":
        return config.protocol === "anthropic"
          ? new AnthropicAdapter(config, secret)
          : new OpenAiAdapter(config, secret);
      case "acp":
        throw new Error("Provedores ACP ainda não são suportados. Use a CLI correspondente.");
    }
  }

  async test(id: string): Promise<ProviderTestResult> {
    try {
      return await this.adapter(id).test();
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        models: [],
        latencyMs: null,
      };
    }
  }

  async models(id: string): Promise<string[]> {
    return this.adapter(id).models();
  }

  /** Garante a linha do provedor local, atualizando a porta/URL se necessário. */
  ensureLocal(baseUrl = LOCAL_AI_BASE_URL): ProviderConfig {
    const existing = this.get(LOCAL_PROVIDER_ID);
    if (existing) {
      if (existing.baseUrl !== baseUrl) {
        return this.save({ ...existing, baseUrl });
      }
      return existing;
    }
    return this.save({
      id: LOCAL_PROVIDER_ID,
      name: "IA local (llama.cpp)",
      kind: "local",
      auth: "none",
      protocol: "openai",
      baseUrl,
      models: ["qwen2.5-0.5b", "qwen2.5-1.5b"],
      defaultModel: "qwen2.5-0.5b",
      enabled: true,
    });
  }

  private getRaw(id: string): ProviderRow | undefined {
    return this.db.prepare("SELECT * FROM providers WHERE id = ?").get(id) as
      | ProviderRow
      | undefined;
  }

  private toConfig(row: ProviderRow): ProviderConfig {
    return {
      id: row.id,
      name: row.name,
      kind: row.kind as ProviderConfig["kind"],
      auth: row.auth as ProviderConfig["auth"],
      protocol: (row.protocol as ProviderConfig["protocol"]) || "openai",
      baseUrl: row.base_url,
      models: safeArray(row.models_json),
      defaultModel: row.default_model,
      command: row.command,
      args: safeArray(row.args_json),
      enabled: Boolean(row.enabled),
      hasSecret: this.secrets.has(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

function safeArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}
