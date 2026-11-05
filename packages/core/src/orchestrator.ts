import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  ApprovalDecision,
  ApprovalRequest,
  ProviderConfig,
  StreamDelta,
  ToolCallRecord,
  ToolResult,
  ToolRisk,
  TurnEnded,
  YamiEvent,
} from "@yami/contracts";
import type { AgentService } from "./agents";
import type { AuditLog } from "./audit";
import type { EventStore } from "./events";
import type { McpService } from "./mcp";
import type { MemoryService } from "./memory";
import type { PermissionEngine } from "./permissions";
import type {
  ProviderService,
} from "./providers/registry";
import { LOCAL_PROVIDER_ID } from "./providers/registry";
import type {
  ChatRequest,
  ProviderMessage,
  ProviderStreamEvent,
  ProviderToolCall,
} from "./providers/types";
import type { SettingsService } from "./settings";
import type { ThreadService } from "./threads";
import type { ToolContext, ToolRegistry } from "./tools";

export interface OrchestratorDeps {
  db: DatabaseSync;
  agents: AgentService;
  threads: ThreadService;
  events: EventStore;
  audit: AuditLog;
  providers: ProviderService;
  tools: ToolRegistry;
  memory: MemoryService;
  mcp: McpService;
  settings: SettingsService;
  permissions: PermissionEngine;
  ensureLocal: () => Promise<boolean>;
  publish: (event: YamiEvent) => void;
  onDelta: (payload: StreamDelta) => void;
  onApproval: (request: ApprovalRequest) => void;
  onTurnEnd: (payload: TurnEnded) => void;
  onNotice: (payload: { turnId: string; text: string }) => void;
}

interface PendingApproval {
  turnId: string;
  tool: string;
  resolve: (decision: ApprovalDecision) => void;
}

interface McpRoute {
  server: import("@yami/contracts").McpServer;
  tool: string;
  spec: import("@yami/contracts").ToolSpec;
}

interface ToolBundle {
  specs: import("@yami/contracts").ToolSpec[];
  mcp: Map<string, McpRoute>;
}

const BASE_PROMPT = [
  "Você é o YAMI, um assistente pessoal privado que roda no computador do usuário.",
  "Responda em português do Brasil, de forma direta e útil.",
  "Nunca invente resultados de ferramentas. Se uma ferramenta falhar, explique o erro.",
  "Você só pode agir dentro do workspace autorizado. Ações destrutivas exigem confirmação.",
].join(" ");

/**
 * Orquestrador de turnos: monta o contexto, conversa com o provedor, executa
 * ferramentas com aprovação, registra uso e auditoria e faz fallback para a
 * IA local quando o provedor principal falha.
 */
export class Orchestrator {
  private readonly jobs = new Map<string, AbortController>();
  private readonly pending = new Map<string, PendingApproval>();
  private readonly sessionApprovals = new Set<string>();
  private mcpCache: { at: number; routes: McpRoute[] } | null = null;

  constructor(private readonly deps: OrchestratorDeps) {}

  async send(input: { threadId: string; text: string }): Promise<{ turnId: string; messageId: string }> {
    const text = input.text.trim();
    if (!text) throw new Error("A mensagem está vazia.");

    const thread = this.deps.threads.get(input.threadId);
    if (!thread) throw new Error("Conversa não encontrada.");
    const agent = this.deps.agents.get(thread.agentId);
    if (!agent) throw new Error("Agente da conversa não encontrado.");

    const settings = this.deps.settings.get();
    const resolved = this.resolveProvider(agent.providerId, settings.defaultProviderId);

    this.deps.threads.appendMessage({ threadId: thread.id, role: "user", content: text });
    const turn = this.deps.threads.createTurn({
      threadId: thread.id,
      agentId: agent.id,
      providerId: resolved.config.id,
      modelId: resolved.model,
    });
    const messageId = randomUUID();
    const controller = new AbortController();
    this.jobs.set(turn.id, controller);

    void this.run({
      turnId: turn.id,
      threadId: thread.id,
      agentId: agent.id,
      messageId,
      text,
      provider: resolved.config,
      model: resolved.model,
      controller,
    }).catch((error: unknown) => {
      // `run` já trata os próprios erros; este catch evita unhandled rejection.
      const message = error instanceof Error ? error.message : String(error);
      this.deps.onNotice({ turnId: turn.id, text: message });
    });

    return { turnId: turn.id, messageId };
  }

  cancel(turnId: string): void {
    const controller = this.jobs.get(turnId);
    if (!controller) return;
    for (const [approvalId, entry] of this.pending) {
      if (entry.turnId === turnId) {
        entry.resolve("deny");
        this.pending.delete(approvalId);
      }
    }
    controller.abort();
  }

  /** Descarta o cache de ferramentas MCP após mudanças de configuração. */
  invalidateTools(): void {
    this.mcpCache = null;
  }

  respondApproval(approvalId: string, decision: ApprovalDecision): void {
    const entry = this.pending.get(approvalId);
    if (!entry) throw new Error("Solicitação de aprovação não encontrada ou expirada.");
    this.pending.delete(approvalId);
    if (decision === "allow-session") this.sessionApprovals.add(entry.tool);
    entry.resolve(decision);

    const event: YamiEvent = {
      id: randomUUID(),
      sessionId: entry.turnId,
      at: new Date().toISOString(),
      type: "approval.resolved",
      approvalId,
      decision,
    };
    this.deps.publish(event);
  }

  /* ------------------------------------------------------------------ */
  /* Execução do turno                                                   */
  /* ------------------------------------------------------------------ */

  private async run(input: {
    turnId: string;
    threadId: string;
    agentId: string;
    messageId: string;
    text: string;
    provider: ProviderConfig;
    model: string;
    controller: AbortController;
  }): Promise<void> {
    const { turnId, threadId, agentId, controller } = input;
    const agent = this.deps.agents.get(agentId);
    if (!agent) throw new Error("Agente não encontrado.");

    const settings = this.deps.settings.get();
    const scope = {
      access: agent.access,
      workspaceRoot: agent.workspacePath,
    };

    let provider = input.provider;
    let model = input.model;
    let content = "";
    const toolCalls: ToolCallRecord[] = [];
    let fallbackUsed = false;

    this.publish({
      id: randomUUID(),
      sessionId: threadId,
      at: new Date().toISOString(),
      type: "turn.started",
      agentId,
      providerId: provider.id,
      modelId: model,
    });

    try {
      if (provider.kind === "local") {
        const ready = await this.deps.ensureLocal();
        if (!ready) {
          throw new Error(
            "A IA local não está instalada ou não iniciou. Abra “IA local” e conclua a instalação, ou conecte um provedor.",
          );
        }
      }

      const bundle = provider.kind === "local" ? { specs: [], mcp: new Map() } : await this.collectTools();
      let providerMessages = this.buildMessages(agentId, threadId, input.text, provider.kind === "local");

      for (let step = 0; step < settings.maxToolSteps; step += 1) {
        const request: ChatRequest = {
          model,
          messages: providerMessages,
          tools: provider.kind === "local" ? undefined : bundle.specs,
          signal: controller.signal,
        };

        let stepText = "";
        const calls: ProviderToolCall[] = [];

        try {
          const adapter = this.deps.providers.adapter(provider.id);
          for await (const event of adapter.stream(request)) {
            this.handleStreamEvent(event, {
              turnId,
              threadId,
              agentId,
              providerId: provider.id,
              modelId: model,
              messageId: input.messageId,
              append: (delta) => {
                content += delta;
                stepText += delta;
              },
              calls,
            });
          }
        } catch (error) {
          if (controller.signal.aborted) throw error;
          const canFallback =
            !fallbackUsed &&
            content.length === 0 &&
            stepText.length === 0 &&
            provider.id !== LOCAL_PROVIDER_ID &&
            settings.fallbackToLocal &&
            settings.localAiEnabled;

          if (!canFallback) throw error;

          fallbackUsed = true;
          const ready = await this.deps.ensureLocal();
          if (!ready) throw error;

          const localConfig = this.deps.providers.get(LOCAL_PROVIDER_ID);
          if (!localConfig) throw error;

          const reason = error instanceof Error ? error.message : String(error);
          this.deps.onNotice({
            turnId,
            text: `O provedor "${provider.name}" falhou (${reason}). Continuando com a IA local.`,
          });
          provider = localConfig;
          model = localConfig.defaultModel ?? "qwen2.5-0.5b";
          providerMessages = this.buildMessages(agentId, threadId, input.text, true);
          this.publish({
            id: randomUUID(),
            sessionId: threadId,
            at: new Date().toISOString(),
            type: "turn.started",
            agentId,
            providerId: provider.id,
            modelId: model,
          });
          step -= 1;
          continue;
        }

        if (calls.length === 0) break;

        providerMessages = [
          ...providerMessages,
          { role: "assistant", content: stepText, toolCalls: calls },
        ];

        for (const call of calls) {
          if (provider.kind === "local") break;
          toolCalls.push({ id: call.id, name: call.name, arguments: call.arguments });

          const started = Date.now();
          const result = await this.executeTool({
            turnId,
            threadId,
            agentId,
            call,
            scope,
            bundle,
            signal: controller.signal,
          });
          const duration = Date.now() - started;

          providerMessages.push({
            role: "tool",
            toolCallId: call.id,
            content: serializeForModel(result),
          });

          this.publish({
            id: randomUUID(),
            sessionId: threadId,
            at: new Date().toISOString(),
            type: "tool.result",
            callId: call.id,
            ok: result.ok,
            output: result.output,
          });

          this.deps.audit.append({
            actor: agentId,
            action: call.name,
            risk: result.risk ?? "exec",
            decision: result.decision,
            detail: `turno ${turnId} · ${duration} ms · ${
              result.ok ? "ok" : `erro: ${result.error ?? "desconhecido"}`
            }`,
          });
        }

        if (content.trim().length === 0 && step === settings.maxToolSteps - 1) {
          this.deps.onNotice({
            turnId,
            text: "Limite de etapas de ferramentas atingido.",
          });
        }
      }

      const message = this.deps.threads.appendMessage({
        threadId,
        role: "assistant",
        content,
        turnId,
        toolCalls,
      });
      this.deps.threads.finishTurn(turnId, "completed");
      this.publish({
        id: randomUUID(),
        sessionId: threadId,
        at: new Date().toISOString(),
        type: "turn.completed",
        messageId: message.id,
      });
      this.deps.onTurnEnd({ turnId, threadId, status: "completed", error: null });
    } catch (error) {
      const aborted = controller.signal.aborted;
      const message = aborted
        ? "Cancelado pelo usuário."
        : error instanceof Error
          ? error.message
          : String(error);

      if (content.trim()) {
        this.deps.threads.appendMessage({
          threadId,
          role: "assistant",
          content: `${content}\n\n_A resposta foi interrompida: ${message}_`,
          turnId,
          toolCalls,
        });
      }

      this.deps.threads.finishTurn(turnId, aborted ? "cancelled" : "failed", message);
      this.publish({
        id: randomUUID(),
        sessionId: threadId,
        at: new Date().toISOString(),
        type: "turn.failed",
        error: message,
      });
      this.deps.onTurnEnd({
        turnId,
        threadId,
        status: aborted ? "cancelled" : "failed",
        error: message,
      });
    } finally {
      this.jobs.delete(turnId);
      for (const [approvalId, entry] of this.pending) {
        if (entry.turnId === turnId) this.pending.delete(approvalId);
      }
    }
  }

  private handleStreamEvent(
    event: ProviderStreamEvent,
    context: {
      turnId: string;
      threadId: string;
      agentId: string;
      providerId: string;
      modelId: string;
      messageId: string;
      append: (delta: string) => void;
      calls: ProviderToolCall[];
    },
  ): void {
    if (event.type === "text") {
      context.append(event.text);
      this.deps.onDelta({
        turnId: context.turnId,
        messageId: context.messageId,
        delta: event.text,
      });
    } else if (event.type === "tool_call") {
      context.calls.push(event.call);
      this.publish({
        id: randomUUID(),
        sessionId: context.threadId,
        at: new Date().toISOString(),
        type: "tool.call",
        call: {
          id: event.call.id,
          name: event.call.name,
          risk: "exec",
          input: safeParse(event.call.arguments),
        },
        decision: "ask",
      });
    } else if (event.type === "usage") {
      this.deps.db
        .prepare(
          `INSERT INTO usage_records
             (id, agent_id, thread_id, turn_id, provider_id, model_id,
              input_tokens, output_tokens, cost_usd, occurred_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          context.agentId,
          context.threadId,
          context.turnId,
          context.providerId,
          context.modelId,
          event.inputTokens,
          event.outputTokens,
          null,
          new Date().toISOString(),
        );
      this.publish({
        id: randomUUID(),
        sessionId: context.threadId,
        at: new Date().toISOString(),
        type: "usage",
        usage: { inputTokens: event.inputTokens, outputTokens: event.outputTokens },
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Ferramentas                                                         */
  /* ------------------------------------------------------------------ */

  private async executeTool(input: {
    turnId: string;
    threadId: string;
    agentId: string;
    call: ProviderToolCall;
    scope: { access: import("@yami/contracts").AccessLevel; workspaceRoot: string };
    bundle: ToolBundle;
    signal: AbortSignal;
  }): Promise<ToolResult & { decision: import("@yami/contracts").PermissionDecision; risk?: ToolRisk }> {
    const args = safeParse(input.call.arguments);
    const route = input.bundle.mcp.get(input.call.name);
    const builtin = this.deps.tools.has(input.call.name);
    const risk: ToolRisk = route ? "exec" : builtin ? riskOf(input.call.name) : "exec";
    const destructive = builtin && input.call.name === "fs.delete";

    const decision = this.deps.permissions.evaluate(input.scope, {
      name: input.call.name,
      risk,
      path: typeof args.path === "string" ? args.path : undefined,
      destructive,
    });

    let resolved = decision;
    if (decision === "ask") {
      if (this.sessionApprovals.has(input.call.name)) {
        resolved = "allow";
      } else {
        const approvalId = randomUUID();
        const request: ApprovalRequest = {
          id: approvalId,
          turnId: input.turnId,
          callId: input.call.id,
          tool: input.call.name,
          risk,
          input: args,
          reason: destructive
            ? "Ação destrutiva: confirme antes de continuar."
            : `A ferramenta "${input.call.name}" pode alterar arquivos ou executar comandos.`,
          createdAt: new Date().toISOString(),
        };

        this.publish({
          id: randomUUID(),
          sessionId: input.threadId,
          at: new Date().toISOString(),
          type: "approval.requested",
          approvalId,
          callId: input.call.id,
          tool: input.call.name,
          risk,
        });
        this.deps.onApproval(request);

        const approval = await new Promise<ApprovalDecision>((resolveApproval) => {
          this.pending.set(approvalId, {
            turnId: input.turnId,
            tool: input.call.name,
            resolve: resolveApproval,
          });
        });

        if (input.signal.aborted) resolved = "deny";
        else resolved = approval === "deny" ? "deny" : "allow";
      }
    }

    if (resolved === "deny") {
      return {
        callId: input.call.id,
        ok: false,
        output: null,
        error: "Ação negada pelo usuário ou bloqueada pelo motor de permissões.",
        durationMs: 0,
        decision: "deny",
        risk,
      };
    }

    const context: ToolContext = {
      workspaceRoot: input.scope.workspaceRoot,
      access: input.scope.access,
      signal: input.signal,
    };

    if (route) {
      const started = Date.now();
      try {
        const result = await this.deps.mcp.call(route.server, route.tool, args);
        return {
          callId: input.call.id,
          ok: result.ok,
          output: result.output,
          error: result.ok ? null : "A ferramenta MCP devolveu erro.",
          durationMs: Date.now() - started,
          decision: "allow",
          risk,
        };
      } catch (error) {
        return {
          callId: input.call.id,
          ok: false,
          output: null,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - started,
          decision: "allow",
          risk,
        };
      }
    }

    const result = await this.deps.tools.execute(input.call.name, args, context);
    return { ...result, callId: input.call.id, decision: "allow", risk };
  }

  private async collectTools(): Promise<ToolBundle> {
    const enabled = this.toolState();
    const specs: import("@yami/contracts").ToolSpec[] = [];
    const mcp = new Map<string, McpRoute>();

    for (const descriptor of this.deps.tools.descriptors(enabled)) {
      if (descriptor.enabled) specs.push({ ...descriptor });
    }

    const routes = await this.mcpRoutes();
    for (const route of routes) {
      const exposed = mcpName(route.server.name, route.spec.name);
      if (mcp.has(exposed)) continue;
      mcp.set(exposed, route);
      specs.push({
        name: exposed,
        description: `[MCP: ${route.server.name}] ${route.spec.description}`,
        inputSchema: route.spec.inputSchema,
      });
    }

    return { specs, mcp };
  }

  private async mcpRoutes(): Promise<McpRoute[]> {
    if (this.mcpCache && Date.now() - this.mcpCache.at < 60_000) return this.mcpCache.routes;
    const routes: McpRoute[] = [];

    for (const server of this.deps.mcp.list()) {
      if (!server.enabled) continue;
      try {
        const tools = await this.deps.mcp.tools(server.id);
        for (const spec of tools) routes.push({ server, tool: spec.name, spec });
      } catch {
        // Servidor indisponível não deve impedir o chat.
      }
    }

    this.mcpCache = { at: Date.now(), routes };
    return routes;
  }

  private toolState(): Map<string, boolean> {
    const rows = this.deps.db.prepare("SELECT name, enabled FROM tools").all() as Array<{
      name: string;
      enabled: number;
    }>;
    const map = new Map<string, boolean>();
    for (const row of rows) map.set(row.name, Boolean(row.enabled));
    return map;
  }

  /* ------------------------------------------------------------------ */
  /* Contexto                                                            */
  /* ------------------------------------------------------------------ */

  private buildMessages(
    agentId: string,
    threadId: string,
    query: string,
    local: boolean,
  ): ProviderMessage[] {
    const agent = this.deps.agents.get(agentId);
    const settings = this.deps.settings.get();
    const memories = this.deps.memory.search(agentId, query, 6);
    const recent = this.deps.memory.list(agentId, 4);
    const merged = [...memories, ...recent].filter(
      (memory, index, list) => list.findIndex((item) => item.id === memory.id) === index,
    );

    const systemParts = [BASE_PROMPT];
    if (agent?.instructions.trim()) systemParts.push(`Instruções do agente:\n${agent.instructions}`);
    if (agent?.workspacePath) systemParts.push(`Workspace autorizado: ${agent.workspacePath}`);
    if (local) {
      systemParts.push(
        "Você é a IA local de fallback. NÃO executa ferramentas nem altera o computador; apenas responde e conversa. Se pedirem uma ação no computador, explique que é preciso conectar um provedor com ferramentas.",
      );
    }
    if (merged.length > 0) {
      systemParts.push(
        `Memórias relevantes:\n${merged.map((memory) => `- ${memory.text}`).join("\n")}`,
      );
    }
    if (settings.maxToolSteps > 0 && !local) {
      systemParts.push("Use ferramentas somente quando necessário e explique o resultado.");
    }

    const messages: ProviderMessage[] = [{ role: "system", content: systemParts.join("\n\n") }];
    const history = this.deps.threads.messages(threadId, 60);
    for (const message of history) {
      if (message.role !== "user" && message.role !== "assistant") continue;
      if (!message.content.trim()) continue;
      messages.push({
        role: message.role,
        content: message.content,
      });
    }
    return messages;
  }

  private resolveProvider(
    agentProviderId: string | null,
    defaultProviderId: string | null,
  ): { config: ProviderConfig; model: string } {
    const candidates = [agentProviderId, defaultProviderId, LOCAL_PROVIDER_ID].filter(
      (id): id is string => Boolean(id),
    );

    for (const id of candidates) {
      const config = this.deps.providers.get(id);
      if (!config) continue;
      if (!config.enabled) continue;
      const model = config.defaultModel ?? config.models[0];
      if (!model) {
        throw new Error(`O provedor "${config.name}" não tem modelo padrão configurado.`);
      }
      return { config, model };
    }

    throw new Error(
      "Nenhum provedor disponível. Conecte um provedor em “Provedores” ou instale a IA local.",
    );
  }

  private publish(event: YamiEvent): void {
    this.deps.events.append(event);
    this.deps.publish(event);
  }
}

/* ------------------------------------------------------------------ */
/* Auxiliares                                                          */
/* ------------------------------------------------------------------ */

function safeParse(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function serializeForModel(result: ToolResult): string {
  const payload = result.ok
    ? { ok: true, output: result.output }
    : { ok: false, error: result.error ?? "erro desconhecido" };
  const text = JSON.stringify(payload);
  return text.length > 20_000 ? `${text.slice(0, 20_000)}…[truncado]` : text;
}

function mcpName(server: string, tool: string): string {
  const slug = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `mcp_${slug(server)}_${slug(tool)}`.slice(0, 64);
}

function riskOf(name: string): ToolRisk {
  if (name === "shell.run") return "exec";
  if (name.startsWith("fs.write") || name.startsWith("fs.mkdir") || name.startsWith("fs.delete")) {
    return "write";
  }
  return "read";
}
