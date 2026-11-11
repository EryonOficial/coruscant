// Fonte de agentes do Cursor (AgentSource 'cursor'): presença e status vêm só dos hooks
// (CursorLive, via POST /api/cursor/events). Sem locks de arquivo — o Cursor não expõe um registro de sessões
// abertas como o Claude Code. Um evento segura o agente por HOOK_PRESENCE_MS; sessionEnd/stop fecham com grace.
import { basename, resolve, sep } from 'node:path';
import type { Activity, AgentStatus, SourceInfo } from '../../../shared/types';
import { describeTool } from '../../../shared/activity';
import type { DetectedAccount } from '../../accounts/detect';
import type { AccountsService } from '../../accounts/service';
import { errMsg, log } from '../../log';
import type { Office } from '../../model/office';
import type { AgentSource } from '../source';
import { detectCursorAccounts } from './accounts';
import type { CursorLive } from './live';
import { tr } from '../../../shared/i18n';

/** Um evento de hook segura o agente presente por este tempo. */
export const HOOK_PRESENCE_MS = 60_000;
/** Depois de sessionEnd/stop, fecha mesmo com hook recente depois disto. */
export const SESSION_END_GRACE_MS = 5_000;
/** Polling para expirar presença. */
const TICK_MS = 1_000;

const MAIN_ROLE = tr('Agente principal (Cursor)');
const SUB_ROLE = tr('Subagente (Cursor)');

/** Eventos do Cursor (camelCase) e aliases PascalCase aceitos. */
const HOOK_EVENTS = new Set([
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
  // aliases estilo Codex, se algum bridge normalizar
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'SubagentStart',
  'SubagentStop',
  'Stop',
]);

type Rec = Record<string, unknown>;

interface CursorAccount {
  id: string;
  dir: string;
  configDir: string;
  detected: DetectedAccount;
}

interface AgentTracker {
  key: string;
  accountId: string;
  conversationId: string;
  kind: 'main' | 'sub';
  parentId?: string;
  cwd?: string;
  role?: string;
  lastHookAt: number;
  endedAt?: number;
  inOffice: boolean;
  startedAt: number;
  status: AgentStatus;
  subIds: Set<string>;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function rec(v: unknown): Rec | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : undefined;
}

function normEvent(name: string): string {
  const map: Record<string, string> = {
    SessionStart: 'sessionStart',
    SessionEnd: 'sessionEnd',
    UserPromptSubmit: 'beforeSubmitPrompt',
    PreToolUse: 'preToolUse',
    PostToolUse: 'postToolUse',
    SubagentStart: 'subagentStart',
    SubagentStop: 'subagentStop',
    Stop: 'stop',
  };
  return map[name] ?? name;
}

function isConversationId(id: string | undefined): id is string {
  return !!id && id.length >= 8 && id.length <= 128;
}

function describeCursorTool(toolName: string, input: Rec, event: string): { desc: ReturnType<typeof describeTool>; tool: string } {
  if (event === 'beforeShellExecution' || event === 'afterShellExecution') {
    const command = str(input.command) ?? str(input.cmd);
    return { desc: describeTool('Bash', { command, description: input.description }), tool: 'Bash' };
  }
  if (event === 'afterFileEdit') {
    const path = str(input.file_path) ?? str(input.path) ?? str(input.filePath);
    return { desc: describeTool('Edit', { file_path: path }), tool: 'Edit' };
  }
  const name = toolName || 'Tool';
  // Cursor tools: Shell, Read, Write, Task, MCP:…
  const mapped = name.startsWith('MCP:') ? name : name === 'Shell' ? 'Bash' : name === 'Task' ? 'Agent' : name;
  return { desc: describeTool(mapped, input), tool: mapped };
}

export interface CursorSourceOpts {
  accounts: AccountsService;
  office: Office;
  dirs: readonly string[];
  env?: NodeJS.ProcessEnv;
  home?: string;
  now?: () => number;
}

export class CursorSource implements AgentSource, CursorLive {
  readonly provider = 'cursor' as const;
  private readonly opts: CursorSourceOpts;
  private readonly now: () => number;
  private accs: CursorAccount[] = [];
  private detected: DetectedAccount[] = [];
  private readonly agents = new Map<string, AgentTracker>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopped = true;

  constructor(opts: CursorSourceOpts) {
    this.opts = opts;
    this.now = opts.now ?? Date.now;
  }

  start(): void {
    this.stopped = false;
    this.opts.office.beginBoot();
    try {
      this.register();
    } finally {
      this.opts.office.endBoot();
    }
    this.timer = setInterval(() => this.tick(), TICK_MS);
    if (typeof this.timer === 'object' && 'unref' in this.timer) this.timer.unref();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  sources(): SourceInfo[] {
    const open = new Map<string, number>();
    for (const t of this.agents.values()) {
      if (t.kind === 'main' && t.inOffice) open.set(t.accountId, (open.get(t.accountId) ?? 0) + 1);
    }
    return this.accs.map((a) => ({
      label: a.id,
      provider: 'cursor' as const,
      path: a.configDir,
      sessions: open.get(a.id) ?? 0,
      ok: true,
    }));
  }

  transcriptPathOf(_agentId: string): string | undefined {
    return undefined;
  }

  applyHookEvent(account: string | undefined, input: Record<string, unknown>): boolean {
    try {
      return this.hookEvent(account, input);
    } catch (err) {
      log.warnOnce(`cursor-hook:${errMsg(err)}`, tr('Cursor: evento de hook ignorado ({0}).', [errMsg(err)]));
      return false;
    }
  }

  private register(): void {
    const env = this.opts.env ?? process.env;
    const home = this.opts.home ?? env.HOME ?? '';
    const claude = this.opts.accounts.entriesOf('claude');
    const codex = this.opts.accounts.entriesOf('codex');
    this.detected = detectCursorAccounts([...this.opts.dirs], {
      env,
      home,
      taken: {
        shorts: [...claude, ...codex].map((e) => e.detected.short),
        colors: [...claude, ...codex].map((e) => e.detected.color),
      },
    });
    const entries = this.opts.accounts.setProviderAccounts(
      'cursor',
      this.detected.map((d, i) => ({ dir: this.opts.dirs[i] ?? d.configDir, detected: d })),
    );
    this.accs = entries.map((e, i) => ({
      id: e.id,
      dir: e.dir,
      configDir: this.detected[i]?.configDir ?? e.dir,
      detected: this.detected[i] ?? e.detected,
    }));
  }

  private tick(): void {
    if (this.stopped) return;
    const now = this.now();
    for (const t of [...this.agents.values()]) this.reconcile(t, now);
  }

  private hookEvent(account: string | undefined, input: Record<string, unknown>): boolean {
    const rawEvent = str(input.hook_event_name);
    if (!rawEvent || !HOOK_EVENTS.has(rawEvent)) return false;
    const event = normEvent(rawEvent);
    const conversationId = str(input.conversation_id) ?? str(input.session_id);
    if (!isConversationId(conversationId)) return false;
    const acc = this.accountFor(account, input, conversationId);
    if (!acc) return false;

    const now = this.now();
    const roots = Array.isArray(input.workspace_roots) ? input.workspace_roots.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];
    const cwd = str(input.cwd) ?? roots[0];

    if (event === 'sessionEnd') {
      const t = this.agents.get(`${acc.id}:${conversationId}`);
      if (!t) return false;
      t.endedAt = now;
      this.reconcile(t, now);
      return true;
    }

    const subRaw = str(input.subagent_id) ?? str(input.agent_id) ?? str(input.task_id);
    const isSub = event === 'subagentStart' || event === 'subagentStop' || (!!subRaw && subRaw !== conversationId && (event === 'preToolUse' || event === 'postToolUse' || event === 'stop'));
    const subId = isSub && subRaw && subRaw !== conversationId ? subRaw : undefined;

    const main = this.touch(acc, conversationId, now, cwd);
    const t = subId ? this.touchSub(acc, main, subId, now, str(input.subagent_type) ?? str(input.agent_type)) : main;

    switch (event) {
      case 'sessionStart':
      case 'beforeSubmitPrompt':
      case 'afterAgentResponse':
      case 'afterAgentThought':
        this.setStatus(t, 'working', now);
        break;
      case 'subagentStart':
        this.setStatus(t, 'working', now);
        break;
      case 'subagentStop':
        this.setStatus(t, 'idle', now);
        if (t.kind === 'sub') this.opts.office.completeSub(t.key);
        break;
      case 'preToolUse':
      case 'postToolUse':
      case 'postToolUseFailure':
      case 'beforeShellExecution':
      case 'afterShellExecution':
      case 'beforeMCPExecution':
      case 'afterMCPExecution':
      case 'afterFileEdit': {
        this.setStatus(t, 'working', now);
        const toolName = str(input.tool_name) ?? (event.includes('Shell') ? 'Shell' : event === 'afterFileEdit' ? 'Edit' : 'Tool');
        const toolInput = rec(input.tool_input) ?? rec(input) ?? {};
        const { desc, tool } = describeCursorTool(toolName, toolInput, event);
        const id = str(input.tool_use_id) ?? str(input.generation_id);
        const act: Activity = { id: `${t.key}#${id ?? `hook${now.toString(36)}`}`, at: now, ...desc, tool };
        if (t.inOffice) this.opts.office.addActivity(t.key, act, true);
        break;
      }
      case 'stop':
        this.setStatus(t, 'idle', now);
        break;
      default:
        break;
    }
    this.reconcile(main, now);
    if (t !== main) this.reconcile(t, now);
    return true;
  }

  private touch(acc: CursorAccount, conversationId: string, now: number, cwd: string | undefined): AgentTracker {
    const key = `${acc.id}:${conversationId}`;
    let t = this.agents.get(key);
    if (!t) {
      t = {
        key,
        accountId: acc.id,
        conversationId,
        kind: 'main',
        lastHookAt: now,
        inOffice: false,
        startedAt: now,
        status: 'working',
        subIds: new Set(),
      };
      this.agents.set(key, t);
    }
    t.lastHookAt = now;
    delete t.endedAt;
    if (cwd) t.cwd ??= cwd;
    this.ensureInOffice(t, now);
    return t;
  }

  private touchSub(acc: CursorAccount, parent: AgentTracker, subId: string, now: number, role: string | undefined): AgentTracker {
    const key = `${parent.conversationId}:${subId}`;
    let t = this.agents.get(key);
    if (!t) {
      t = {
        key,
        accountId: acc.id,
        conversationId: subId,
        kind: 'sub',
        parentId: parent.key,
        lastHookAt: now,
        inOffice: false,
        startedAt: now,
        status: 'working',
        role: role ?? SUB_ROLE,
        cwd: parent.cwd,
        subIds: new Set(),
      };
      this.agents.set(key, t);
      parent.subIds.add(key);
    }
    t.lastHookAt = now;
    delete t.endedAt;
    if (role) t.role = role;
    t.cwd ??= parent.cwd;
    this.ensureInOffice(t, now);
    return t;
  }

  private ensureInOffice(t: AgentTracker, now: number): void {
    if (t.inOffice) {
      if (!this.opts.office.has(t.key)) t.inOffice = false;
      else return;
    }
    if (!t.cwd) return;
    if (t.kind === 'main') {
      this.opts.office.addMain({
        id: t.key,
        provider: 'cursor',
        account: t.accountId,
        sessionId: t.conversationId,
        cwd: t.cwd,
        role: MAIN_ROLE,
        startedAt: t.startedAt,
        status: t.status,
      });
      t.inOffice = true;
      return;
    }
    if (!t.parentId || !this.opts.office.has(t.parentId)) return;
    this.opts.office.addSub({
      id: t.key,
      parentId: t.parentId,
      sessionId: t.conversationId,
      role: t.role ?? SUB_ROLE,
      background: false,
      startedAt: t.startedAt,
    });
    t.inOffice = true;
    this.opts.office.setStatus(t.key, t.status);
  }

  private setStatus(t: AgentTracker, status: AgentStatus, now: number): void {
    t.status = status;
    t.lastHookAt = now;
    if (t.inOffice) this.opts.office.setStatus(t.key, status);
  }

  private reconcile(t: AgentTracker, now: number): void {
    if (!t.inOffice) return;
    if (t.endedAt !== undefined) {
      if (now - t.endedAt >= SESSION_END_GRACE_MS) {
        this.leave(t);
        return;
      }
    }
    if (now - t.lastHookAt > HOOK_PRESENCE_MS) {
      this.leave(t);
    }
  }

  private leave(t: AgentTracker): void {
    for (const subKey of t.subIds) {
      const sub = this.agents.get(subKey);
      if (sub) this.leave(sub);
    }
    if (t.inOffice) {
      this.opts.office.setStatus(t.key, 'offline');
      t.inOffice = false;
    }
    this.agents.delete(t.key);
  }

  private accountFor(account: string | undefined, input: Record<string, unknown>, conversationId: string): CursorAccount | undefined {
    const norm = (p: string) => {
      try {
        return resolve(p);
      } catch {
        return p;
      }
    };
    if (account) {
      const byId = this.accs.find((a) => a.id === account);
      if (byId) return byId;
      const abs = norm(account);
      const byDir = this.accs.find((a) => norm(a.dir) === abs || norm(a.configDir) === abs);
      if (byDir) return byDir;
    }
    const transcript = str(input.transcript_path);
    if (transcript) {
      const p = norm(transcript);
      const byPath = this.accs.find((a) => p.startsWith(norm(a.dir) + sep) || p.startsWith(norm(a.configDir) + sep));
      if (byPath) return byPath;
    }
    const known = this.accs.filter((a) => this.agents.has(`${a.id}:${conversationId}`));
    if (known.length === 1) return known[0];
    if (account) {
      const byName = this.accs.find((a) => basename(a.dir) === basename(account) || basename(a.configDir) === basename(account));
      if (byName) return byName;
    }
    return this.accs.length === 1 ? this.accs[0] : undefined;
  }
}
