# Cursor no escritório

**Atualizado:** 2026-11-11

## Ideia

Cursor (Agent Chat) aparece no mesmo escritório com a tag **CURSOR**, como Claude e Codex.

## Como funciona

- Detecção de contas: `server/sources/cursor/accounts.ts` (`~/.cursor`, `CURSOR_HOME`, `HABBLAUD_CURSOR_DIRS`)
- Presença **só por hooks** — o Cursor não expõe locks/sessões em disco como o Claude Code
- Live: `server/sources/cursor/live.ts` + fonte `server/sources/cursor/source.ts`
- HTTP: `server/cursor/http.ts` → `POST /api/cursor/events` (protegido pelo gate: cookie Discord **ou** Bearer hook)
- Hook: `mod/habblaud-cursor/hook.mjs` (envia eventos; inclui Bearer se `HABBLAUD_HOOK_TOKEN` existir)
- Install: `scripts/cursor-install.ts` (+ testes em `server/test/cursor-install.test.ts`)

## Env

| Var | Padrão | Nota |
|-----|--------|------|
| `HABBLAUD_CURSOR` | on | `0` desliga a fonte |
| `HABBLAUD_CURSOR_DIRS` | auto | Pastas separadas por vírgula |
| `HABBLAUD_HOOK_TOKEN` | — | Obrigatório na prática para o hook passar o gate |

## UX / limites

- Após install: reiniciar Cursor ou conferir **Settings › Hooks**
- Presença: evento segura o agente por ~60s (`HOOK_PRESENCE_MS`); `sessionEnd`/`stop` com grace curto
- Mostra presença, status, atividade; profundidade de features pode ser menor que Claude (sem PTY nativo Cursor no Habblaud)

## README

Seção “Cursor in the office” no `README.md` / equivalente PT.
