import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyDotEnvFile, parseDotEnv, parseDotEnvLine } from './dotenv';
import { tempDir } from './test/fixtures';

describe('dotenv', () => {
  let tmp: ReturnType<typeof tempDir> | undefined;
  afterEach(() => {
    tmp?.cleanup();
    tmp = undefined;
  });

  it('parseia linhas, aspas e comentários', () => {
    expect(parseDotEnvLine('# x')).toBeUndefined();
    expect(parseDotEnvLine('')).toBeUndefined();
    expect(parseDotEnvLine('HABBLAUD_PORT=4747')).toEqual({ key: 'HABBLAUD_PORT', value: '4747' });
    expect(parseDotEnvLine('export HABBLAUD_HOST=127.0.0.1')).toEqual({ key: 'HABBLAUD_HOST', value: '127.0.0.1' });
    expect(parseDotEnvLine(`HABBLAUD_LANG="pt-BR"`)).toEqual({ key: 'HABBLAUD_LANG', value: 'pt-BR' });
    expect(parseDotEnvLine(`NAME='a b'`)).toEqual({ key: 'NAME', value: 'a b' });
    expect(parseDotEnvLine('FOO=bar # nota')).toEqual({ key: 'FOO', value: 'bar' });
    expect(parseDotEnv('A=1\nB=2\nA=3')).toEqual({ A: '3', B: '2' });
  });

  it('aplica só chaves ausentes no ambiente', () => {
    tmp = tempDir();
    const file = join(tmp.dir, '.env');
    writeFileSync(file, 'HABBLAUD_PORT=5000\nHABBLAUD_DEMO=1\nHABBLAUD_LANG=en\n');
    const env: NodeJS.ProcessEnv = { HABBLAUD_PORT: '4747' };
    expect(applyDotEnvFile(file, env).sort()).toEqual(['HABBLAUD_DEMO', 'HABBLAUD_LANG']);
    expect(env).toMatchObject({ HABBLAUD_PORT: '4747', HABBLAUD_DEMO: '1', HABBLAUD_LANG: 'en' });
  });

  it('arquivo ausente ou ilegível: lista vazia', () => {
    tmp = tempDir();
    mkdirSync(join(tmp.dir, 'x'));
    expect(applyDotEnvFile(join(tmp.dir, 'nao-existe.env'), {})).toEqual([]);
  });
});
