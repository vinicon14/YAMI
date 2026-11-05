import { spawn } from "node:child_process";
import type { ProviderConfig, ProviderTestResult } from "@yami/contracts";
import {
  errorMessage,
  type ChatRequest,
  type ProviderAdapter,
  type ProviderMessage,
  type ProviderStreamEvent,
} from "./types";

function buildCommand(
  command: string,
  args: string[],
): { file: string; argv: string[]; shell: boolean } {
  if (command.toLowerCase().endsWith(".ps1")) {
    return {
      file: "powershell.exe",
      argv: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", command, ...args],
      shell: false,
    };
  }
  return { file: command, argv: args, shell: process.platform === "win32" };
}

/**
 * Adaptador para CLIs de agentes (Codex CLI, Claude Code, Gemini CLI...).
 * A conversa é enviada por stdin e a resposta é lida em streaming do stdout.
 * Ferramentas nativas do YAMI não são repassadas para essas CLIs.
 */
export class CliAdapter implements ProviderAdapter {
  readonly kind = "cli" as const;

  constructor(
    readonly config: ProviderConfig,
    private readonly secret: string | null,
  ) {}

  async *stream(request: ChatRequest): AsyncIterable<ProviderStreamEvent> {
    if (!this.config.command) {
      throw new Error(`O provedor "${this.config.name}" não tem comando configurado.`);
    }

    const { file, argv, shell } = buildCommand(this.config.command, this.config.args);
    const child = spawn(file, argv, {
      shell,
      windowsHide: true,
      env: {
        ...process.env,
        ...(this.secret ? { YAMI_API_KEY: this.secret } : {}),
      },
    });

    child.stdin.write(renderPrompt(request.messages));
    child.stdin.end();

    const queue: string[] = [];
    let finished = false;
    let failure: Error | null = null;
    let wake: (() => void) | null = null;
    let stderr = "";

    const notify = (): void => {
      const resume = wake;
      wake = null;
      resume?.();
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      queue.push(chunk);
      notify();
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.on("error", (error) => {
      failure = new Error(`Falha ao executar "${file}": ${error.message}`);
      finished = true;
      notify();
    });
    child.on("close", (code) => {
      if (code !== 0 && !failure) {
        failure = new Error(
          `O comando terminou com código ${code}.${stderr.trim() ? ` ${stderr.trim()}` : ""}`,
        );
      }
      finished = true;
      notify();
    });

    const onAbort = (): void => {
      child.kill();
    };
    request.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      while (!finished || queue.length > 0) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve;
            if (finished) resolve();
          });
          continue;
        }
        const chunk = queue.shift();
        if (chunk) yield { type: "text", text: chunk };
      }
      if (failure) throw failure;
      yield { type: "done", stopReason: "stop" };
    } finally {
      request.signal?.removeEventListener("abort", onAbort);
      if (!finished) child.kill();
    }
  }

  async test(): Promise<ProviderTestResult> {
    const started = Date.now();
    if (!this.config.command) {
      return { ok: false, message: "Informe o comando da CLI.", models: [], latencyMs: null };
    }

    const { file, argv, shell } = buildCommand(this.config.command, ["--version"]);
    try {
      const result = await runOnce(file, argv, shell, 10_000);
      const message = (result.stdout || result.stderr).trim().split("\n")[0] ?? "Executável encontrado.";
      return {
        ok: result.code === 0,
        message: result.code === 0 ? message : `Código ${result.code}: ${message}`,
        models: this.catalog(),
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return { ok: false, message: errorMessage(error), models: [], latencyMs: Date.now() - started };
    }
  }

  async models(): Promise<string[]> {
    return this.catalog();
  }

  private catalog(): string[] {
    if (this.config.models.length > 0) return [...this.config.models];
    return this.config.defaultModel ? [this.config.defaultModel] : ["padrão"];
  }
}

function renderPrompt(messages: ProviderMessage[]): string {
  const parts: string[] = [];
  for (const message of messages) {
    if (message.role === "system") {
      parts.push(`Instruções do sistema:\n${message.content}`);
    } else if (message.role === "user") {
      parts.push(`Usuário: ${message.content}`);
    } else if (message.role === "assistant") {
      parts.push(`Assistente: ${message.content}`);
    } else if (message.role === "tool") {
      parts.push(`Resultado de ferramenta (${message.toolCallId ?? "?"}): ${message.content}`);
    }
  }
  parts.push("Assistente:");
  return `${parts.join("\n\n")}\n`;
}

function runOnce(
  file: string,
  argv: string[],
  shell: boolean,
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, argv, { shell, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Tempo esgotado ao executar a CLI."));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = (stdout + chunk).slice(-8000);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-8000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}
