import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ApprovalRequest, TurnEnded } from "@yami/contracts";
import {
  AgentService,
  AuditLog,
  EventStore,
  MemoryService,
  McpService,
  Orchestrator,
  PermissionEngine,
  ProviderService,
  SecretStore,
  SettingsService,
  ThreadService,
  ToolRegistry,
  openDatabase,
} from "../src";

interface FakeState {
  mode: "write" | "shell" | "text";
}

const state: FakeState = { mode: "text" };
let server: Server;
let baseUrl = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url?.endsWith("/models")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "fake-model" }] }));
      return;
    }
    if (!req.url?.endsWith("/chat/completions")) {
      res.writeHead(404);
      res.end();
      return;
    }

    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      body += chunk;
    });
    req.on("end", () => {
      const payload = JSON.parse(body) as { messages?: Array<{ role: string }> };
      const messages = payload.messages ?? [];
      const last = messages[messages.length - 1];
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (data: unknown): void =>
        res.write(`data: ${JSON.stringify(data)}\n\n`);

      if (last?.role === "tool") {
        send({ choices: [{ delta: { content: "Concluído." }, finish_reason: "stop" }] });
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      if (state.mode === "write") {
        send({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_write",
                    function: {
                      name: "fs.write",
                      arguments: JSON.stringify({ path: "saida.txt", content: "conteudo" }),
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        });
      } else if (state.mode === "shell") {
        send({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_shell",
                    function: {
                      name: "shell.run",
                      arguments: JSON.stringify({ command: "echo nao-deveria-rodar" }),
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        });
      } else {
        send({ choices: [{ delta: { content: "Resposta da IA local." }, finish_reason: "stop" }] });
      }

      res.write("data: [DONE]\n\n");
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Porta inválida.");
  baseUrl = `http://127.0.0.1:${address.port}/v1`;
});

afterAll(() => {
  server.close();
});

interface Harness {
  dir: string;
  orchestrator: Orchestrator;
  threadId: string;
  agentId: string;
  providers: ProviderService;
  db: ReturnType<typeof openDatabase>;
  audit: AuditLog;
  ended: Promise<TurnEnded>;
  approvals: ApprovalRequest[];
}

function harness(options: { primaryBaseUrl?: string; ensureLocal?: boolean }): Harness {
  const dir = mkdtempSync(join(tmpdir(), "yami-orch-"));
  const db = openDatabase(":memory:");
  const secrets = new SecretStore(db, join(dir, "key.bin"));
  const agents = new AgentService(db);
  const threads = new ThreadService(db);
  const events = new EventStore(db);
  const audit = new AuditLog(db);
  const providers = new ProviderService(db, secrets);
  const tools = new ToolRegistry();
  const memory = new MemoryService(db);
  const mcp = new McpService(db);
  const settings = new SettingsService(db, dir);

  providers.save({
    id: "primary",
    name: "Fake principal",
    kind: "http",
    auth: "none",
    baseUrl: options.primaryBaseUrl ?? baseUrl,
    models: ["fake-model"],
    defaultModel: "fake-model",
  });
  providers.ensureLocal();
  providers.save({
    id: "local",
    name: "IA local (llama.cpp)",
    kind: "local",
    auth: "none",
    baseUrl,
    models: ["fake-model"],
    defaultModel: "fake-model",
  });

  settings.update({
    defaultProviderId: "primary",
    maxToolSteps: 4,
    fallbackToLocal: true,
    localAiEnabled: true,
    autoApproveRead: true,
  });

  const agent = agents.create({ name: "Teste", workspacePath: dir });
  const thread = threads.create(agent.id);

  let resolveEnd: (payload: TurnEnded) => void = () => undefined;
  const ended = new Promise<TurnEnded>((resolve) => {
    resolveEnd = resolve;
  });
  const approvals: ApprovalRequest[] = [];

  const orchestrator = new Orchestrator({
    db,
    agents,
    threads,
    events,
    audit,
    providers,
    tools,
    memory,
    mcp,
    settings,
    permissions: new PermissionEngine(),
    ensureLocal: async () => options.ensureLocal ?? true,
    publish: () => undefined,
    onDelta: () => undefined,
    onApproval: (request) => approvals.push(request),
    onTurnEnd: (payload) => {
      if (payload.status !== "completed") console.error("TURN_FAILED", payload.error);
      resolveEnd(payload);
    },
    onNotice: () => undefined,
  });

  return {
    dir,
    orchestrator,
    threadId: thread.id,
    agentId: agent.id,
    providers,
    db,
    audit,
    ended,
    approvals,
  };
}

function waitFor<T>(read: () => T | null, timeoutMs = 6000): Promise<T> {
  const started = Date.now();
  return new Promise<T>((resolve, reject) => {
    const tick = (): void => {
      const value = read();
      if (value !== null) {
        resolve(value);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Tempo esgotado esperando o valor."));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

describe("Orchestrator", () => {
  it("executa ferramenta de escrita permitida e conclui o turno", async () => {
    state.mode = "write";
    const h = harness({});
    try {
      await h.orchestrator.send({ threadId: h.threadId, text: "crie o arquivo" });
      const ended = await h.ended;
      expect(ended.status).toBe("completed");
      expect(existsSync(join(h.dir, "saida.txt"))).toBe(true);
      expect(h.approvals).toHaveLength(0);

      const entries = h.audit.list();
      expect(entries.some((entry) => entry.action === "fs.write" && entry.decision === "allow")).toBe(
        true,
      );
      expect(h.audit.verify().ok).toBe(true);
    } finally {
      rmSync(h.dir, { recursive: true, force: true });
    }
  });

  it("pede aprovação para shell.run e respeita a negativa", async () => {
    state.mode = "shell";
    const h = harness({});
    try {
      await h.orchestrator.send({ threadId: h.threadId, text: "rode um comando" });
      const approval = await waitFor(() => h.approvals[0] ?? null);
      expect(approval.tool).toBe("shell.run");

      h.orchestrator.respondApproval(approval.id, "deny");
      const ended = await h.ended;
      expect(ended.status).toBe("completed");

      const entries = h.audit.list();
      expect(entries.some((entry) => entry.action === "shell.run" && entry.decision === "deny")).toBe(
        true,
      );
    } finally {
      rmSync(h.dir, { recursive: true, force: true });
    }
  });

  it("faz fallback para a IA local quando o provedor principal falha", async () => {
    state.mode = "text";
    const h = harness({ primaryBaseUrl: "http://127.0.0.1:1/v1", ensureLocal: true });
    try {
      const messages = h.orchestrator.send({ threadId: h.threadId, text: "oi" });
      await messages;
      const ended = await h.ended;
      expect(ended.status).toBe("completed");

      const threadMessages = new ThreadService(h.db).messages(h.threadId);
      const assistant = threadMessages.find((message) => message.role === "assistant");
      expect(assistant?.content).toContain("Resposta da IA local.");
    } finally {
      rmSync(h.dir, { recursive: true, force: true });
    }
  });
});
