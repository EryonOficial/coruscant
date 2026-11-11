import { describe, expect, it } from 'vitest';
import { envOnByDefault, isTruthy, parseEnvPort, parseHabblaudEnv } from './env';
import { loadConfig } from './config';

describe('env (Zod)', () => {
  it('isTruthy aceita 1/true/yes/sim/on e rejeita o resto', () => {
    for (const v of ['1', 'true', 'TRUE', 'yes', 'sim', 'on', ' On ']) expect(isTruthy(v)).toBe(true);
    for (const v of [undefined, '', '0', 'false', 'off', 'no', 'nao', '2', 'ligado']) expect(isTruthy(v)).toBe(false);
  });

  it('envOnByDefault: ausente/vazio = ligado', () => {
    expect(envOnByDefault(undefined)).toBe(true);
    expect(envOnByDefault('')).toBe(true);
    expect(envOnByDefault('  ')).toBe(true);
    expect(envOnByDefault('1')).toBe(true);
    expect(envOnByDefault('0')).toBe(false);
    expect(envOnByDefault('false')).toBe(false);
  });

  it('parseEnvPort valida faixa e cai no padrão', () => {
    expect(parseEnvPort('4747')).toBe(4747);
    expect(parseEnvPort('1')).toBe(1);
    expect(parseEnvPort('65535')).toBe(65535);
    expect(parseEnvPort(undefined)).toBe(4747);
    expect(parseEnvPort('')).toBe(4747);
    expect(parseEnvPort('0')).toBe(4747);
    expect(parseEnvPort('65536')).toBe(4747);
    expect(parseEnvPort('abc')).toBe(4747);
    expect(parseEnvPort('99999', 5000)).toBe(5000);
  });

  it('parseHabblaudEnv tipa chaves conhecidas e preserva extras', () => {
    const env = parseHabblaudEnv({
      HABBLAUD_PORT: '4848',
      HABBLAUD_CURSOR: '0',
      PATH: '/usr/bin',
      CUSTOM: 'x',
    });
    expect(env.HABBLAUD_PORT).toBe('4848');
    expect(env.HABBLAUD_CURSOR).toBe('0');
    expect(env.PATH).toBe('/usr/bin');
    expect(env.CUSTOM).toBe('x');
  });

  it('loadConfig usa Zod para porta e flags on-by-default', () => {
    const base = { HOME: '/tmp/habblaud-env-test', HABBLAUD_IN_DOCKER: '0' };
    expect(loadConfig({ ...base, HABBLAUD_PORT: '5001' }, []).port).toBe(5001);
    expect(loadConfig({ ...base, HABBLAUD_PORT: 'nope' }, []).port).toBe(4747);
    expect(loadConfig({ ...base }, []).cursor).toBe(true);
    expect(loadConfig({ ...base, HABBLAUD_CURSOR: '0' }, []).cursor).toBe(false);
    expect(loadConfig({ ...base, HABBLAUD_CODEX: 'false' }, []).codex).toBe(false);
    expect(loadConfig({ ...base, HABBLAUD_DEMO: 'yes' }, []).demo).toBe(true);
  });
});
