import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProviderConfig } from "@yami/contracts";
import {
  AnthropicAdapter,
  OpenAiAdapter,
  ProviderService,
  SecretStore,
  openDatabase,
} from "../src";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function config(baseUrl: string, partial: Partial<ProviderConfig> = {}): ProviderConfig {
  const now = new Date(0).toISOString();
  return {
    id: "fake",
    name: "Fake",
    kind: "http",
    auth: "api-key",
    protocol: "openai",
    baseUrl,
    models: ["fake-model"],
    defaultModel: "fake-model",
    command: null,
    args: [],
    enabled: true,
    hasSecret: true,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Porta inválida.");
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function sse(res: import("node:http").ServerResponse, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

let server: Server;
let baseUrl: string;
let requests = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.method === "GET" && req.url?.endsWith("/models")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "fake-model" }, { id: "alpha-model" }] }));
      return;
    }

    if (req.method === "POST" && req.url?.endsWith("/chat/completions")) {
      requests += 1;
      res.writeHead(200, { "content-type": "text/event-stream" });
      sse(res, { choices: [{ delta: { content: "Olá" }, finish_reason: null }] });
      sse(res, { choices: [{ delta: { content: " mundo" }, finish_reason: null }] });
      sse(res, {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_1",
                  function: { name: "fs.write", arguments: '{"path":' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      });
      sse(res, {
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { arguments: '"a.txt"}' } }],
            },
            finish_reason: "tool_calls",
          },
        ],
      });
      sse(res, { choices: [], usage: { prompt_tokens: 12, completion_tokens: 7 } });
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    if (req.method === "POST" && req.url?.endsWith("/v1/messages")) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (event: string, data: unknown): void => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      send("message_start", { type: "message_start", message: { usage: { input_tokens: 9 } } });
      send("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      });
      send("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Oi" },
      });
      send("content_block_stop", { type: "content_block_stop", index: 0 });
      send("content_block_start", {
        type: "content_block_start",
        index: 1,
        content_block: { type: "tool_use", id: "tool_1", name: "fs.list" },
      });
      send("content_block_delta", {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: '{"path":"."}' },
      });
      send("content_block_stop", { type: "content_block_stop", index: 1 });
      send("message_delta", {
        type: "message_delta",
        delta: { stop_reason: "tool_use" },
        usage: { output_tokens: 5 },
      });
      send("message_stop", { type: "message_stop" });
      res.end();
      return;
    }

    if (req.method === "GET" && req.url?.endsWith("/v1/models")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "claude-fake" }] }));
      return;
    }

    res.writeHead(404);
    res.end();
  });
  baseUrl = await listen(server);
});

afterAll(() => {
  server.close();
});

describe("OpenAiAdapter", () => {
  it("lê texto, chamadas de ferramenta e uso de um stream SSE", async () => {
    const adapter = new OpenAiAdapter(config(baseUrl), "sk-test");
    const events = [];
    for await (const event of adapter.stream({
      model: "fake-model",
      messages: [{ role: "user", content: "oi" }],
    })) {
      events.push(event);
    }

    expect(events.filter((e) => e.type === "text").map((e) => (e.type === "text" ? e.text : ""))).toEqual([
      "Olá",
      " mundo",
    ]);
    const call = events.find((e) => e.type === "tool_call");
    expect(call && call.type === "tool_call" ? call.call.name : null).toBe("fs.write");
    expect(call && call.type === "tool_call" ? call.call.arguments : null).toBe('{"path":"a.txt"}');
    expect(events.some((e) => e.type === "usage")).toBe(true);
    expect(events.at(-1)?.type).toBe("done");
    expect(requests).toBeGreaterThan(0);
  });

  it("lista modelos e testa a conexão", async () => {
    const adapter = new OpenAiAdapter(config(baseUrl), "sk-test");
    await expect(adapter.models()).resolves.toEqual(["alpha-model", "fake-model"]);
    const result = await adapter.test();
    expect(result.ok).toBe(true);
    expect(result.models).toContain("fake-model");
  });
});

describe("AnthropicAdapter", () => {
  it("converte mensagens e lê texto, ferramenta e uso", async () => {
    const adapter = new AnthropicAdapter(
      config(baseUrl, { protocol: "anthropic", baseUrl }),
      "sk-ant",
    );
    const events = [];
    for await (const event of adapter.stream({
      model: "claude-fake",
      messages: [
        { role: "system", content: "seja breve" },
        { role: "user", content: "oi" },
        { role: "tool", toolCallId: "t1", content: "ok" },
      ],
      tools: [{ name: "fs.list", description: "lista", inputSchema: { type: "object" } }],
    })) {
      events.push(event);
    }

    expect(events.some((e) => e.type === "text" && e.text === "Oi")).toBe(true);
    const call = events.find((e) => e.type === "tool_call");
    expect(call && call.type === "tool_call" ? call.call.name : null).toBe("fs.list");
    const usage = events.find((e) => e.type === "usage");
    expect(usage && usage.type === "usage" ? usage.inputTokens : null).toBe(9);
    expect(usage && usage.type === "usage" ? usage.outputTokens : null).toBe(5);
  });
});

describe("ProviderService", () => {
  it("salva a chave cifrada e testa o provedor", async () => {
    const dir = mkdtempSync(join(tmpdir(), "yami-providers-"));
    try {
      const db = openDatabase(":memory:");
      const secrets = new SecretStore(db, join(dir, "key.bin"));
      const service = new ProviderService(db, secrets);

      const saved = service.save({
        id: "p1",
        name: "Fake",
        kind: "http",
        auth: "api-key",
        baseUrl,
        apiKey: "sk-secret-value",
        models: ["fake-model"],
        defaultModel: "fake-model",
      });

      expect(saved.hasSecret).toBe(true);
      const row = db.prepare("SELECT value FROM secrets WHERE id = ?").get("p1") as {
        value: string;
      };
      expect(row.value).not.toContain("sk-secret-value");

      const result = await service.test("p1");
      expect(result.ok).toBe(true);
      expect(service.presets().length).toBeGreaterThan(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
