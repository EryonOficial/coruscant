// Validação do ambiente com Zod (empacotado no bundle do servidor — ver scripts/build-server.mjs).
// Todas as chaves são opcionais: ausente/inválido cai no padrão do loadConfig, sem derrubar o processo.
import { z } from 'zod';

/** String de ambiente (ausente ou texto). */
const envString = z.string().optional();

/**
 * Variáveis conhecidas do Habblaud. Chaves extras (PATH, HOME do sistema, etc.) passam
 * com `.passthrough()` — o schema só tipa/normaliza o que o servidor lê.
 */
export const habblaudEnvSchema = z
  .object({
    HOME: envString,
    CODEX_HOME: envString,
    CURSOR_HOME: envString,
    HABBLAUD_PORT: envString,
    HABBLAUD_HOST: envString,
    HABBLAUD_BIND: envString,
    HABBLAUD_ALLOWED_HOSTS: envString,
    HABBLAUD_CLAUDE_DIRS: envString,
    HABBLAUD_CODEX_DIRS: envString,
    HABBLAUD_CURSOR_DIRS: envString,
    HABBLAUD_ACCOUNTS: envString,
    HABBLAUD_CODEX: envString,
    HABBLAUD_CURSOR: envString,
    HABBLAUD_CODEX_BIN: envString,
    HABBLAUD_CLAUDE_BIN: envString,
    HABBLAUD_DATA_DIR: envString,
    HABBLAUD_USAGE_DIR: envString,
    HABBLAUD_TIMELINE: envString,
    HABBLAUD_TERMINAL: envString,
    HABBLAUD_MENSAGENS: envString,
    HABBLAUD_PTY: envString,
    HABBLAUD_DEMO: envString,
    HABBLAUD_UPDATE_CHECK: envString,
    HABBLAUD_LANG: envString,
    HABBLAUD_WORLD: envString,
    HABBLAUD_WORLD_URL: envString,
    HABBLAUD_WORLD_DEV: envString,
    HABBLAUD_IN_DOCKER: envString,
    HABBLAUD_REMOTE_USER: envString,
    HABBLAUD_REMOTE_PASSWORD_HASH: envString,
    HABBLAUD_REMOTE_PASSWORD: envString,
    HABBLAUD_REMOTE_ALLOW: envString,
    HABBLAUD_REMOTE_PORT: envString,
    HABBLAUD_REMOTE_HOST: envString,
    HABBLAUD_REMOTE_NAME: envString,
    HABBLAUD_REMOTE_TLS_DIR: envString,
    HABBLAUD_REMOTE_INSECURE_HTTP: envString,
    HABBLAUD_BUILD_COMMIT: envString,
    HABBLAUD_BUILD_DIRTY: envString,
  })
  .passthrough();

export type HabblaudEnv = z.infer<typeof habblaudEnvSchema>;

/** Porta HTTP válida (1–65535). */
export const envPortSchema = z
  .string()
  .trim()
  .regex(/^\d{1,5}$/)
  .transform((s) => Number.parseInt(s, 10))
  .refine((n) => n > 0 && n < 65536);

/** Flag "ligada": 1 / true / yes / sim / on (maiúsculas/minúsculas). */
export const truthyEnvSchema = z
  .string()
  .trim()
  .regex(/^(1|true|yes|sim|on)$/i);

/** Lê o ambiente com o schema; em falha rara (valor não-string), devolve o objeto original. */
export function parseHabblaudEnv(env: NodeJS.ProcessEnv = process.env): HabblaudEnv & NodeJS.ProcessEnv {
  const result = habblaudEnvSchema.safeParse(env);
  return (result.success ? result.data : env) as HabblaudEnv & NodeJS.ProcessEnv;
}

/** `true` só com valor ligado (1/true/yes/sim/on). */
export function isTruthy(v: string | undefined): boolean {
  return truthyEnvSchema.safeParse(v).success;
}

/**
 * Flag ligada por padrão: ausente/vazia = on; caso contrário, só se for truthy.
 * Usado em HABBLAUD_CODEX, HABBLAUD_CURSOR, HABBLAUD_TIMELINE, HABBLAUD_UPDATE_CHECK, HABBLAUD_WORLD.
 */
export function envOnByDefault(v: string | undefined): boolean {
  return !v?.trim() || isTruthy(v);
}

/** Porta do ambiente; inválida/ausente → `fallback` (padrão 4747). */
export function parseEnvPort(raw: string | undefined, fallback = 4747): number {
  const result = envPortSchema.safeParse(raw);
  return result.success ? result.data : fallback;
}
