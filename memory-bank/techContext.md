# Tech context

**Atualizado:** 2026-11-11

## Stack

| Item | Escolha |
|------|---------|
| Runtime | Node.js ≥ 22.12 (também `bun run start` / `bun run dev` ok no dia a dia) |
| Server | TypeScript → bundle (`scripts/build-server.mjs`); Zod empacotado |
| Client | Vite + TS; canvas pixel + DOM UI |
| Shared | Tipos, i18n, demo, world |
| Testes | Vitest |
| i18n | `tr()` + `shared/locales/` |
| Auth | Discord OAuth2 (cookie HMAC) + Bearer hook token |
| Docker | Compose; imagem sem `node_modules` runtime |

## Comandos úteis

```bash
cp .env.example .env          # preencher Discord + HOOK_TOKEN
npm install
npm run dev                   # server watch
npm run dev:client            # Vite (outro terminal, se precisar)
bun run start                 # serve dist (após build) — comum no WSL deste fork
npm run typecheck
npm test
npm run build
npm run i18n:check
npm run hooks:install         # grava token/URL nos hooks
npm run cursor:install        # se existir script de hooks Cursor
```

**Gate de saída do agente (código):** `typecheck` + testes relevantes + `i18n:check` se tocou `tr()`; `build` se for mudança de release/Docker.

## Pastas quentes (fork)

| Caminho | Assunto |
|---------|---------|
| `server/auth/discord.ts` | Gate OAuth, login HTML, cookie, Bearer |
| `server/env.ts` / config | Zod Discord / hook token / redirect URI |
| `server/sources/cursor/` | Fonte Cursor + live presence |
| `server/cursor/http.ts` | Endpoint de eventos Cursor |
| `mod/habblaud-cursor/hook.mjs` | Hook Cursor → Bearer |
| `mod/habblaud*/**` | Hooks Claude/Codex/mensagens/permissões + token |
| `mod/claude-code.d.ts` | Stub de tipos `claude-code` para o editor |
| `client/src/net/access.ts` | AccessInfo + logout Discord/remote |
| `client/src/ui/topbar.ts` | Botão Sair + modal confirmação |
| `client/src/ui/settings.ts` | Sair / Sair do Discord (settings) |
| `.env.example` | Documentação das vars |

## Porta padrão

`4747` em `127.0.0.1`. Redirect Discord padrão: `http://127.0.0.1:4747/auth/discord/callback` (**127.0.0.1 ≠ localhost** no Discord Developer Portal).
