// Hook do Cursor (mod/habblaud-cursor/hook.mjs) contra um servidor de teste com CursorLive falsa.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleCursorEvent } from '../cursor/http';
import { setQuiet } from '../log';
import { tempDir } from './fixtures';

setQuiet(true);

const HOOK = resolve(__dirname, '../../mod/habblaud-cursor/hook.mjs');

interface HookModule {
  readConfig(env: NodeJS.ProcessEnv): { port: number };
  cursorHomeOf(env: NodeJS.ProcessEnv, input: unknown): string;
  accountOf(cursorHome: string): string;
  eventBody(input: Record<string, unknown>, account: string, cursorHome: string): Record<string, unknown>;
  OBSERVED: Set<string>;
}
const hook = (await import(pathToFileURL(HOOK).href)) as HookModule;

class FakeLive {
  calls: Array<{ account: string | undefined; input: Record<string, unknown> }> = [];
  applyHookEvent(account: string | undefined, input: Record<string, unknown>): boolean {
    this.calls.push({ account, input });
    return true;
  }
}

let tmp: ReturnType<typeof tempDir>;
let home: string;
let cursorHome: string;
let live: FakeLive;
let port = 0;
let closeServer: (() => Promise<void>) | undefined;

beforeEach(async () => {
  tmp = tempDir();
  home = join(tmp.dir, 'home');
  cursorHome = join(home, '.cursor');
  mkdirSync(cursorHome, { recursive: true });
  live = new FakeLive();
  const server = createServer((req, res) => {
    if (req.url === '/api/cursor/events' && req.method === 'POST') {
      handleCursorEvent(req, res, {
        live,
        entries: () => [{ id: '.cursor', provider: 'cursor' as const, dir: cursorHome, detected: { id: '.cursor', configDir: cursorHome, short: 'R', name: 'Cursor', color: '#4aa8e8' } }],
      }).catch(() => {
        res.statusCode = 500;
        res.end();
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
  port = (server.address() as { port: number }).port;
  closeServer = () => new Promise((ok, fail) => server.close((err) => (err ? fail(err) : ok())));
  mkdirSync(join(home, '.habblaud'), { recursive: true });
  writeFileSync(join(home, '.habblaud', 'cursor-hook.json'), JSON.stringify({ port }));
});

afterEach(async () => {
  await closeServer?.();
  closeServer = undefined;
  tmp.cleanup();
});

function runHook(stdin: string, env: NodeJS.ProcessEnv = {}): Promise<{ code: number | null; stdout: string }> {
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, [HOOK], { env: { PATH: process.env.PATH, HOME: home, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.setEncoding('utf8').on('data', (c: string) => (stdout += c));
    const kill = setTimeout(() => child.kill('SIGKILL'), 15_000);
    child.on('error', fail);
    child.on('close', (code) => {
      clearTimeout(kill);
      ok({ code, stdout });
    });
    child.stdin.end(stdin);
  });
}

describe('habblaud-cursor/hook.mjs', () => {
  it('funções puras: conta, config e eventos observados', () => {
    expect(hook.accountOf('/Users/x/.cursor')).toBe('.cursor');
    expect(hook.cursorHomeOf({ HOME: home }, {})).toBe(join(home, '.cursor'));
    expect(hook.cursorHomeOf({ HOME: home, CURSOR_HOME: cursorHome }, {})).toBe(cursorHome);
    expect(hook.OBSERVED.has('sessionStart')).toBe(true);
    expect(hook.OBSERVED.has('preToolUse')).toBe(true);
    expect(hook.readConfig({ HOME: home })).toEqual({ port });
  });

  it('manda sessionStart ao Habblaud sem stdout', async () => {
    const r = await runHook(
      JSON.stringify({
        hook_event_name: 'sessionStart',
        conversation_id: 'conv-aaaa-bbbb-cccc-dddd',
        workspace_roots: ['/home/x/proj'],
      }),
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
    expect(live.calls).toHaveLength(1);
    expect(live.calls[0].account).toBe('.cursor');
    expect(live.calls[0].input.hook_event_name).toBe('sessionStart');
    expect(live.calls[0].input.conversation_id).toBe('conv-aaaa-bbbb-cccc-dddd');
  });

  it('ignora evento sem conversation_id', async () => {
    const r = await runHook(JSON.stringify({ hook_event_name: 'preToolUse', tool_name: 'Shell' }));
    expect(r.code).toBe(0);
    expect(live.calls).toHaveLength(0);
  });
});
