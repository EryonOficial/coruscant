# Project brief — Habblaud (fork Coruscant)

**Produto:** Habblaud — escritório virtual em pixel art que mostra, em tempo real, o que os agentes de IA estão fazendo.

**Este repositório:** fork **Coruscant** (`EryonOficial/coruscant` / pasta local `coruscant`), baseado no Habblaud upstream (`marmottajr/habblaud`). Pacote npm ainda se chama `habblaud` (v1.0.3).

**Agentes no escritório:**

1. **Claude Code** (hooks + sessions nos dirs `~/.claude*`)
2. **Codex** (hooks / bridge)
3. **Cursor** (hooks → `POST /api/cursor/events`; tag **CURSOR**)

**Pilares do fork (sessão recente):**

- Login **Discord OAuth obrigatório** (allowlist de IDs) antes de ver o escritório
- `HABBLAUD_HOOK_TOKEN` (Bearer) para hooks/mod/bridge atravessarem o gate
- Cursor como terceira fonte de agentes
- Env validado com **Zod** + `.env` / dotenv
- UI: botão **Sair** na barra superior com modal de confirmação

**Fora do escopo habitual de contribuição “livre”:** inventar dados enviados ao Habblaud World (`shared/world/`, `server/world/`) — ver aviso em `AGENTS.md` e `shared/world/README.md`.

**Fontes para o agente:** `AGENTS.md` · `.cursor/skills/habblaud-playbook/` · este `memory-bank/` · `CONTRIBUTING.md` · `README.md` / `README.pt-BR.md`.
