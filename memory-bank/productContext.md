# Product context

## Problema

Quem usa vários agentes (Claude Code, Codex, Cursor) não vê, num só lugar, quem está trabalhando, esperando permissão, rodando shell ou ocioso.

## Solução

Uma página local (pixel art) + servidor Node que:

- Lê sessões/hooks dos provedores instalados
- Desenha salas e personagens no escritório
- Permite (com bind local / PTY / remote) terminal, permissões, mensagens e “Novo agente”
- Opcionalmente publica o prédio no **Habblaud World** (dados reais da máquina)

## Experiência de entrada (fork)

1. Abrir `http://127.0.0.1:4747` (ou porta configurada)
2. Se Discord não estiver configurado → tela de bloqueio (não entra ninguém)
3. Se configurado sem sessão → **Entrar com Discord**
4. Só IDs em `HABBLAUD_DISCORD_ALLOWED_IDS` passam
5. Hooks/mod usam Bearer `HABBLAUD_HOOK_TOKEN` (não passam pelo cookie do browser)
6. **Sair** na barra superior → modal “Sair do escritório?” → logout Discord → volta ao login

## Idiomas

Português é a língua de origem (`tr('…')`). Traduções: `en` / `es` / `fr` em `shared/locales/`. UI segue browser ou Configurações › Idioma; textos do servidor seguem `HABBLAUD_LANG`.
