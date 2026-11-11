import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccountsService } from '../../accounts/service';
import { NameStore } from '../../model/names';
import { Office } from '../../model/office';
import { tempDir } from '../../test/fixtures';
import { CursorSource, HOOK_PRESENCE_MS } from './source';

describe('CursorSource', () => {
  let tmp: ReturnType<typeof tempDir>;
  let office: Office;
  let accounts: AccountsService;
  let source: CursorSource;
  let now = 1_000_000;

  beforeEach(() => {
    tmp = tempDir();
    const home = join(tmp.dir, 'home');
    const cursor = join(home, '.cursor');
    mkdirSync(join(cursor, 'projects'), { recursive: true });
    accounts = new AccountsService({ dirs: [], home, env: { HOME: home }, onChange: () => undefined });
    office = new Office({
      now: () => now,
      names: new NameStore(null),
      version: 't',
      startedAt: now,
      accounts: () => [],
      sources: () => [],
      accountName: (id) => accounts.find(id)?.detected.name,
    });
    source = new CursorSource({
      accounts,
      office,
      dirs: [cursor],
      env: { HOME: home },
      home,
      now: () => now,
    });
    source.start();
  });

  afterEach(() => {
    source.stop();
    tmp.cleanup();
  });

  it('sessionStart + cwd cria agente principal cursor', () => {
    const ok = source.applyHookEvent('.cursor', {
      hook_event_name: 'sessionStart',
      conversation_id: '11111111-2222-3333-4444-555555555555',
      workspace_roots: ['/home/x/proj'],
    });
    expect(ok).toBe(true);
    const agents = office.list().filter((a) => a.provider === 'cursor');
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      kind: 'main',
      sessionId: '11111111-2222-3333-4444-555555555555',
      status: 'working',
      roomId: '/home/x/proj',
    });
  });

  it('preToolUse adiciona atividade; stop deixa idle; presença expira', () => {
    source.applyHookEvent(undefined, {
      hook_event_name: 'beforeSubmitPrompt',
      conversation_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      cwd: '/repo',
    });
    source.applyHookEvent(undefined, {
      hook_event_name: 'preToolUse',
      conversation_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      tool_name: 'Shell',
      tool_use_id: 't1',
      tool_input: { command: 'ls' },
      cwd: '/repo',
    });
    let a = office.list().find((x) => x.provider === 'cursor')!;
    expect(a.status).toBe('working');
    expect(a.activity?.tool).toBe('Bash');
    source.applyHookEvent(undefined, {
      hook_event_name: 'stop',
      conversation_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    });
    a = office.get(a.id)!;
    expect(a.status).toBe('idle');
    now += HOOK_PRESENCE_MS + 1;
    (source as unknown as { tick(): void }).tick();
    expect(office.get(a.id)?.status).toBe('offline');
  });

  it('subagentStart/Stop sobe e entrega subagente', () => {
    source.applyHookEvent(undefined, {
      hook_event_name: 'sessionStart',
      conversation_id: 'mainnnnn-bbbb-cccc-dddd-eeeeeeeeeeee',
      workspace_roots: ['/ws'],
    });
    source.applyHookEvent(undefined, {
      hook_event_name: 'subagentStart',
      conversation_id: 'mainnnnn-bbbb-cccc-dddd-eeeeeeeeeeee',
      subagent_id: 'subbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee',
      subagent_type: 'explore',
    });
    const sub = office.list().find((a) => a.kind === 'sub' && a.provider === 'cursor');
    expect(sub).toMatchObject({ status: 'working', role: 'explore' });
    source.applyHookEvent(undefined, {
      hook_event_name: 'subagentStop',
      conversation_id: 'mainnnnn-bbbb-cccc-dddd-eeeeeeeeeeee',
      subagent_id: 'subbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee',
    });
    expect(office.get(sub!.id)?.status).toBe('done');
  });
});
