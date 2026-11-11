// Carrega o `.env` da pasta do projeto em `process.env` (sem dependências).
// Só preenche chaves AUSENTES: o ambiente do shell / Docker / serviço vale mais.
// Formato: KEY=valor, `#` comentário, aspas simples/duplas, `export KEY=...`.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRoot } from './config';

/** Uma atribuição `KEY=valor` (sem `export`); undefined = linha vazia/comentário/inválida. */
export function parseDotEnvLine(line: string): { key: string; value: string } | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return undefined;
  const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
  if (!m) return undefined;
  let value = m[2].trim();
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    value = value.slice(1, -1);
  } else {
    // Comentário inline só sem aspas: FOO=bar # nota
    const hash = value.search(/\s+#/);
    if (hash >= 0) value = value.slice(0, hash).trimEnd();
  }
  return { key: m[1], value };
}

/** Pares KEY→valor de um texto `.env` (última ocorrência de uma chave ganha). */
export function parseDotEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseDotEnvLine(line);
    if (parsed) out[parsed.key] = parsed.value;
  }
  return out;
}

/**
 * Aplica o arquivo ao `env` (padrão: process.env). Não sobrescreve chaves já definidas
 * (mesmo vazias: `HABBLAUD_PORT=` no ambiente bloqueia o .env). Devolve as chaves que entrou.
 */
export function applyDotEnvFile(file: string, env: NodeJS.ProcessEnv = process.env): string[] {
  if (!existsSync(file)) return [];
  let content: string;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const applied: string[] = [];
  for (const [key, value] of Object.entries(parseDotEnv(content))) {
    if (env[key] !== undefined) continue;
    env[key] = value;
    applied.push(key);
  }
  return applied;
}

/** Pasta do projeto + `.env`; `from` = de onde subir até achar o package.json. */
export function projectEnvPath(from = dirname(fileURLToPath(import.meta.url))): string {
  return join(findRoot(from), '.env');
}

/** Carrega `<raiz>/.env` no ambiente. Idempotente se chamado de novo com as chaves já definidas. */
export function loadProjectDotEnv(env: NodeJS.ProcessEnv = process.env, from?: string): string[] {
  return applyDotEnvFile(resolve(projectEnvPath(from)), env);
}
