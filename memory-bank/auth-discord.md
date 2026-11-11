# Auth Discord (gate)

**Atualizado:** 2026-11-11

## Modelo

| Quem | Como autentica |
|------|----------------|
| Browser / UI | Cookie HttpOnly `habblaud_discord` após OAuth (allowlist) |
| Hooks, mod, bridge | `Authorization: Bearer <HABBLAUD_HOOK_TOKEN>` |
| Health | `GET /api/health` público |
| OAuth | `/auth/discord`, `/auth/discord/login`, `/auth/discord/callback` públicos |

Código: `server/auth/discord.ts` · wiring em `server/index.ts`.

## Rotas importantes

| Path | Nota |
|------|------|
| `/auth/discord/login` | Tela de entrada (e `LOGIN_PATH` no client) |
| `/login` | Redireciona ao Discord login; na **porta remota** `/login` é a senha remota — não misturar |
| `/auth/discord` | Inicia OAuth (state cookie) |
| `/auth/discord/callback` | Troca code → user; checa allowlist; seta cookie |
| `POST /api/discord/logout` | Limpa sessão Discord |
| `GET /api/access` | Inclui `discord?: { id, username }` quando logado |

## Client

- `client/src/net/access.ts` — `loadAccess`, `discordLogout`, `remoteLogout`, `onAccessChange`
- 401 → `location` para `/auth/discord/login`
- Topbar: botão Sair → modal confirmação → `discordLogout()` (`client/src/ui/topbar.ts`)
- Settings: “Sair do Discord” (sem o mesmo modal, por enquanto)

## Hooks / mod

Scripts de install gravam `HABBLAUD_HOOK_TOKEN` (e URL/porta) no ambiente usado pelos hooks:

- `mod/habblaud*/**`, `mod/habblaud-cursor/hook.mjs`, permissões, mensagens, Codex

Mensagens Claude (`habblaud-mensagens`): headers de `fetch` do plugin precisam ser **literais estáveis** (ver `pitfalls.md`) — Content-Type + Authorization Bearer quando há token.

## Config incompleta

Sem trio client id / secret / allowed IDs → página de bloqueio (ninguém entra).  
Isso é intencional neste fork (gate sempre “ligado”).

## Testes

- `server/auth/discord.test.ts` — sessões, redirect URI, cookies
- `server/auth/discord-gate.test.ts` — HTTP gate (login, callback, Bearer, 401)
