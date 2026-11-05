import { createContext, useContext } from "react";
import type { Agent, AppSettings, YamiBridge } from "@yami/contracts";

export type Section =
  | "overview"
  | "chat"
  | "agents"
  | "providers"
  | "localai"
  | "tools"
  | "mcp"
  | "memory"
  | "voice"
  | "activity"
  | "settings";

export type NoticeKind = "info" | "ok" | "error";

export interface YamiContextValue {
  bridge: YamiBridge | null;
  settings: AppSettings | null;
  agents: Agent[];
  refreshSettings: () => Promise<void>;
  refreshAgents: () => Promise<void>;
  notify: (text: string, kind?: NoticeKind) => void;
  go: (section: Section) => void;
}

export const YamiContext = createContext<YamiContextValue | null>(null);

export function useYami(): YamiContextValue {
  const value = useContext(YamiContext);
  if (!value) throw new Error("useYami deve ser usado dentro de <YamiContext.Provider>.");
  return value;
}

/** Remove o prefixo técnico que o Electron adiciona às mensagens de IPC. */
export function errorText(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}
