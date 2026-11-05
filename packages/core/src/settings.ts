import type { DatabaseSync } from "node:sqlite";
import { AppSettingsSchema, type AppSettings } from "@yami/contracts";

export function defaultSettings(workspaceRoot: string): AppSettings {
  return {
    workspaceRoot,
    voiceUrl: "http://127.0.0.1:3900",
    voiceProfileId: null,
    autoSpeak: false,
    wakeWords: ["yami", "jarvis"],
    maxToolSteps: 6,
    autoApproveRead: true,
    defaultProviderId: null,
    localAiEnabled: true,
    fallbackToLocal: true,
    localAiModel: "qwen2.5-0.5b",
  };
}

export class SettingsService {
  private readonly defaults: AppSettings;

  constructor(
    private readonly db: DatabaseSync,
    workspaceRoot: string,
  ) {
    this.defaults = defaultSettings(workspaceRoot);
    this.ensureDefaults();
  }

  get(): AppSettings {
    const stored = this.readAll();
    const merged = { ...this.defaults, ...stored };
    return AppSettingsSchema.parse(merged);
  }

  update(input: Partial<AppSettings>): AppSettings {
    const next = AppSettingsSchema.parse({ ...this.get(), ...input });
    const statement = this.db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
    for (const [key, value] of Object.entries(next)) {
      statement.run(key, JSON.stringify(value));
    }
    return next;
  }

  private readAll(): Partial<AppSettings> {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as Array<{
      key: string;
      value: string;
    }>;
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value) as unknown;
      } catch {
        // valor corrompido: mantém o padrão
      }
    }
    return result as Partial<AppSettings>;
  }

  private ensureDefaults(): void {
    const count = this.db.prepare("SELECT COUNT(*) AS total FROM settings").get() as {
      total: number;
    };
    if (count.total === 0) this.update({});
  }
}
