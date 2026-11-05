import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  openSync,
  closeSync,
  writeSync,
} from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import type {
  LocalAiModel,
  LocalAiProgress,
  LocalAiStatus,
} from "@yami/contracts";

export const LOCAL_AI_DEFAULT_PORT = 3910;

interface ModelDefinition extends LocalAiModel {
  repo: string;
}

export const LOCAL_AI_MODELS: ModelDefinition[] = [
  {
    id: "qwen2.5-0.5b",
    label: "Qwen 2.5 0.5B (rápido)",
    description:
      "Respostas curtas em português com pouca RAM. Ideal para o fallback quando nenhum provedor está conectado.",
    fileName: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
    approxBytes: 397_000_000,
    repo: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
  },
  {
    id: "qwen2.5-1.5b",
    label: "Qwen 2.5 1.5B (equilibrado)",
    description: "Melhor qualidade de texto, ainda cabe em máquinas com 8 GB de RAM.",
    fileName: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    approxBytes: 1_100_000_000,
    repo: "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
  },
];

export interface LocalAiOptions {
  dir: string;
  port?: number;
  onProgress?: (progress: LocalAiProgress) => void;
}

interface LocalAiState {
  modelId: string;
  binaryPath: string | null;
  modelPath: string | null;
  version: string | null;
}

const GITHUB_RELEASE =
  "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest";

/**
 * Instalador e supervisor da IA local (llama.cpp + GGUF).
 *
 * Tudo fica em um diretório do usuário, sem administrador. O download é
 * verificado por SHA-256 quando o fornecedor publica o hash, e o servidor
 * sobe em 127.0.0.1 com uma janela de contexto pequena para responder rápido.
 */
export class LocalAiService {
  readonly dir: string;
  readonly port: number;

  private state: LocalAiState;
  private child: ReturnType<typeof spawn> | null = null;
  private progress: LocalAiProgress | null = null;
  private error: string | null = null;
  private installing = false;
  private logs: string[] = [];

  constructor(private readonly options: LocalAiOptions) {
    this.dir = options.dir;
    this.port = options.port ?? LOCAL_AI_DEFAULT_PORT;
    mkdirSync(this.dir, { recursive: true });
    this.state = this.readState();
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}/v1`;
  }

  models(): LocalAiModel[] {
    return LOCAL_AI_MODELS.map(({ repo: _repo, ...model }) => model);
  }

  async status(): Promise<LocalAiStatus> {
    const alive = this.child !== null && this.child.exitCode === null;
    if (this.child && !alive) {
      this.child = null;
    }
    const healthy = alive ? await this.healthy() : false;

    return {
      installed: this.installed(),
      running: healthy,
      installing: this.installing,
      modelId: this.state.modelId,
      modelPath: this.state.modelPath,
      binaryPath: this.state.binaryPath,
      port: this.port,
      version: this.state.version,
      dir: this.dir,
      progress: this.progress,
      error: this.error,
    };
  }

  installed(): boolean {
    return Boolean(
      this.state.binaryPath &&
        existsSync(this.state.binaryPath) &&
        this.state.modelPath &&
        existsSync(this.state.modelPath),
    );
  }

  async install(modelId?: string): Promise<LocalAiStatus> {
    if (this.installing) throw new Error("A instalação da IA local já está em andamento.");
    const model =
      LOCAL_AI_MODELS.find((entry) => entry.id === (modelId ?? this.state.modelId)) ??
      LOCAL_AI_MODELS[0];
    if (!model) throw new Error("Modelo local desconhecido.");

    this.installing = true;
    this.error = null;
    try {
      const runtimeDir = join(this.dir, "runtime");
      if (!(this.state.binaryPath && existsSync(this.state.binaryPath))) {
        await this.installBinary(runtimeDir);
      }

      const modelDir = join(this.dir, "models");
      mkdirSync(modelDir, { recursive: true });
      const modelPath = join(modelDir, model.fileName);
      if (!existsSync(modelPath)) {
        await this.installModel(model, modelPath);
      }

      this.state = {
        ...this.state,
        modelId: model.id,
        modelPath,
      };
      this.writeState();
      this.progress = {
        stage: "ready",
        message: "IA local instalada e pronta para iniciar.",
        percent: 100,
      };
      this.emit();
      return await this.status();
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : String(cause);
      this.progress = { stage: "error", message: this.error, percent: null };
      this.emit();
      throw cause;
    } finally {
      this.installing = false;
    }
  }

  async start(): Promise<LocalAiStatus> {
    if (await this.healthy()) return this.status();
    if (!this.installed()) throw new Error("A IA local ainda não foi instalada.");

    this.error = null;
    this.progress = { stage: "starting", message: "Iniciando o llama-server…", percent: null };
    this.emit();

    const binary = this.state.binaryPath as string;
    const model = this.state.modelPath as string;
    const threads = Math.max(2, Math.min(6, cpus().length - 2));
    const args = [
      "-m",
      model,
      "--host",
      "127.0.0.1",
      "--port",
      String(this.port),
      "-c",
      "2048",
      "-t",
      String(threads),
      "--no-warmup",
    ];

    this.logs = [];
    const child = spawn(binary, args, {
      cwd: join(this.dir, "runtime"),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;

    const capture = (chunk: Buffer): void => {
      const text = chunk.toString("utf8");
      this.logs = [...this.logs, ...text.split(/\r?\n/)].slice(-80);
    };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    child.on("exit", (code) => {
      this.logs = [...this.logs, `processo encerrado com código ${code ?? "?"}`].slice(-80);
    });

    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        const detail = this.logs.slice(-6).join(" | ");
        throw new Error(`O llama-server encerrou durante a inicialização. ${detail}`);
      }
      if (await this.healthy()) {
        this.progress = {
          stage: "ready",
          message: "IA local em execução.",
          percent: 100,
        };
        this.emit();
        return this.status();
      }
      await delay(600);
    }

    child.kill();
    this.child = null;
    throw new Error(
      `O llama-server não respondeu em 90 segundos. ${this.logs.slice(-6).join(" | ")}`,
    );
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child) return;
    child.kill();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 4000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.progress = { stage: "idle", message: "IA local parada.", percent: null };
    this.emit();
  }

  /** Sobe o servidor se necessário; devolve `false` quando não está instalado. */
  async ensureRunning(): Promise<boolean> {
    if (await this.healthy()) return true;
    if (!this.installed()) return false;
    try {
      await this.start();
      return true;
    } catch {
      return false;
    }
  }

  async healthy(): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${this.port}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Instalação                                                        */
  /* ---------------------------------------------------------------- */

  private async installBinary(runtimeDir: string): Promise<void> {
    this.progress = {
      stage: "download-binary",
      message: "Consultando a versão mais recente do llama.cpp…",
      percent: null,
    };
    this.emit();

    const response = await fetch(GITHUB_RELEASE, {
      headers: { "user-agent": "YAMI/0.1", accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Não foi possível consultar o GitHub (HTTP ${response.status}).`);
    }
    const release = (await response.json()) as {
      tag_name?: string;
      assets?: Array<{ name?: string; browser_download_url?: string; digest?: string }>;
    };
    const assets = release.assets ?? [];
    const asset =
      assets.find((item) => /bin-win-cpu-x64\.zip$/i.test(item.name ?? "")) ??
      assets.find((item) => /win.*cpu.*x64.*\.zip$/i.test(item.name ?? ""));

    if (!asset?.browser_download_url) {
      throw new Error("O release do llama.cpp não trouxe um pacote win-cpu-x64.");
    }

    const zipPath = join(this.dir, "llama-runtime.zip");
    await this.download(
      asset.browser_download_url,
      zipPath,
      "download-binary",
      "Baixando o runtime do llama.cpp",
      asset.digest?.startsWith("sha256:") ? asset.digest.slice(7) : null,
    );

    this.progress = {
      stage: "extract-binary",
      message: "Extraindo o runtime…",
      percent: null,
    };
    this.emit();

    rmSync(runtimeDir, { recursive: true, force: true });
    mkdirSync(runtimeDir, { recursive: true });
    await runPowerShell(
      `Expand-Archive -LiteralPath '${escapeSingle(zipPath)}' -DestinationPath '${escapeSingle(runtimeDir)}' -Force`,
    );
    rmSync(zipPath, { force: true });

    const binary = findFile(runtimeDir, "llama-server.exe", 4);
    if (!binary) throw new Error("llama-server.exe não foi encontrado no pacote baixado.");

    this.state = {
      ...this.state,
      binaryPath: binary,
      version: release.tag_name ?? null,
    };
    this.writeState();
  }

  private async installModel(model: ModelDefinition, modelPath: string): Promise<void> {
    this.progress = {
      stage: "download-model",
      message: `Consultando o modelo ${model.label}…`,
      percent: null,
    };
    this.emit();

    const treeUrl = `https://huggingface.co/api/models/${model.repo}/tree/main`;
    let sha256: string | null = null;
    try {
      const response = await fetch(treeUrl, { signal: AbortSignal.timeout(30_000) });
      if (response.ok) {
        const entries = (await response.json()) as Array<{
          path?: string;
          lfs?: { oid?: string };
        }>;
        const entry = entries.find((item) => item.path === model.fileName);
        const oid = entry?.lfs?.oid;
        if (typeof oid === "string" && /^[a-f0-9]{64}$/i.test(oid)) sha256 = oid.toLowerCase();
      }
    } catch {
      // Sem hash publicado: baixa e registra o hash calculado localmente.
    }

    const url = `https://huggingface.co/${model.repo}/resolve/main/${encodeURIComponent(model.fileName)}?download=true`;
    await this.download(
      url,
      modelPath,
      "download-model",
      `Baixando ${model.label}`,
      sha256,
    );
  }

  private async download(
    url: string,
    destination: string,
    stage: LocalAiProgress["stage"],
    label: string,
    expectedSha256: string | null,
  ): Promise<void> {
    const temporary = `${destination}.part`;
    const response = await fetch(url, {
      headers: { "user-agent": "YAMI/0.1" },
      signal: AbortSignal.timeout(30 * 60_000),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Falha no download (HTTP ${response.status}) de ${url}`);
    }

    const total = Number(response.headers.get("content-length") ?? 0) || null;
    const handle = openSync(temporary, "w");
    let received = 0;
    let lastEmit = 0;

    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        writeSync(handle, chunk);
        received += chunk.length;
        const now = Date.now();
        if (now - lastEmit > 400) {
          lastEmit = now;
          const percent = total ? Math.min(99, Math.round((received / total) * 100)) : null;
          this.progress = {
            stage,
            message: `${label} — ${formatBytes(received)}${total ? ` de ${formatBytes(total)}` : ""}`,
            percent,
          };
          this.emit();
        }
      }
    } finally {
      closeSync(handle);
    }

    if (total && received < total) {
      rmSync(temporary, { force: true });
      throw new Error(`Download incompleto (${received} de ${total} bytes).`);
    }

    this.progress = {
      stage: "verify",
      message: "Verificando a integridade do arquivo…",
      percent: null,
    };
    this.emit();

    const actual = await sha256File(temporary);
    if (expectedSha256 && actual !== expectedSha256) {
      rmSync(temporary, { force: true });
      throw new Error("O SHA-256 do download não confere. O arquivo foi descartado.");
    }

    rmSync(destination, { force: true });
    renameSyncSafe(temporary, destination);
  }

  /* ---------------------------------------------------------------- */
  /* Estado                                                            */
  /* ---------------------------------------------------------------- */

  private stateFile(): string {
    return join(this.dir, "state.json");
  }

  private readState(): LocalAiState {
    const fallback: LocalAiState = {
      modelId: LOCAL_AI_MODELS[0]?.id ?? "qwen2.5-0.5b",
      binaryPath: null,
      modelPath: null,
      version: null,
    };
    try {
      const parsed = JSON.parse(readFileSync(this.stateFile(), "utf8")) as Partial<LocalAiState>;
      return {
        modelId: typeof parsed.modelId === "string" ? parsed.modelId : fallback.modelId,
        binaryPath: typeof parsed.binaryPath === "string" ? parsed.binaryPath : null,
        modelPath: typeof parsed.modelPath === "string" ? parsed.modelPath : null,
        version: typeof parsed.version === "string" ? parsed.version : null,
      };
    } catch {
      return fallback;
    }
  }

  private writeState(): void {
    writeFileSync(this.stateFile(), JSON.stringify(this.state, null, 2), "utf8");
  }

  private emit(): void {
    if (this.progress) this.options.onProgress?.({ ...this.progress });
  }
}

/* ------------------------------------------------------------------ */
/* Auxiliares                                                          */
/* ------------------------------------------------------------------ */

function findFile(dir: string, name: string, depth: number): string | null {
  if (depth < 0) return null;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let info;
    try {
      info = statSync(full);
    } catch {
      continue;
    }
    if (info.isFile() && entry.toLowerCase() === name.toLowerCase()) return full;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    try {
      if (!statSync(full).isDirectory()) continue;
    } catch {
      continue;
    }
    const found = findFile(full, name, depth - 1);
    if (found) return found;
  }
  return null;
}

function runPowerShell(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true },
    );
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-2000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Falha ao extrair o pacote (código ${code}). ${stderr}`));
    });
  });
}

function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function renameSyncSafe(from: string, to: string): void {
  rmSync(to, { force: true });
  renameSync(from, to);
}

function escapeSingle(value: string): string {
  return value.replace(/'/g, "''");
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
