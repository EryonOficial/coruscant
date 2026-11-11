// Eventos dos hooks do Cursor (mod/habblaud-cursor/hook.mjs, que npm run cursor:install acrescenta em
// ~/.cursor/hooks.json): sessionStart, beforeSubmitPrompt, preToolUse, postToolUse, beforeShellExecution,
// afterShellExecution, beforeMCPExecution, afterFileEdit, subagentStart, subagentStop, stop e sessionEnd
// chegam aqui com a conta e vão para a fonte do Cursor (CursorLive). Só observam; a trava de Host/loopback é
// conferida em http/app.ts.
//
//   POST /api/cursor/events   (hook)   {account?, cursorHome?, event: <stdin do hook>}: 200 {ok}
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isAbsolute, resolve } from 'node:path';
import type { AccountEntry } from '../accounts/service';
import { HttpError, readJson, sendJson } from '../http/app';
import { errMsg, log } from '../log';
import type { CursorLive } from '../sources/cursor/live';
import { tr } from '../../shared/i18n';

type Rec = Record<string, unknown>;

export interface CursorHookEvent {
  account?: string;
  cursorHome?: string;
  event: Rec;
}

function rec(v: unknown): Rec | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : undefined;
}

function shortStr(v: unknown, max: number): string | undefined {
  return typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : undefined;
}

/** Corpo de POST /api/cursor/events. Sem `event` (objeto com hook_event_name): 400. */
export function parseCursorEvent(raw: unknown): CursorHookEvent {
  const r = rec(raw);
  const event = rec(r?.event);
  if (!r || !event || typeof event.hook_event_name !== 'string') {
    throw new HttpError(400, 'esperado {account?, cursorHome?, event: <JSON do hook do Cursor>}');
  }
  const out: CursorHookEvent = { event };
  const account = shortStr(r.account, 200);
  const cursorHome = shortStr(r.cursorHome, 4_096);
  if (account) out.account = account;
  if (cursorHome) out.cursorHome = cursorHome;
  return out;
}

/** Conta do Cursor de um evento: pela pasta cursorHome ou pelo account (basename). */
export function cursorAccountOf(entries: readonly AccountEntry[], account: string | undefined, cursorHome: string | undefined): string | undefined {
  if (cursorHome && isAbsolute(cursorHome)) {
    const abs = resolve(cursorHome);
    const e = entries.find((x) => resolve(x.detected.configDir) === abs || resolve(x.dir) === abs);
    if (e) return e.id;
  }
  return account;
}

/** Trata POST /api/cursor/events. `ok` = a fonte aproveitou o evento. */
export async function handleCursorEvent(
  req: IncomingMessage,
  res: ServerResponse,
  deps: { live?: CursorLive; entries: () => readonly AccountEntry[] },
): Promise<void> {
  const body = parseCursorEvent(await readJson(req));
  let ok = false;
  if (deps.live) {
    try {
      ok = deps.live.applyHookEvent(cursorAccountOf(deps.entries(), body.account, body.cursorHome), body.event) === true;
    } catch (err) {
      log.warnOnce(`cursor-event:${errMsg(err)}`, tr('Eventos do Cursor: falha ao aplicar um evento ({0}).', [errMsg(err)]));
    }
  }
  sendJson(res, 200, { ok });
}
