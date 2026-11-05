import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";

/**
 * Cofre de credenciais.
 *
 * As chaves de API nunca são gravadas em texto puro: ficam cifradas com
 * AES-256-GCM e a chave mestra é um arquivo separado do banco, com permissão
 * restrita ao usuário. Isso evita que um backup do `yami.db` exponha segredos.
 */
export class SecretStore {
  private readonly key: Buffer;

  constructor(
    private readonly db: DatabaseSync,
    keyFile: string,
  ) {
    this.key = loadOrCreateKey(keyFile);
  }

  set(id: string, value: string): void {
    const trimmed = value.trim();
    if (!trimmed) {
      this.delete(id);
      return;
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(trimmed, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, tag, encrypted]).toString("base64");

    this.db
      .prepare(
        `INSERT INTO secrets (id, value, created_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET value = excluded.value, created_at = excluded.created_at`,
      )
      .run(id, payload, new Date().toISOString());
  }

  get(id: string): string | null {
    const row = this.db.prepare("SELECT value FROM secrets WHERE id = ?").get(id) as
      | { value: string }
      | undefined;
    if (!row) return null;

    try {
      const payload = Buffer.from(row.value, "base64");
      const iv = payload.subarray(0, 12);
      const tag = payload.subarray(12, 28);
      const encrypted = payload.subarray(28);
      const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    } catch {
      return null;
    }
  }

  has(id: string): boolean {
    const row = this.db.prepare("SELECT 1 AS ok FROM secrets WHERE id = ?").get(id) as
      | { ok: number }
      | undefined;
    return Boolean(row);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM secrets WHERE id = ?").run(id);
  }
}

function loadOrCreateKey(file: string): Buffer {
  if (existsSync(file)) {
    const stored = readFileSync(file, "utf8").trim();
    const decoded = Buffer.from(stored, "base64");
    if (decoded.length === 32) return decoded;
  }

  const key = randomBytes(32);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, key.toString("base64"), { encoding: "utf8", mode: 0o600 });
  return key;
}
