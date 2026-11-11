# Progress

**Atualizado:** 2026-11-11

## Feito nesta linha de trabalho (fork)

- [x] Cursor: fonte `server/sources/cursor/`, HTTP events, hook `mod/habblaud-cursor`, install script, docs README
- [x] `.env` / dotenv + campos Discord/hook no schema Zod
- [x] Gate Discord OAuth (`server/auth/discord.ts`): login, callback, cookie, allowlist, página de bloqueio se misconfig
- [x] Bearer `HABBLAUD_HOOK_TOKEN` no gate; hooks/mod/install passam o token
- [x] Client: `AccessInfo.discord`, 401 → login Discord, logout API
- [x] Exceção pública: `GET /api/health` (+ rotas OAuth)
- [x] Fix redirect URI (`127.0.0.1` vs `localhost`) documentado em `.env.example` / README
- [x] `habblaud-mensagens`: headers literais estáveis + Authorization
- [x] Stub `mod/claude-code.d.ts` para tipos no editor
- [x] Topbar: botão Sair + modal “Sair do escritório?”
- [x] Testes gate/Discord/Cursor; i18n das strings novas; CHANGELOG **Não lançado**
- [x] Memory-bank + playbook Cursor skills

## Dívida / follow-ups

- [ ] Modal de confirmação também em Settings › Sair do Discord (opcional)
- [ ] Remover ou religar strings i18n órfãs do login Discord
- [ ] Manter parity `README.md` ↔ `README.pt-BR.md` (e es/fr) quando auth mudar de novo
