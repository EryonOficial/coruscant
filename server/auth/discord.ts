// Gate Discord OAuth: primeira tela do escritório. Só IDs em HABBLAUD_DISCORD_ALLOWED_IDS entram.
// Sem client/secret/allowlist, ninguém entra (página de bloqueio). Hooks: Authorization Bearer HABBLAUD_HOOK_TOKEN.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DiscordAuthConfig } from '../config';
import { readCookie, safeEqual } from '../http/remote';
import { sendJson } from '../http/app';
import { getLocale, tr } from '../../shared/i18n';

export const DISCORD_COOKIE = 'habblaud_discord';
export const DISCORD_STATE_COOKIE = 'habblaud_discord_state';
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const STATE_MS = 10 * 60 * 1000;

const PUBLIC_STATIC = /^\/(manifest\.webmanifest|assets\/brand\/[\w.@-]+\.png)$/;

export interface DiscordUser {
  id: string;
  username: string;
}

/** Sessão Discord ligada a esta requisição (preenchida pelo gate). */
const users = new WeakMap<IncomingMessage, DiscordUser>();

export function discordUserOf(req: IncomingMessage): DiscordUser | undefined {
  return users.get(req);
}

export function markDiscordUser(req: IncomingMessage, user: DiscordUser): void {
  users.set(req, user);
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(html);
}

function redirect(res: ServerResponse, location: string, setCookie?: string | string[]): void {
  const headers: Record<string, string | string[]> = { Location: location, 'Cache-Control': 'no-store' };
  if (setCookie) headers['Set-Cookie'] = setCookie;
  res.writeHead(302, headers);
  res.end();
}

function cookieHeader(name: string, value: string, maxAgeS: number, secure: boolean, sameSite: 'Lax' | 'Strict' = 'Lax'): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAgeS}${secure ? '; Secure' : ''}`;
}

function clearCookie(name: string, secure: boolean, sameSite: 'Lax' | 'Strict' = 'Lax'): string {
  return cookieHeader(name, '', 0, secure, sameSite);
}

export class DiscordSessions {
  private readonly key: Buffer;
  private readonly revoked = new Map<string, number>();

  constructor(
    secret: Buffer,
    private readonly allowedIds: ReadonlySet<string>,
    private readonly now: () => number = Date.now,
  ) {
    this.key = createHmac('sha256', secret).update('habblaud-discord-v1', 'utf8').digest();
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.key).update(payload, 'utf8').digest('base64url');
  }

  issue(user: DiscordUser): { token: string; maxAgeS: number } {
    const exp = this.now() + SESSION_MS;
    const userB64 = Buffer.from(user.username, 'utf8').toString('base64url');
    const payload = `v1.${user.id}.${userB64}.${exp}`;
    return { token: `${payload}.${this.sign(payload)}`, maxAgeS: Math.floor(SESSION_MS / 1000) };
  }

  verify(token: string | undefined): DiscordUser | undefined {
    const parsed = this.parse(token);
    if (!parsed || this.revoked.has(parsed.sig)) return undefined;
    if (!this.allowedIds.has(parsed.user.id)) return undefined;
    return parsed.user;
  }

  revoke(token: string | undefined): void {
    const parsed = this.parse(token);
    if (!parsed) return;
    const now = this.now();
    for (const [sig, exp] of this.revoked) if (exp <= now) this.revoked.delete(sig);
    this.revoked.set(parsed.sig, parsed.exp);
  }

  private parse(token: string | undefined): { user: DiscordUser; exp: number; sig: string } | undefined {
    if (!token) return undefined;
    const m = /^v1\.(\d{17,20})\.([A-Za-z0-9_-]+)\.(\d{10,16})\.([A-Za-z0-9_-]{43})$/.exec(token);
    if (!m) return undefined;
    const exp = Number(m[3]);
    if (exp <= this.now()) return undefined;
    const payload = `v1.${m[1]}.${m[2]}.${m[3]}`;
    const expected = Buffer.from(this.sign(payload));
    const got = Buffer.from(m[4]);
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) return undefined;
    let username: string;
    try {
      username = Buffer.from(m[2], 'base64url').toString('utf8');
    } catch {
      return undefined;
    }
    if (!username) return undefined;
    return { user: { id: m[1], username }, exp, sig: m[4] };
  }
}

export function issueOAuthState(secret: Buffer, now = Date.now()): { state: string; maxAgeS: number } {
  const exp = now + STATE_MS;
  const nonce = randomBytes(16).toString('base64url');
  const payload = `s1.${exp}.${nonce}`;
  const sig = createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
  return { state: `${payload}.${sig}`, maxAgeS: Math.floor(STATE_MS / 1000) };
}

export function verifyOAuthState(secret: Buffer, state: string | undefined, cookie: string | undefined, now = Date.now()): boolean {
  if (!state || !cookie || !safeEqual(state, cookie)) return false;
  const m = /^s1\.(\d{10,16})\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(state);
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp <= now) return false;
  const payload = `s1.${m[1]}.${m[2]}`;
  const expected = Buffer.from(createHmac('sha256', secret).update(payload, 'utf8').digest('base64url'));
  const got = Buffer.from(m[3]);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export function bearerMatches(header: string | undefined, token: string | undefined): boolean {
  if (!token || !header?.startsWith('Bearer ')) return false;
  return safeEqual(header.slice('Bearer '.length).trim(), token);
}

function requestIsSecure(req: IncomingMessage): boolean {
  const xf = req.headers['x-forwarded-proto'];
  if (typeof xf === 'string' && xf.split(',')[0]?.trim() === 'https') return true;
  // socket encrypted (HTTPS remoto)
  return !!(req.socket as { encrypted?: boolean }).encrypted;
}

function publicOrigin(req: IncomingMessage, url: URL): string {
  const host = req.headers.host || url.host;
  const proto = requestIsSecure(req) ? 'https' : 'http';
  return `${proto}://${host}`;
}

export type DiscordFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface DiscordGateDeps {
  config: DiscordAuthConfig;
  sessions: DiscordSessions;
  secret: Buffer;
  /** Segredo HMAC das sessões/estado (também usado em loadSecret). */
  fetchImpl?: DiscordFetch;
}

export function loginPage(opts: { ready: boolean; reason?: string; error?: string }): string {
  const err =
    opts.error === 'forbidden'
      ? tr('Sua conta Discord não está na lista de IDs permitidos.')
      : opts.error === 'oauth'
        ? tr('Não deu para entrar com o Discord. Tente de novo.')
        : opts.error === 'state'
          ? tr('Sessão de login expirada. Tente de novo.')
          : opts.error || '';
  const body = opts.ready
    ? `<p>${esc(tr('Entre com o Discord para abrir o escritório. Só contas autorizadas neste Coruscant.'))}</p>
  <a class="btn" href="/auth/discord">${esc(tr('Entrar com Discord'))}</a>`
    : `<p>${esc(tr('O Coruscant está bloqueado: configure o login Discord no .env.'))}</p>
  <p class="reason">${esc(opts.reason || tr('defina HABBLAUD_DISCORD_CLIENT_ID, HABBLAUD_DISCORD_CLIENT_SECRET e HABBLAUD_DISCORD_ALLOWED_IDS'))}</p>`;
  return `<!doctype html>
<html lang="${getLocale()}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${esc(tr('Coruscant · entrar'))}</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Coruscant">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #14161f; color: #e8e6df;
         font: 16px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 16px; }
  .card { width: 100%; max-width: 360px; background: #1e2130; border: 2px solid #3a3f58; border-radius: 10px; padding: 24px; }
  h1 { margin: 0 0 4px; font-size: 22px; color: #f4c95d; }
  p { margin: 0 0 16px; color: #9aa0b8; font-size: 13px; }
  p.reason { color: #ff8a80; }
  #err { min-height: 20px; margin: 0 0 12px; color: #ff8a80; font-size: 13px; }
  a.btn { display: block; text-align: center; text-decoration: none; padding: 12px; font-weight: 700; color: #fff;
          background: #5865F2; border-radius: 6px; }
  a.btn:hover { filter: brightness(1.08); }
</style>
</head>
<body>
<div class="card">
  <h1>Coruscant</h1>
  <div id="err" role="alert">${esc(err)}</div>
  ${body}
</div>
</body>
</html>`;
}

/**
 * Gate Discord: true = já respondeu; false = autenticado (cookie ou hook token) e a API/static seguem.
 * Em `/login` na porta remota o remote gate responde primeiro; aqui `/login` vale na porta local.
 */
export function createDiscordGate(deps: DiscordGateDeps): (req: IncomingMessage, res: ServerResponse, url: URL) => boolean {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const allowed = new Set(deps.config.allowedIds);

  return (req, res, url) => {
    const path = url.pathname;
    const method = req.method ?? 'GET';
    const secure = requestIsSecure(req);
    const cookie = readCookie(req.headers.cookie, DISCORD_COOKIE);
    const sessionUser = deps.config.ready ? deps.sessions.verify(cookie) : undefined;

    if (path === '/api/health' && (method === 'GET' || method === 'HEAD')) {
      return false;
    }

    if ((method === 'GET' || method === 'HEAD') && PUBLIC_STATIC.test(path)) {
      return false;
    }

    if (path === '/login' || path === '/auth/discord/login') {
      req.resume();
      if (sessionUser) {
        redirect(res, '/');
        return true;
      }
      const error = url.searchParams.get('error') || undefined;
      sendHtml(res, loginPage({ ready: deps.config.ready, reason: deps.config.reason, error }));
      return true;
    }

    if (path === '/auth/discord') {
      req.resume();
      if (!deps.config.ready) {
        redirect(res, '/auth/discord/login');
        return true;
      }
      const { state, maxAgeS } = issueOAuthState(deps.secret);
      const redirectUri = `${publicOrigin(req, url)}/auth/discord/callback`;
      const params = new URLSearchParams({
        client_id: deps.config.clientId,
        response_type: 'code',
        scope: 'identify',
        redirect_uri: redirectUri,
        state,
        prompt: 'none',
      });
      // prompt=none can fail for first login; Discord ignores unknown — use consent default by omitting prompt
      params.delete('prompt');
      redirect(res, `https://discord.com/api/oauth2/authorize?${params}`, cookieHeader(DISCORD_STATE_COOKIE, state, maxAgeS, secure, 'Lax'));
      return true;
    }

    if (path === '/auth/discord/callback') {
      req.resume();
      if (method !== 'GET' && method !== 'HEAD') {
        sendJson(res, 405, { error: tr('método não permitido') });
        return true;
      }
      if (!deps.config.ready) {
        redirect(res, '/auth/discord/login');
        return true;
      }
      const code = url.searchParams.get('code') || '';
      const state = url.searchParams.get('state') || undefined;
      const stateCookie = readCookie(req.headers.cookie, DISCORD_STATE_COOKIE);
      if (!verifyOAuthState(deps.secret, state, stateCookie)) {
        redirect(res, '/auth/discord/login?error=state', clearCookie(DISCORD_STATE_COOKIE, secure));
        return true;
      }
      if (!code) {
        redirect(res, '/auth/discord/login?error=oauth', clearCookie(DISCORD_STATE_COOKIE, secure));
        return true;
      }
      const redirectUri = `${publicOrigin(req, url)}/auth/discord/callback`;
      void (async () => {
        try {
          const tokenRes = await fetchImpl('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: deps.config.clientId,
              client_secret: deps.config.clientSecret,
              grant_type: 'authorization_code',
              code,
              redirect_uri: redirectUri,
            }),
          });
          if (!tokenRes.ok) {
            redirect(res, '/auth/discord/login?error=oauth', clearCookie(DISCORD_STATE_COOKIE, secure));
            return;
          }
          const tokenBody = (await tokenRes.json()) as { access_token?: string };
          if (!tokenBody.access_token) {
            redirect(res, '/auth/discord/login?error=oauth', clearCookie(DISCORD_STATE_COOKIE, secure));
            return;
          }
          const meRes = await fetchImpl('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenBody.access_token}` },
          });
          if (!meRes.ok) {
            redirect(res, '/auth/discord/login?error=oauth', clearCookie(DISCORD_STATE_COOKIE, secure));
            return;
          }
          const me = (await meRes.json()) as { id?: string; username?: string; global_name?: string };
          const id = typeof me.id === 'string' ? me.id : '';
          const username = (typeof me.global_name === 'string' && me.global_name) || (typeof me.username === 'string' && me.username) || id;
          if (!allowed.has(id)) {
            redirect(res, '/auth/discord/login?error=forbidden', clearCookie(DISCORD_STATE_COOKIE, secure));
            return;
          }
          const { token, maxAgeS } = deps.sessions.issue({ id, username });
          redirect(res, '/', [
            cookieHeader(DISCORD_COOKIE, token, maxAgeS, secure, 'Lax'),
            clearCookie(DISCORD_STATE_COOKIE, secure),
          ]);
        } catch {
          if (!res.headersSent) redirect(res, '/auth/discord/login?error=oauth', clearCookie(DISCORD_STATE_COOKIE, secure));
        }
      })();
      return true;
    }

    if (path === '/api/discord/logout') {
      req.resume();
      if (method !== 'POST') {
        sendJson(res, 405, { error: tr('método não permitido') });
        return true;
      }
      handleDiscordLogout(req, res, deps.sessions, secure);
      return true;
    }

    // Hook token (integrações)
    if (bearerMatches(req.headers.authorization, deps.config.hookToken)) {
      return false;
    }

    if (sessionUser) {
      markDiscordUser(req, sessionUser);
      return false;
    }

    // Sem auth — /auth/discord/login (não /login: na porta remota /login é a senha)
    req.resume();
    if (path === '/api' || path.startsWith('/api/')) {
      sendJson(res, 401, { error: tr('faça login com o Discord') });
    } else {
      redirect(res, '/auth/discord/login');
    }
    return true;
  };
}

/** Logout com limpeza de cookie (usado pelo gate; sendJson do app não leva Set-Cookie). */
export function handleDiscordLogout(
  req: IncomingMessage,
  res: ServerResponse,
  sessions: DiscordSessions,
  secure: boolean,
): void {
  const cookie = readCookie(req.headers.cookie, DISCORD_COOKIE);
  sessions.revoke(cookie);
  const data = JSON.stringify({ ok: true });
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Set-Cookie': clearCookie(DISCORD_COOKIE, secure, 'Lax'),
  });
  res.end(data);
}

export function createDiscordSessions(config: DiscordAuthConfig, secret: Buffer): DiscordSessions {
  return new DiscordSessions(secret, new Set(config.allowedIds));
}
