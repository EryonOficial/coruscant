// Instalador dos hooks do Cursor (scripts/cursor-install.ts): planos puros sobre hooks.json flat.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EVENTS,
  handlerFor,
  hookCommand,
  installState,
  isOurHandler,
  parseArgs,
  planInstall,
  planUninstall,
  run,
  scriptPathOf,
} from '../../scripts/cursor-install';
import { tempDir } from './fixtures';

const CMD = hookCommand('/repo/habblaud/mod/habblaud-cursor/hook.mjs');

const OTHER = {
  version: 1,
  hooks: {
    beforeShellExecution: [{ command: 'other-hook.sh', timeout: 10 }],
    stop: [{ command: 'other-stop.sh' }],
  },
};

describe('cursor-install.ts (funções puras)', () => {
  it('comando e handlers de observação', () => {
    expect(CMD).toBe('node "/repo/habblaud/mod/habblaud-cursor/hook.mjs"');
    expect(handlerFor('preToolUse', CMD)).toEqual({ command: CMD, timeout: 5 });
    expect(handlerFor('sessionEnd', CMD)).toEqual({ command: CMD, timeout: 1 });
    expect(isOurHandler({ command: CMD })).toBe(true);
    expect(isOurHandler({ command: 'other-hook.sh' })).toBe(false);
    expect(scriptPathOf(CMD)).toBe('/repo/habblaud/mod/habblaud-cursor/hook.mjs');
  });

  it('install: acrescenta no fim de cada evento; preserva hooks alheios; idempotente', () => {
    const p = planInstall(OTHER, CMD);
    expect(p.action).toBe('install');
    if (p.action !== 'install') return;
    const next = p.file as typeof OTHER & { hooks: Record<string, unknown[]> };
    expect(next.version).toBe(1);
    expect(next.hooks.beforeShellExecution[0]).toEqual(OTHER.hooks.beforeShellExecution[0]);
    expect(next.hooks.beforeShellExecution.at(-1)).toEqual(handlerFor('beforeShellExecution', CMD));
    for (const event of EVENTS) {
      expect(next.hooks[event]?.at(-1), event).toEqual(handlerFor(event, CMD));
    }
    expect(planInstall(next, CMD)).toEqual({ action: 'none', message: 'já instalado' });
    expect(installState(next, CMD).ok).toHaveLength(EVENTS.length);
  });

  it('uninstall: tira só o Habblaud', () => {
    const installed = planInstall(OTHER, CMD);
    if (installed.action !== 'install') throw new Error('esperado install');
    const u = planUninstall(installed.file);
    expect(u.action).toBe('uninstall');
    if (u.action !== 'uninstall') return;
    const hooks = u.file.hooks as Record<string, unknown[]>;
    expect(hooks.beforeShellExecution).toEqual(OTHER.hooks.beforeShellExecution);
    expect(hooks.stop).toEqual(OTHER.hooks.stop);
    expect(hooks.sessionStart).toBeUndefined();
  });

  it('parseArgs: install/status/port', () => {
    expect(parseArgs(['install', '--port', '5000'])).toMatchObject({ command: 'install', port: 5000, dryRun: false });
    expect(parseArgs(['--help'])).toBe('help');
  });
});

describe('cursor-install.ts (arquivos)', () => {
  let tmp: ReturnType<typeof tempDir>;
  let home: string;
  let cursorHome: string;

  beforeEach(() => {
    tmp = tempDir();
    home = join(tmp.dir, 'home');
    cursorHome = join(home, '.cursor');
    mkdirSync(join(cursorHome, 'projects'), { recursive: true });
  });
  afterEach(() => tmp.cleanup());

  it('instala e reporta status', async () => {
    const lines: string[] = [];
    const code = await run(
      { command: 'install', dryRun: false, port: 4747 },
      {
        env: { HOME: home, HABBLAUD_CURSOR_DIRS: cursorHome },
        home,
        now: new Date('2026-01-01T00:00:00Z'),
        hookPath: '/repo/habblaud/mod/habblaud-cursor/hook.mjs',
        out: (l) => lines.push(l),
        health: async () => ({ cursorEvents: true }),
      },
    );
    expect(code).toBe(0);
    expect(lines.some((l) => l.includes('instalado'))).toBe(true);
    const file = JSON.parse(readFileSync(join(cursorHome, 'hooks.json'), 'utf8'));
    expect(file.hooks.sessionStart.at(-1).command).toContain('habblaud-cursor');
  });
});
