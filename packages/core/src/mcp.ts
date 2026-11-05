import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import type { DatabaseSync } from "node:sqlite";
import {
  McpServerInputSchema,
  type McpServer,
  type ToolSpec,
} from "@yami/contracts";
import { parseSse } from "./providers/sse";
import { asRecord } from "./providers/types";

interface McpServerRow {
  id: string;
  name: string;
  transport: string;
  command: string | null;
  args_json: string;
  url: string | null;
  headers_json: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * Cliente MCP mínimo (JSON-RPC 2.0) com transporte stdio e HTTP.
 * Não depende do SDK oficial: só o subconjunto necessário para listar e
 * chamar ferramentas.
 */
export class McpClient {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  private sessionId: string | null = null;
  private closed = false;
  private stderr = "";

  private constructor(
    private readonly server: McpServer,
    private readonly child: ChildProcessWithoutNullStreams | null,
  ) {
    if (child) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        this.stderr = (this.stderr + chunk).slice(-4000);
      });
      const reader = createInterface({ input: child.stdout, crlfDelay: Infinity });
      reader.on("line", (line) => this.handleLine(line));
      child.on("exit", (code) => {
        this.failAll(
          new Error(
            `O servidor MCP encerrou com código ${code ?? "?"}. ${this.stderr.trim()}`,
          ),
        );
      });
      child.on("error", (error) => this.failAll(error));
    }
  }

  static async connect(server: McpServer): Promise<McpClient> {
    let child: ChildProcessWithoutNullStreams | null = null;
    if (server.transport === "stdio") {
      if (!server.command) throw new Error("Servidor MCP stdio sem comando configurado.");
      child = spawnMcp(server.command, server.args);
    }

    const client = new McpClient(server, child);
    await client.initialize();
    return client;
  }

  private async initialize(): Promise<void> {
    const result = asRecord(
      await this.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "YAMI", version: "0.1.0" },
      }),
    );
    const serverInfo = asRecord(result.serverInfo);
    void serverInfo;
    await this.notify("notifications/initialized", {});
  }

  async listTools(): Promise<ToolSpec[]> {
    const tools: ToolSpec[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < 20; page += 1) {
      const result = asRecord(
        await this.request("tools/list", cursor ? { cursor } : {}),
      );
      const listed = result.tools;
      if (Array.isArray(listed)) {
        for (const raw of listed) {
          const tool = asRecord(raw);
          const name = typeof tool.name === "string" ? tool.name : "";
          if (!name) continue;
          tools.push({
            name,
            description: typeof tool.description === "string" ? tool.description : "",
            inputSchema: asRecord(tool.inputSchema ?? tool.input_schema ?? {}),
          });
        }
      }
      cursor = typeof result.nextCursor === "string" ? result.nextCursor : undefined;
      if (!cursor) break;
    }

    return tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; output: unknown }> {
    const result = asRecord(
      await this.request("tools/call", { name, arguments: args }),
    );
    const isError = result.isError === true;
    return { ok: !isError, output: result.content ?? result };
  }

  async close(): Promise<void> {
    this.closed = true;
    this.failAll(new Error("Cliente MCP encerrado."));
    if (this.child) {
      this.child.stdin.end();
      this.child.kill();
    }
  }

  private async request(method: string, params: unknown): Promise<unknown> {
    if (this.server.transport === "http") {
      return this.requestHttp(method, params, true);
    }
    return this.requestStdio(method, params);
  }

  private async notify(method: string, params: unknown): Promise<void> {
    if (this.server.transport === "http") {
      await this.requestHttp(method, params, false);
      return;
    }
    this.writeLine({ jsonrpc: "2.0", method, params });
  }

  private requestStdio(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;

    return new Promise<unknown>((resolve, reject) => {
      if (this.closed) {
        reject(new Error("Cliente MCP já encerrado."));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Tempo esgotado ao chamar ${method} no servidor MCP.`));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      this.writeLine({ jsonrpc: "2.0", id, method, params });
    });
  }

  private async requestHttp(
    method: string,
    params: unknown,
    withId: boolean,
  ): Promise<unknown> {
    if (!this.server.url) throw new Error("Servidor MCP HTTP sem URL configurada.");
    const id = withId ? this.nextId++ : null;
    const body = withId
      ? { jsonrpc: "2.0", id, method, params }
      : { jsonrpc: "2.0", method, params };

    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...this.server.headers,
      ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
    };

    const response = await fetch(this.server.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const session = response.headers.get("mcp-session-id");
    if (session) this.sessionId = session;

    if (!withId) {
      if (!response.ok) throw new Error(`Servidor MCP respondeu HTTP ${response.status}.`);
      return null;
    }
    if (!response.ok) {
      throw new Error(`Servidor MCP respondeu HTTP ${response.status}: ${await response.text()}`);
    }

    const type = response.headers.get("content-type") ?? "";
    if (type.includes("text/event-stream") && response.body) {
      for await (const message of parseSse(
        response.body as unknown as AsyncIterable<Uint8Array>,
      )) {
        try {
          const payload = JSON.parse(message.data) as JsonRpcResponse;
          if (payload.id === id) return unwrap(payload);
        } catch {
          continue;
        }
      }
      throw new Error("O servidor MCP não devolveu resposta para a chamada.");
    }

    const payload = JSON.parse(await response.text()) as JsonRpcResponse;
    return unwrap(payload);
  }

  private writeLine(payload: unknown): void {
    if (!this.child) throw new Error("Servidor MCP sem processo stdio.");
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let payload: JsonRpcResponse;
    try {
      payload = JSON.parse(trimmed) as JsonRpcResponse;
    } catch {
      return;
    }
    if (payload.id === null || payload.id === undefined) return;
    const id = Number(payload.id);
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    clearTimeout(entry.timer);
    try {
      entry.resolve(unwrap(payload));
    } catch (error) {
      entry.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private failAll(error: Error): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
      this.pending.delete(id);
    }
  }
}

function unwrap(payload: JsonRpcResponse): unknown {
  if (payload.error) {
    throw new Error(`${payload.error.message} (${payload.error.code})`);
  }
  return payload.result ?? null;
}

function spawnMcp(command: string, args: string[]): ChildProcessWithoutNullStreams {
  const options = {
    stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: process.env,
  };

  if (process.platform === "win32") {
    // No Windows, `npx`/`uvx` são scripts .cmd. Uma linha única com caminhos
    // entre aspas evita o problema de argumentos não escapados do shell.
    const line = [command, ...args].map(quoteWindows).join(" ");
    return spawn(line, { ...options, shell: true }) as ChildProcessWithoutNullStreams;
  }

  return spawn(command, args, options) as ChildProcessWithoutNullStreams;
}

function quoteWindows(value: string): string {
  return /[\s"&|<>^()]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function safeArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function safeRecord(json: string): Record<string, string> {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

export class McpService {
  constructor(private readonly db: DatabaseSync) {}

  list(): McpServer[] {
    const rows = this.db
      .prepare("SELECT * FROM mcp_servers ORDER BY created_at ASC")
      .all() as unknown as McpServerRow[];
    return rows.map(toServer);
  }

  get(id: string): McpServer | null {
    const row = this.db.prepare("SELECT * FROM mcp_servers WHERE id = ?").get(id) as
      | McpServerRow
      | undefined;
    return row ? toServer(row) : null;
  }

  save(input: unknown): McpServer {
    const parsed = McpServerInputSchema.parse(input);
    const id = parsed.id ?? randomUUID();
    const existing = this.get(id);
    const now = new Date().toISOString();

    if (parsed.transport === "stdio" && !(parsed.command ?? existing?.command)) {
      throw new Error("Informe o comando do servidor MCP.");
    }
    if (parsed.transport === "http" && !(parsed.url ?? existing?.url)) {
      throw new Error("Informe a URL do servidor MCP.");
    }

    const server: McpServer = {
      id,
      name: parsed.name.trim(),
      transport: parsed.transport,
      command: parsed.command === undefined ? (existing?.command ?? null) : parsed.command,
      args: parsed.args ?? existing?.args ?? [],
      url: parsed.url === undefined ? (existing?.url ?? null) : parsed.url,
      headers: parsed.headers ?? existing?.headers ?? {},
      enabled: parsed.enabled ?? existing?.enabled ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO mcp_servers
           (id, name, transport, command, args_json, url, headers_json, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           transport = excluded.transport,
           command = excluded.command,
           args_json = excluded.args_json,
           url = excluded.url,
           headers_json = excluded.headers_json,
           enabled = excluded.enabled,
           updated_at = excluded.updated_at`,
      )
      .run(
        server.id,
        server.name,
        server.transport,
        server.command,
        JSON.stringify(server.args),
        server.url,
        JSON.stringify(server.headers),
        server.enabled ? 1 : 0,
        server.createdAt,
        server.updatedAt,
      );

    return server;
  }

  remove(id: string): boolean {
    const result = this.db.prepare("DELETE FROM mcp_servers WHERE id = ?").run(id);
    return Number(result.changes) > 0;
  }

  async tools(id: string): Promise<ToolSpec[]> {
    const server = this.get(id);
    if (!server) throw new Error("Servidor MCP não encontrado.");
    const client = await McpClient.connect(server);
    try {
      return await client.listTools();
    } finally {
      await client.close();
    }
  }

  async call(server: McpServer, tool: string, args: Record<string, unknown>): Promise<{ ok: boolean; output: unknown }> {
    const client = await McpClient.connect(server);
    try {
      return await client.callTool(tool, args);
    } finally {
      await client.close();
    }
  }
}

function toServer(row: McpServerRow): McpServer {
  return {
    id: row.id,
    name: row.name,
    transport: row.transport as McpServer["transport"],
    command: row.command,
    args: safeArray(row.args_json),
    url: row.url,
    headers: safeRecord(row.headers_json),
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
