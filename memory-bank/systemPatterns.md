# System patterns

**Atualizado:** 2026-11-11

## Layout do monólito

| Pasta | Papel |
|-------|--------|
| `server/` | HTTP, WebSocket, fontes de agentes, auth, env Zod, bundle Docker sem `node_modules` |
| `client/` | UI do escritório (canvas + DOM), Vite |
| `shared/` | Tipos, i18n, demo, world (payloads World) |
| `mod/` | Plugins/hooks Claude Code, Codex, Cursor, permissões, mensagens |
| `scripts/` | install hooks, docker-up, i18n-check, assets |

## Auth (camadas)

1. **Discord gate** (`server/auth/discord.ts`) — cookie de sessão OAuth; página `/auth/discord/login`
2. **Bearer hook** — `Authorization: Bearer <HABBLAUD_HOOK_TOKEN>` libera hooks/mod/bridge sem cookie
3. **Remote** (`server/http/remote.ts`) — porta/senha opcional para celular; `/login` remoto ≠ Discord (`/auth/discord/login`)
4. Público residual: `GET /api/health`, rotas OAuth Discord, estáticos de marca/manifest

Detalhes: [`auth-discord.md`](./auth-discord.md).

## Fontes de agentes

Cada provedor implementa `AgentSource` sob `server/sources/`:

- Claude: files/sessions + hooks
- Codex: similar + bridge
- Cursor: **só hooks ao vivo** (`CursorLive` + `POST /api/cursor/events`) — sem locks de sessão em disco

Detalhes Cursor: [`agents-cursor.md`](./agents-cursor.md).

## i18n

- Todo texto visível: `tr('português')` com lacunas `{0}`, `{1}`…
- Chave = texto PT; locales em `shared/locales/{en,es,fr}.ts`
- `npm run i18n:check` — não quebra o build; faltando = mostra PT
- Mudança visível → seção **Não lançado** no `CHANGELOG.md`

## UI

- Componentes em `client/src/ui/` (classes `UiComponent`, `h()` / `iconButton()` em `dom.ts`)
- Ícones pixel: `client/src/ui/icons.ts`
- Diálogos: `<dialog class="ui-dialog">` + `showModal()` (ajuda, daystats, logout confirm)
- Acesso: `client/src/net/access.ts` (`loadAccess`, `discordLogout`, `onAccessChange`)
- 401 → `LOGIN_PATH` = `/auth/discord/login`

## Env

- Schema Zod em `server/env.ts` / config; template `.env.example`
- Shell env vence `.env`
- Cookbook: [`env.md`](./env.md)

## Habblaud World

- Não inventar/inflar dados enviados (`shared/world/`, `server/world/`)
- Ler `shared/world/README.md` e `docs/world/privacidade.md` antes de tocar

## Testes

- Vitest; arquivos `*.test.ts` ao lado do código
- Gate Discord: `server/auth/discord.test.ts`, `discord-gate.test.ts`
- Cursor: `server/sources/cursor/source.test.ts`, `server/test/cursor-*.test.ts`
