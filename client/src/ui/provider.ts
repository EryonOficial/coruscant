// De qual ferramenta é cada coisa (Claude Code, Codex ou Cursor) e os textos que mudam com ela. Puro (sem DOM):
// testado em ui/provider.test.ts. No protocolo, `provider` ausente quer dizer Claude Code (shared/types.ts); aqui
// tudo cai nisso.
//
// Identidade visual do Codex e do Cursor (sem logotipo de ninguém): o chip da conta fica "vazado" (fundo escuro,
// borda e letra na cor da conta, cantos em degrau) e, onde há espaço, um selo de texto ("Codex" / "CURSOR") ao lado
// do nome.
import type { AccountInfo, OfficeSnapshot, Provider } from '../../../shared/types';
import { shortcutHint } from './model';
import { tr } from '../../../shared/i18n';

/** Nome de cada ferramenta como aparece nos textos. */
export const PROVIDER_NAME: Record<Provider, string> = { claude: 'Claude Code', codex: 'Codex', cursor: 'Cursor' };

/** Selo curto ao lado do nome (Codex / CURSOR). */
export const PROVIDER_TAG: Record<Exclude<Provider, 'claude'>, string> = { codex: 'Codex', cursor: 'CURSOR' };

/** Ferramenta de um agente, conta, sessão ou pedido (ausente = Claude Code). */
export function providerOf(x: { provider?: Provider } | null | undefined): Provider {
  return x?.provider ?? 'claude';
}

export function isCodex(x: { provider?: Provider } | null | undefined): boolean {
  return x?.provider === 'codex';
}

export function isCursor(x: { provider?: Provider } | null | undefined): boolean {
  return x?.provider === 'cursor';
}

/** Conta com selo vazado (Codex ou Cursor). */
export function isTaggedProvider(x: { provider?: Provider } | null | undefined): boolean {
  const p = providerOf(x);
  return p === 'codex' || p === 'cursor';
}

/**
 * O id de conta tem cara de pasta do Codex (".codex", ".codex-trabalho", ".codex~2", "demo:.codex")? Só para quando a
 * conta já não está no snapshot (ex.: histórico, "Meu dia"): com a conta à mão, vale o `provider` dela.
 */
export function looksLikeCodexId(id: string): boolean {
  return /(?:^|[:/\\])\.?codex(?:[-_.~]|$)/i.test(id);
}

/** Id com cara de pasta do Cursor (".cursor", ".cursor-trabalho", "demo:.cursor"). */
export function looksLikeCursorId(id: string): boolean {
  return /(?:^|[:/\\])\.?cursor(?:[-_.~]|$)/i.test(id);
}

/** Ferramenta da conta: a do snapshot; sem ela, a dica de quem chamou ou o jeito do id. */
export function accountProvider(account: Pick<AccountInfo, 'provider'> | undefined, fallbackId = '', hint?: Provider): Provider {
  if (account) return providerOf(account);
  if (hint) return hint;
  if (looksLikeCodexId(fallbackId)) return 'codex';
  if (looksLikeCursorId(fallbackId)) return 'cursor';
  return 'claude';
}

/**
 * Letra do chip de uma conta que não está no snapshot: a primeira letra depois do prefixo da pasta
 * (".claude-conta2" -> "C", ".codex-trabalho" -> "T"). A pasta padrão do Codex (".codex") vira "X"; a do Cursor
 * (".cursor") vira "R"; a do Claude Code, "?" (como antes). Nunca devolve "." nem vazio.
 */
export function fallbackShort(id: string, provider: Provider = accountProvider(undefined, id)): string {
  const rest = id
    .replace(/^.*:/, '')
    .replace(/~\d+$/, '')
    .replace(/^\.?(?:claude|codex|cursor)(?=[-_.]|$)[-_.]?/i, '');
  const letter = /[\p{L}\p{N}]/u.exec(rest)?.[0];
  if (letter) return letter.toUpperCase();
  if (provider === 'codex') return 'X';
  if (provider === 'cursor') return 'R';
  return '?';
}

/** Selo ao lado do nome da conta (não repete quando o nome já diz a ferramenta). */
export function showsProviderTag(provider: Provider, accountName = ''): boolean {
  if (provider === 'codex') return !/codex/i.test(accountName);
  if (provider === 'cursor') return !/cursor/i.test(accountName);
  return false;
}

/** Texto do selo (Codex / CURSOR); vazio para Claude Code. */
export function providerTagText(provider: Provider): string {
  return provider === 'codex' || provider === 'cursor' ? PROVIDER_TAG[provider] : '';
}

/** Rótulo do chip da conta (dica e leitores de tela): "Conta C (dev@x.com)", "Codex · plano Team", "Cursor". */
export function accountChipLabel(account: Pick<AccountInfo, 'name' | 'email' | 'plan' | 'provider'> | undefined, fallbackId: string, provider: Provider): string {
  if (!account) {
    if (!fallbackId) return tr('Conta desconhecida');
    return provider === 'claude' ? fallbackId : `${fallbackId} · ${PROVIDER_NAME[provider]}`;
  }
  if (provider === 'claude') return `${account.name}${account.email ? ` (${account.email})` : ''}`;
  const tag = showsProviderTag(provider, account.name) ? ` · ${PROVIDER_TAG[provider]}` : '';
  return `${account.name}${tag}${account.plan ? tr(' · plano {0}', [account.plan]) : ''}`;
}

/**
 * Texto do escritório vazio. Os atalhos ("atalhos c ou d") são só das contas do Claude Code, que vêm de aliases do
 * shell (a letra de uma conta do Codex/Cursor não é um atalho).
 */
export function emptyOfficeHint(accounts: readonly Pick<AccountInfo, 'short' | 'provider'>[]): string {
  const keys = shortcutHint(accounts.filter((a) => !isTaggedProvider(a)));
  const hasCodex = accounts.some(isCodex);
  const hasCursor = accounts.some(isCursor);
  const keyPart = keys ? ` (${keys})` : '';
  if (hasCodex && hasCursor) return tr('Abra o Claude Code{0}, o Codex ou o Cursor em qualquer projeto e veja seu agente chegar.', [keyPart]);
  if (hasCodex) return tr('Abra o Claude Code{0} ou o Codex em qualquer projeto e veja seu agente chegar.', [keyPart]);
  if (hasCursor) return tr('Abra o Claude Code{0} ou o Cursor em qualquer projeto e veja seu agente chegar.', [keyPart]);
  return tr('Abra o Claude Code em qualquer projeto{0} e veja seu agente chegar.', [keyPart]);
}

/** Algum pedido de permissão do Codex esperando: o prazo é curto e o cartão conta os segundos (relógio de 1 s). */
export function hasCodexPermission(snap: Pick<OfficeSnapshot, 'agents'> | null): boolean {
  return !!snap?.agents.some((a) => a.permission && isCodex(a.permission) && a.status !== 'offline' && a.status !== 'done');
}

/** Como ver o Codex ao vivo e aprovar pelo escritório (gaveta de um agente do Codex e ajuda). */
export const CODEX_LIVE_HINT = tr('Para ver o Codex ao vivo e aprovar pelo escritório: `npm run codex:install` e aprove os hooks em `/hooks` no Codex.');

/** Como ver o Cursor ao vivo no escritório. */
export const CURSOR_LIVE_HINT = tr('Para ver o Cursor ao vivo: `npm run cursor:install` (hooks em ~/.cursor/hooks.json).');

/** Políticas de aprovação do Codex (`approval_policy`), quando o servidor as manda no lugar do modo de permissão. */
const CODEX_APPROVALS: Record<string, string> = {
  untrusted: tr('Pergunta antes de quase tudo'),
  'on-request': tr('Pergunta quando precisa'),
  'on-failure': tr('Pergunta quando um comando falha'),
  never: tr('Nunca pergunta'),
};

/** Aprovação de um agente do Codex em português (valor desconhecido passa como veio). */
export function codexApprovalLabel(policy: string | undefined): string {
  if (!policy) return '—';
  return CODEX_APPROVALS[policy] ?? policy;
}
