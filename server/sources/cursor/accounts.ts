// Contas do Cursor: uma pasta ~/.cursor (ou CURSOR_HOME / HABBLAUD_CURSOR_DIRS) por conta. Node puro e sem
// dependências do servidor: também é importado por scripts/cursor-install.ts (via tsx) no host.
//
// Descoberta: HABBLAUD_CURSOR_DIRS (lista separada por vírgula) substitui tudo; senão CURSOR_HOME e `$HOME/.cursor*`
// que tenham cara de pasta do Cursor (isCursorHome). Letra: "R" (cursoR) por padrão. Nome: "Cursor".
// Privacidade: não lê credenciais nem mcp.json.
import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import {
  ACCOUNT_COLORS,
  accountIds,
  expandHome,
  parseAccountOverrides,
  type AccountOverride,
  type DetectedAccount,
} from '../../accounts/detect';

function splitList(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Pasta do Cursor: tem `projects/` (transcripts) ou `hooks.json` / `ide_state.json`. */
export function isCursorHome(p: string): boolean {
  if (!isDir(p)) return false;
  if (isDir(join(p, 'projects'))) return true;
  return isFile(join(p, 'hooks.json')) || isFile(join(p, 'ide_state.json')) || basename(p).startsWith('.cursor');
}

/** Pasta padrão do Cursor: CURSOR_HOME ou $HOME/.cursor. */
export function defaultCursorHome(env: NodeJS.ProcessEnv, home: string): string {
  const raw = env.CURSOR_HOME?.trim();
  return raw ? expandHome(raw, home) : join(home, '.cursor');
}

/**
 * Pastas do Cursor observadas. HABBLAUD_CURSOR_DIRS substitui a detecção. Senão: CURSOR_HOME e `$HOME/.cursor*`.
 * Ordem estável: a padrão primeiro, depois alfabética.
 */
export function discoverCursorDirs(env: NodeJS.ProcessEnv = process.env, home: string = env.HOME || homedir()): string[] {
  const override = splitList(env.HABBLAUD_CURSOR_DIRS);
  if (override.length) return [...new Set(override.map((p) => expandHome(p, home)))].filter(isDir);
  const found: string[] = [];
  const main = defaultCursorHome(env, home);
  if (isCursorHome(main) || isDir(main)) found.push(main);
  try {
    for (const ent of readdirSync(home, { withFileTypes: true })) {
      if (!ent.name.startsWith('.cursor')) continue;
      if (!ent.isDirectory() && !ent.isSymbolicLink()) continue;
      const p = join(home, ent.name);
      if (isCursorHome(p) || isDir(p)) found.push(p);
    }
  } catch {
    // $HOME ilegível
  }
  const dirs = [...new Set(found.map((p) => expandHome(p, home)))];
  dirs.sort((a, b) => (a === main ? 0 : 1) - (b === main ? 0 : 1) || a.localeCompare(b));
  return dirs;
}

/** Overrides das contas do Cursor em HABBLAUD_ACCOUNTS. */
export function cursorOverrides(raw: string | undefined): AccountOverride[] {
  return parseAccountOverrides(raw).filter((o) => o.provider === 'cursor');
}

function matchOverride(overrides: AccountOverride[], id: string, dir: string, home: string): AccountOverride | undefined {
  const norm = (p: unknown) => (typeof p === 'string' && p.trim() ? expandHome(p, home) : undefined);
  return overrides.find((o) => norm(o.mountDir) === dir) ?? overrides.find((o) => norm(o.configDir) === dir) ?? overrides.find((o) => o.id === id);
}

function letterCandidates(dir: string): string[] {
  const suffix = /^\.?cursor[-_.]+([A-Za-z])/i.exec(basename(dir))?.[1]?.toUpperCase();
  const out = suffix ? [suffix] : [];
  out.push('R', 'U', 'S', 'T', 'V', 'W');
  for (let i = 0; i < 26; i++) out.push(String.fromCharCode(65 + i));
  return out;
}

export interface CursorDetectOptions {
  home?: string;
  env?: NodeJS.ProcessEnv;
  /** Letras e cores já usadas pelas outras contas. */
  taken?: { shorts?: Iterable<string>; colors?: Iterable<string> };
}

/** Uma conta por pasta do Cursor, na mesma ordem de `dirs`. */
export function detectCursorAccounts(dirs: string[], opts: CursorDetectOptions = {}): DetectedAccount[] {
  const env = opts.env ?? process.env;
  const home = opts.home ?? (env.HOME || homedir());
  const overrides = cursorOverrides(env.HABBLAUD_ACCOUNTS);
  const ids = accountIds(dirs);
  const usedShorts = new Set([...(opts.taken?.shorts ?? [])].map((s) => s.toUpperCase()));
  const usedColors = new Set(opts.taken?.colors ?? []);

  return dirs.map((dir, i) => {
    const ov = matchOverride(overrides, ids[i], resolve(dir), home);
    let short = str(ov?.short)?.slice(0, 3);
    if (!short || usedShorts.has(short.toUpperCase())) {
      short = letterCandidates(dir).find((l) => !usedShorts.has(l)) ?? 'R';
    }
    usedShorts.add(short.toUpperCase());
    let color = str(ov?.color);
    if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      color = ACCOUNT_COLORS.find((c) => !usedColors.has(c)) ?? ACCOUNT_COLORS[usedColors.size % ACCOUNT_COLORS.length];
      usedColors.add(color);
    }
    const acc: DetectedAccount = {
      id: str(ov?.id) ?? ids[i],
      provider: 'cursor',
      configDir: str(ov?.configDir) ?? dir,
      short,
      name: str(ov?.name) ?? (dirs.length > 1 ? `Cursor ${short}` : 'Cursor'),
      color,
    };
    const plan = str(ov?.plan);
    if (plan) acc.plan = plan;
    return acc;
  });
}
