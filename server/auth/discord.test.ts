import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseDiscordAllowedIds } from '../env';
import { parseDiscordAuthConfig } from '../config';
import {
  bearerMatches,
  createDiscordSessions,
  DiscordSessions,
  issueOAuthState,
  verifyOAuthState,
} from './discord';

describe('parseDiscordAllowedIds', () => {
  it('parseia array por vírgula e ignora inválidos', () => {
    expect(parseDiscordAllowedIds('123456789012345678, 987654321098765432')).toEqual([
      '123456789012345678',
      '987654321098765432',
    ]);
    expect(parseDiscordAllowedIds('abc,123456789012345678;123456789012345678')).toEqual(['123456789012345678']);
    expect(parseDiscordAllowedIds('')).toEqual([]);
    expect(parseDiscordAllowedIds(undefined)).toEqual([]);
  });
});

describe('parseDiscordAuthConfig', () => {
  it('ready só com client, secret e ≥1 ID', () => {
    expect(parseDiscordAuthConfig({}).ready).toBe(false);
    expect(
      parseDiscordAuthConfig({
        HABBLAUD_DISCORD_CLIENT_ID: 'c',
        HABBLAUD_DISCORD_CLIENT_SECRET: 's',
      }).ready,
    ).toBe(false);
    const ok = parseDiscordAuthConfig({
      HABBLAUD_DISCORD_CLIENT_ID: 'c',
      HABBLAUD_DISCORD_CLIENT_SECRET: 's',
      HABBLAUD_DISCORD_ALLOWED_IDS: '123456789012345678',
      HABBLAUD_HOOK_TOKEN: 'tok',
    });
    expect(ok).toMatchObject({
      ready: true,
      clientId: 'c',
      hookToken: 'tok',
      allowedIds: ['123456789012345678'],
      redirectUri: 'http://127.0.0.1:4747/auth/discord/callback',
    });
    expect(
      parseDiscordAuthConfig(
        {
          HABBLAUD_DISCORD_CLIENT_ID: 'c',
          HABBLAUD_DISCORD_CLIENT_SECRET: 's',
          HABBLAUD_DISCORD_ALLOWED_IDS: '123456789012345678',
          HABBLAUD_DISCORD_REDIRECT_URI: 'http://localhost:4747/auth/discord/callback',
        },
        4747,
      ).redirectUri,
    ).toBe('http://localhost:4747/auth/discord/callback');
  });
});

describe('DiscordSessions', () => {
  it('emite e verifica cookie; rejeita id fora da allowlist e token revogado', () => {
    const secret = randomBytes(32);
    const sessions = new DiscordSessions(secret, new Set(['123456789012345678']));
    const { token } = sessions.issue({ id: '123456789012345678', username: 'Ana' });
    expect(sessions.verify(token)).toEqual({ id: '123456789012345678', username: 'Ana' });
    expect(sessions.verify(undefined)).toBeUndefined();
    expect(sessions.verify('lixo')).toBeUndefined();
    const other = createDiscordSessions(
      {
        ready: true,
        clientId: 'c',
        clientSecret: 's',
        allowedIds: ['999999999999999999'],
        redirectUri: 'http://127.0.0.1:4747/auth/discord/callback',
      },
      secret,
    );
    expect(other.verify(token)).toBeUndefined();
    sessions.revoke(token);
    expect(sessions.verify(token)).toBeUndefined();
  });
});

describe('OAuth state + bearer', () => {
  it('state assinado casa com o cookie', () => {
    const secret = Buffer.from('a'.repeat(64), 'hex');
    const t0 = 1_700_000_000_000;
    const { state } = issueOAuthState(secret, t0);
    expect(verifyOAuthState(secret, state, state, t0)).toBe(true);
    expect(verifyOAuthState(secret, state, 'outro', t0)).toBe(false);
    expect(verifyOAuthState(secret, state, state, t0 + 11 * 60_000)).toBe(false);
  });

  it('bearerMatches compara o token', () => {
    expect(bearerMatches('Bearer segredo', 'segredo')).toBe(true);
    expect(bearerMatches('Bearer outro', 'segredo')).toBe(false);
    expect(bearerMatches(undefined, 'segredo')).toBe(false);
    expect(bearerMatches('Bearer segredo', undefined)).toBe(false);
  });

  it('assinatura HMAC do state não aceita payload adulterado', () => {
    const secret = Buffer.from('b'.repeat(64), 'hex');
    const t0 = 1_700_000_000_000;
    const { state } = issueOAuthState(secret, t0);
    const parts = state.split('.');
    parts[1] = String(Number(parts[1]) + 1);
    const tampered = parts.join('.');
    expect(verifyOAuthState(secret, tampered, tampered, t0)).toBe(false);
    // sanity: createHmac disponível
    expect(createHmac('sha256', secret).update('x').digest('hex')).toHaveLength(64);
  });
});
