# Active context

**Atualizado:** 2026-11-11

## Foco

Fork Coruscant do Habblaud. Marca visível na UI (wordmark pixel + placa): **Coruscant** (`Corus` creme + `cant` âmbar).

Fork com:

1. Gate Discord OAuth obrigatório + allowlist + hook Bearer
2. Cursor como terceira fonte de agentes
3. Env Zod / `.env`
4. Logout na topbar com modal de confirmação

Documentação de agente consolidada neste `memory-bank/` + playbook `.cursor/skills/habblaud-playbook/`.

## Como trabalhar daqui

1. Ler `AGENTS.md` + playbook + este arquivo
2. Auth/Discord → `memory-bank/auth-discord.md` + `env.md`
3. Cursor → `memory-bank/agents-cursor.md`
4. Armadilhas → `memory-bank/pitfalls.md`
5. Não tocar `shared/world/` / `server/world/` para inventar dados
6. Texto UI → `tr()` + locales + `i18n:check`; mudança visível → `CHANGELOG.md`

## Próximos candidatos (não bloqueantes)

- Unificar logout das Settings com o mesmo modal da topbar
- Limpar chaves i18n “sobrando” (`Habblaud · entrar`, texto do Redirects) se o copy do login Discord mudou de lugar
- Alinhar `CLAUDE.md` ao texto do `AGENTS.md` (Cursor + Zod) — em andamento via ponteiros ao memory-bank
