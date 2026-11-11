#!/usr/bin/env node
// Hook do Habblaud para o Cursor (Agent Chat): mostra no escritório o que as sessões fazem.
// `npm run cursor:install` acrescenta em ~/.cursor/hooks.json um handler que roda:
//
//   node "/caminho/do/habblaud/mod/habblaud-cursor/hook.mjs"
//
// Porta em ~/.habblaud/cursor-hook.json ({port}); HABBLAUD_PORT vale como reserva.
//
// Só observa: lê o JSON do stdin, manda para POST http://127.0.0.1:<porta>/api/cursor/events e sai com 0
// sem stdout (não devolve permission nem additional_context). Node puro (22+), só `node:*`.
// HABBLAUD_HOOK_DEBUG=1 escreve no stderr.
import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_PORT = 4747;
export const CONFIG_FILE = 'cursor-hook.json';

export const OBSERVED = new Set([
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
]);

const EVENT_TIMEOUT_MS = 1_500;
const SESSION_END_TIMEOUT_MS = 600;
const STDIN_TIMEOUT_MS = 5_000;
const MAX_STDIN = 8 * 1024 * 1024;
const MAX_STRING = 8_000;
const MAX_BODY = 200_000;

const debug = process.env.HABBLAUD_HOOK_DEBUG === '1' ? (msg) => process.stderr.write(`[habblaud-cursor] ${msg}\n`) : () => {};

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const validPort = (p) => Number.isInteger(p) && p > 0 && p < 65_536;

function expandHome(p, home) {
  const abs = resolve(p.trim().replace(/^~(?=[\\/]|$)/, home).replace(/\$\{HOME\}|\$HOME\b/g, home));
  return abs.length > 1 ? abs.replace(/[\\/]+$/, '') : abs;
}

export function readConfig(env = process.env) {
  const home = env.HOME || homedir();
  let file;
  try {
    file = JSON.parse(readFileSync(join(home, '.habblaud', CONFIG_FILE), 'utf8'));
  } catch {
    file = undefined;
  }
  const f = isObject(file) ? file : {};
  const filePort = Number(f.port);
  const envPort = Number.parseInt(env.HABBLAUD_PORT ?? '', 10);
  return {
    port: validPort(filePort) ? filePort : validPort(envPort) ? envPort : DEFAULT_PORT,
  };
}

/** Pasta do Cursor: CURSOR_HOME, senão a acima de projects/ no transcript_path, senão ~/.cursor. */
export function cursorHomeOf(env, input) {
  const home = env.HOME || homedir();
  const fromEnv = typeof env.CURSOR_HOME === 'string' ? env.CURSOR_HOME.trim() : '';
  if (fromEnv) return expandHome(fromEnv, home);
  const t = typeof input?.transcript_path === 'string' ? input.transcript_path : '';
  const m = /^(.+)[\\/]projects[\\/]/.exec(t);
  if (m && isAbsolute(m[1])) return expandHome(m[1], home);
  return join(home, '.cursor');
}

export function accountOf(cursorHome) {
  return basename(cursorHome) || cursorHome;
}

export function trimInput(v, max = MAX_STRING, depth = 0) {
  if (typeof v === 'string') return v.length > max ? v.slice(0, max) : v;
  if (depth > 8 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => trimInput(x, max, depth + 1));
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = trimInput(x, max, depth + 1);
  return out;
}

function fitted(v, size) {
  let out = v;
  for (const max of [MAX_STRING, 1_000, 200]) {
    out = trimInput(v, max);
    if (size(out) <= MAX_BODY) break;
  }
  return out;
}

export function eventBody(input, account, cursorHome) {
  const body = { account, cursorHome, event: input };
  body.event = fitted(input, (event) => JSON.stringify({ ...body, event }).length);
  return body;
}

function readStdin() {
  return new Promise((ok) => {
    const chunks = [];
    let size = 0;
    const finish = (text) => {
      clearTimeout(timer);
      ok(text);
    };
    const timer = setTimeout(() => finish(undefined), STDIN_TIMEOUT_MS);
    process.stdin.on('data', (c) => {
      size += c.length;
      if (size > MAX_STDIN) return finish(undefined);
      chunks.push(c);
    });
    process.stdin.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => finish(undefined));
  });
}

async function call(base, method, path, body, timeoutMs) {
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: res.status, json };
  } catch (err) {
    debug(`${method} ${path}: ${err?.name ?? 'erro'} ${err?.message ?? ''}`);
    return null;
  }
}

/** conversation_id (Cursor) ou session_id (compat). */
function conversationIdOf(input) {
  if (typeof input.conversation_id === 'string' && input.conversation_id) return input.conversation_id;
  if (typeof input.session_id === 'string' && input.session_id) return input.session_id;
  return undefined;
}

export async function run(env = process.env, stdinText) {
  try {
    const raw = stdinText ?? (await readStdin());
    if (!raw) return;
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isObject(input) || typeof input.hook_event_name !== 'string') return;
    const event = input.hook_event_name;
    if (!OBSERVED.has(event)) return;
    if (!conversationIdOf(input)) return;

    const cfg = readConfig(env);
    const cursorHome = cursorHomeOf(env, input);
    const account = accountOf(cursorHome);
    const base = `http://127.0.0.1:${cfg.port}`;
    const sent = await call(
      base,
      'POST',
      '/api/cursor/events',
      eventBody(input, account, cursorHome),
      event === 'sessionEnd' ? SESSION_END_TIMEOUT_MS : EVENT_TIMEOUT_MS,
    );
    debug(`${event}: ${sent ? `${sent.status} ${JSON.stringify(sent.json ?? null)}` : 'Habblaud fora do ar'}`);
  } catch (err) {
    debug(`erro: ${err?.message ?? err}`);
  }
}

export async function main() {
  setTimeout(() => process.exit(0), 20_000).unref();
  await run();
  setTimeout(() => process.exit(0), 1_000).unref();
}

function isMain() {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) main().catch(() => process.exit(0));
