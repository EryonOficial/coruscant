// Instala (ou remove) os hooks do Habblaud no Cursor. Roda no HOST, com tsx:
//
//   npm run cursor:install     # acrescenta os handlers em <CURSOR_HOME>/hooks.json (backup antes)
//   npm run cursor:uninstall   # tira só os handlers do Habblaud (os outros ficam)
//   npm run cursor:status      # mostra se os hooks estão lá e se o Habblaud está respondendo
//   (opções: --dry-run, --conta <id>, --port <n>)
//
// Schema Cursor: { version: 1, hooks: { <event>: [{ command, timeout? }] } }.
// Porta em ~/.habblaud/cursor-hook.json. Sem PermissionRequest (MVP só observa).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverCursorDirs } from '../server/sources/cursor/accounts';
import { quotePath, readSettings, tildify, writeSettings, type Settings } from './statusline-install';
import { tr } from '../shared/i18n';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const HOOK_SCRIPT = join(ROOT, 'mod', 'habblaud-cursor', 'hook.mjs');
const HOOK_MARK = /habblaud-cursor[\\/]+hook\.mjs/;
export const DEFAULT_PORT = 4747;
export const OBSERVE_TIMEOUT_S = 5;
export const SESSION_END_TIMEOUT_S = 1;
export const EVENTS = [
  'sessionStart',
  'sessionEnd',
  'beforeSubmitPrompt',
  'preToolUse',
  'postToolUse',
  'postToolUseFailure',
  'beforeShellExecution',
  'afterShellExecution',
  'beforeMCPExecution',
  'afterMCPExecution',
  'afterFileEdit',
  'subagentStart',
  'subagentStop',
  'stop',
  'afterAgentResponse',
  'afterAgentThought',
] as const;
export const CONFIG_NAME = 'cursor-hook.json';
export const MIN_NODE_MAJOR = 22;

const USAGE = tr(
  'Uso: npm run cursor:<install|uninstall|status> [-- opções]\n\n  install     acrescenta os hooks do Habblaud no hooks.json de cada pasta do Cursor (faz backup antes)\n  uninstall   tira os hooks do Habblaud de cada pasta (os outros hooks ficam)\n  status      mostra se os hooks estão lá e se o Habblaud está respondendo\n\nOpções:\n  --dry-run        mostra o que mudaria, sem gravar nada\n  --conta <id>     só a pasta desta conta (o nome da pasta, ex.: .cursor)\n  --port <n>       porta do Habblaud (padrão: HABBLAUD_PORT ou {0})\n  -h, --help       mostra esta ajuda\n\nPastas: HABBLAUD_CURSOR_DIRS (lista separada por vírgula) ou CURSOR_HOME e as pastas ~/.cursor*.',
  [DEFAULT_PORT],
);

type Rec = Record<string, unknown>;

function rec(v: unknown): Rec | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : undefined;
}

export function hookCommand(scriptPath: string, nodeBin?: string): string {
  return `${nodeBin ? quotePath(nodeBin) : 'node'} ${quotePath(scriptPath)}`;
}

export function handlerFor(event: string, command: string): Rec {
  const timeout = event === 'sessionEnd' ? SESSION_END_TIMEOUT_S : OBSERVE_TIMEOUT_S;
  return { command, timeout };
}

export function isOurHandler(h: unknown): boolean {
  const r = rec(h);
  return !!r && typeof r.command === 'string' && HOOK_MARK.test(r.command);
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const r = rec(v);
  if (!r) return JSON.stringify(v) ?? 'null';
  return `{${Object.keys(r)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(r[k])}`)
    .join(',')}}`;
}

export function scriptPathOf(command: string): string | undefined {
  const m = /("[^"]*habblaud-cursor[\\/]+hook\.mjs"|'(?:[^']|'\\'')*habblaud-cursor[\\/]+hook\.mjs'|\S*habblaud-cursor[\\/]+hook\.mjs)/.exec(command);
  if (!m) return undefined;
  const q = m[1];
  if (q.startsWith('"')) return q.slice(1, -1);
  if (q.startsWith("'")) return q.slice(1, -1).replace(/'\\''/g, "'");
  return q;
}

export type PlanAction =
  | { action: 'install'; file: Settings; message: string }
  | { action: 'uninstall'; file: Settings; message: string }
  | { action: 'none'; message: string }
  | { action: 'skip'; message: string };

function hooksOf(file: Settings): Rec | string {
  if (file.hooks !== undefined && !rec(file.hooks)) return tr('"hooks" em formato desconhecido; nada foi alterado');
  const hooks = rec(file.hooks) ?? {};
  for (const [event, list] of Object.entries(hooks)) {
    if (!Array.isArray(list)) return tr('"hooks.{0}" em formato desconhecido; nada foi alterado', [event]);
  }
  return hooks;
}

function ourIndexes(list: unknown[]): number[] {
  const out: number[] = [];
  list.forEach((h, i) => isOurHandler(h) && out.push(i));
  return out;
}

/** Plano de instalação para hooks.json do Cursor (arrays flat de handlers). */
export function planInstall(file: Settings, command: string): PlanAction {
  const parsed = hooksOf(file);
  if (typeof parsed === 'string') return { action: 'skip', message: parsed };
  const hooks: Rec = { ...parsed };
  const added: string[] = [];
  const updated: string[] = [];
  for (const event of EVENTS) {
    const handler = handlerFor(event, command);
    let list = [...((hooks[event] as unknown[] | undefined) ?? [])];
    const found = ourIndexes(list);
    if (!found.length) {
      list.push(handler);
      added.push(event);
    } else {
      let changed = false;
      if (canonical(list[found[0]]) !== canonical(handler)) {
        list[found[0]] = handler;
        changed = true;
      }
      if (found.length > 1) {
        const drop = new Set(found.slice(1));
        list = list.filter((_, i) => !drop.has(i));
        changed = true;
      }
      if (changed) updated.push(event);
    }
    hooks[event] = list;
  }
  if (!added.length && !updated.length) return { action: 'none', message: tr('já instalado') };
  const parts = [
    added.length ? (updated.length ? tr('instalado em {0}', [added.join(', ')]) : tr('instalado ({0} eventos)', [added.length])) : '',
    updated.length ? tr('atualizado em {0}', [updated.join(', ')]) : '',
  ].filter(Boolean);
  const next: Settings = { version: typeof file.version === 'number' ? file.version : 1, ...file, hooks };
  return { action: 'install', file: next, message: parts.join('; ') };
}

export function planUninstall(file: Settings): PlanAction {
  const parsed = hooksOf(file);
  if (typeof parsed === 'string') return { action: 'skip', message: parsed };
  const hooks: Rec = { ...parsed };
  let removed = 0;
  for (const [event, raw] of Object.entries(hooks)) {
    const list = raw as unknown[];
    const found = ourIndexes(list);
    if (!found.length) continue;
    const drop = new Set(found);
    const next = list.filter((_, i) => !drop.has(i));
    removed += found.length;
    if (next.length) hooks[event] = next;
    else delete hooks[event];
  }
  if (!removed) return { action: 'none', message: tr('não estava instalado') };
  const next: Settings = { ...file };
  if (Object.keys(hooks).length) next.hooks = hooks;
  else delete next.hooks;
  return { action: 'uninstall', file: next, message: tr('hooks do Habblaud removidos') };
}

export interface InstallState {
  ok: string[];
  outdated: string[];
  missing: string[];
  paths: string[];
}

export function installState(file: Settings, command: string): InstallState {
  const parsed = hooksOf(file);
  const hooks = typeof parsed === 'string' ? {} : parsed;
  const state: InstallState = { ok: [], outdated: [], missing: [], paths: [] };
  for (const event of EVENTS) {
    const list = (hooks[event] as unknown[] | undefined) ?? [];
    const found = ourIndexes(list);
    if (!found.length) {
      state.missing.push(event);
      continue;
    }
    const h = rec(list[found[0]])!;
    const path = typeof h.command === 'string' ? scriptPathOf(h.command) : undefined;
    if (path && !state.paths.includes(path)) state.paths.push(path);
    (canonical(h) === canonical(handlerFor(event, command)) && found.length === 1 ? state.ok : state.outdated).push(event);
  }
  return state;
}

export interface RunOptions {
  command: 'install' | 'uninstall' | 'status';
  dryRun: boolean;
  account?: string;
  port: number;
}

export interface Health {
  cursorEvents?: boolean;
}

export interface RunContext {
  env: NodeJS.ProcessEnv;
  home: string;
  now: Date;
  hookPath: string;
  out: (line: string) => void;
  health?: (port: number) => Promise<Health | undefined>;
}

class FatalError extends Error {}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): RunOptions | 'help' {
  let command: RunOptions['command'] | undefined;
  let dryRun = false;
  let account: string | undefined;
  const envPort = Number.parseInt(env.HABBLAUD_PORT ?? '', 10);
  let port = Number.isInteger(envPort) && envPort > 0 && envPort < 65_536 ? envPort : DEFAULT_PORT;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') return 'help';
    if (a === '--dry-run') dryRun = true;
    else if (a === '--conta') {
      account = argv[++i];
      if (!account) throw new FatalError(tr('--conta precisa do nome da pasta da conta (ex.: .cursor).'));
    } else if (a === '--port') {
      port = Number(argv[++i]);
      if (!Number.isInteger(port) || port <= 0 || port >= 65_536) throw new FatalError(tr('--port precisa de um número entre 1 e 65535.'));
    } else if ((a === 'install' || a === 'uninstall' || a === 'status') && !command) command = a;
    else throw new FatalError(tr('opção desconhecida: {0}\n\n{1}', [a, USAGE]));
  }
  if (!command) throw new FatalError(tr('diga o que fazer: install, uninstall ou status.\n\n{0}', [USAGE]));
  return { command, dryRun, account, port };
}

export function configPath(home: string): string {
  return join(home, '.habblaud', CONFIG_NAME);
}

export function readHookConfig(home: string): { port?: number; hookToken?: string } | undefined {
  try {
    const j = rec(JSON.parse(readFileSync(configPath(home), 'utf8')));
    if (!j) return undefined;
    return {
      ...(typeof j.port === 'number' ? { port: j.port } : {}),
      ...(typeof j.hookToken === 'string' && j.hookToken.trim() ? { hookToken: j.hookToken.trim() } : {}),
    };
  } catch {
    return undefined;
  }
}

function writeHookConfig(home: string, port: number, hookToken?: string): boolean {
  const cur = readHookConfig(home);
  const nextToken = hookToken?.trim() || undefined;
  if (cur?.port === port && (cur.hookToken || undefined) === nextToken) return false;
  mkdirSync(join(home, '.habblaud'), { recursive: true });
  const body: { port: number; hookToken?: string } = { port };
  if (nextToken) body.hookToken = nextToken;
  writeFileSync(configPath(home), `${JSON.stringify(body, null, 2)}\n`, { mode: 0o644 });
  return true;
}

async function fetchHealth(port: number): Promise<Health | undefined> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1_500) });
    if (!res.ok) return undefined;
    return (await res.json()) as Health;
  } catch {
    return undefined;
  }
}

export async function run(opts: RunOptions, ctx: RunContext): Promise<number> {
  const { env, home, out } = ctx;
  const found = discoverCursorDirs(env, home);
  const dirs = opts.account ? found.filter((d) => basename(d) === opts.account) : found;
  if (!dirs.length) {
    out(
      opts.account
        ? tr('Nenhuma pasta do Cursor com o nome {0} (pastas encontradas: {1}).', [opts.account, found.map((d) => basename(d)).join(', ') || tr('nenhuma')])
        : tr('Nenhuma pasta do Cursor encontrada (~/.cursor ou CURSOR_HOME). Use HABBLAUD_CURSOR_DIRS se ela estiver em outro lugar.'),
    );
    return 1;
  }
  const command = hookCommand(ctx.hookPath);
  let failures = 0;
  let changed = 0;
  for (const dir of dirs) {
    const file = join(dir, 'hooks.json');
    const label = `${basename(dir)} (${tildify(file, home)})`;
    const read = readSettings(file);
    if ('error' in read) {
      out(`✗ ${label}: ${read.error}`);
      failures++;
      continue;
    }
    if (opts.command === 'status') {
      const st = installState(read.settings, command);
      if (!st.ok.length && !st.outdated.length) {
        out(tr('• {0}: não instalado', [label]));
        continue;
      }
      for (const p of st.paths) {
        if (resolve(p) === resolve(ctx.hookPath)) continue;
        const gone = !existsSync(p) ? tr(' (esse arquivo não existe mais: os hooks falham e nada chega ao escritório)') : '';
        out(tr('! {0}: os hooks apontam para {1}{2}; rode npm run cursor:install para atualizar', [label, p, gone]));
      }
      if (st.outdated.length) out(tr('! {0}: diferente do esperado em {1}; rode npm run cursor:install para atualizar', [label, st.outdated.join(', ')]));
      if (st.missing.length) out(tr('! {0}: faltando em {1}; rode npm run cursor:install', [label, st.missing.join(', ')]));
      out(tr('• {0}: instalado em {1} de {2} eventos', [label, st.ok.length + st.outdated.length, EVENTS.length]));
      continue;
    }
    const plan = opts.command === 'install' ? planInstall(read.settings, command) : planUninstall(read.settings);
    if (plan.action === 'none') {
      out(`= ${label}: ${plan.message}`);
      continue;
    }
    if (plan.action === 'skip') {
      out(`✗ ${label}: ${plan.message}`);
      failures++;
      continue;
    }
    if (opts.dryRun) {
      out(`~ ${label}: ${plan.message} (--dry-run)`);
      continue;
    }
    try {
      const backup = writeSettings(file, plan.file, read.raw, ctx.now);
      out(`✓ ${label}: ${plan.message}${backup ? tr(' · backup em {0}', [tildify(backup, home)]) : ''}`);
      changed++;
    } catch (err) {
      out(tr('✗ {0}: não consegui gravar ({1})', [label, (err as Error).message]));
      failures++;
    }
  }
  if (opts.command === 'install' && !opts.dryRun) {
    if (writeHookConfig(home, opts.port, env.HABBLAUD_HOOK_TOKEN)) out(tr('✓ configuração do hook: porta {0} ({1})', [opts.port, tildify(configPath(home), home)]));
  }
  if (opts.command === 'status' || (opts.command === 'install' && changed > 0 && !opts.dryRun)) {
    const health = await (ctx.health ?? fetchHealth)(opts.port);
    if (!health) out(tr('! Habblaud não respondeu em http://127.0.0.1:{0}/api/health — suba o servidor (npm start).', [opts.port]));
    else if (!health.cursorEvents) out(tr('! Habblaud respondeu, mas cursorEvents=false (HABBLAUD_CURSOR=0 ou nenhuma pasta do Cursor).'));
    else out(tr('✓ Habblaud em :{0} aceita eventos do Cursor', [opts.port]));
  }
  if (opts.command === 'install' && changed > 0 && !opts.dryRun) {
    out(tr('i Reinicie o Cursor (ou confira Settings › Hooks) para carregar os hooks novos.'));
  }
  return failures ? 1 : 0;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  let opts: RunOptions | 'help';
  try {
    opts = parseArgs(argv);
  } catch (err) {
    if (err instanceof FatalError) {
      console.error(err.message);
      return 2;
    }
    throw err;
  }
  if (opts === 'help') {
    console.log(USAGE);
    return 0;
  }
  return run(opts, {
    env: process.env,
    home: process.env.HOME || homedir(),
    now: new Date(),
    hookPath: HOOK_SCRIPT,
    out: (line) => console.log(line),
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().then((code) => process.exit(code));
