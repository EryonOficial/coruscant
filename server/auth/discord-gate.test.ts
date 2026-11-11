import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { DiscordAuthConfig } from '../config';
import { DISCORD_COOKIE, createDiscordGate, createDiscordSessions, type DiscordFetch } from './discord';

const servers: http.Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

async function withGate(cfg: DiscordAuthConfig, fetchImpl?: DiscordFetch) {
  const secret = randomBytes(32);
  const sessions = createDiscordSessions(cfg, secret);
  const gate = createDiscordGate({ config: cfg, sessions, secret, fetchImpl });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (gate(req, res, url)) return;
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('office');
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  servers.push(server);
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  const base = `http://127.0.0.1:${addr.port}`;
  return { base, sessions, secret };
}

const readyCfg: DiscordAuthConfig = {
  ready: true,
  clientId: 'client',
  clientSecret: 'secret',
  allowedIds: ['123456789012345678'],
  hookToken: 'hook-secret',
};

describe('createDiscordGate', () => {
  it('sem config: bloqueia API e serve página de bloqueio', async () => {
    const { base } = await withGate({
      ready: false,
      clientId: '',
      clientSecret: '',
      allowedIds: [],
      reason: 'falta config',
    });
    const page = await fetch(`${base}/auth/discord/login`);
    expect(page.status).toBe(200);
    expect(await page.text()).toMatch(/bloqueado|falta config|Discord/i);
    const api = await fetch(`${base}/api/snapshot`);
    expect(api.status).toBe(401);
    const health = await fetch(`${base}/api/health`);
    expect(health.status).toBe(200);
  });

  it('hook token libera a API; cookie Discord também', async () => {
    const { base, sessions } = await withGate(readyCfg);
    const denied = await fetch(`${base}/`, { redirect: 'manual' });
    expect(denied.status).toBe(302);
    expect(denied.headers.get('location')).toBe('/auth/discord/login');

    const hooked = await fetch(`${base}/`, { headers: { Authorization: 'Bearer hook-secret' } });
    expect(hooked.status).toBe(200);
    expect(await hooked.text()).toBe('office');

    const { token } = sessions.issue({ id: '123456789012345678', username: 'Ana' });
    const cookied = await fetch(`${base}/`, { headers: { Cookie: `${DISCORD_COOKIE}=${token}` } });
    expect(cookied.status).toBe(200);
    expect(await cookied.text()).toBe('office');
  });

  it('callback OAuth rejeita id fora da allowlist', async () => {
    const fetchImpl: DiscordFetch = async (input) => {
      const u = String(input);
      if (u.includes('/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: '999999999999999999', username: 'Intruso' }), { status: 200 });
    };
    const { base, secret } = await withGate(readyCfg, fetchImpl);
    const { issueOAuthState } = await import('./discord');
    const { state } = issueOAuthState(secret, Date.now());
    const res = await fetch(`${base}/auth/discord/callback?code=abc&state=${encodeURIComponent(state)}`, {
      headers: { Cookie: `habblaud_discord_state=${state}` },
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('error=forbidden');
  });
});
