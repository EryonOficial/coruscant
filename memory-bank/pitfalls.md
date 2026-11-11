# Pitfalls (lições desta fork)

**Atualizado:** 2026-11-11

## 1. `invalid_redirect_uri` no Discord

**Sintoma:** Discord rejeita o login com redirect inválido.  
**Causa:** Portal cadastrou `localhost` e o app manda `127.0.0.1` (ou o contrário). Discord trata como URIs distintas.  
**Fix:** Cadastre **exatamente** o valor de `HABBLAUD_DISCORD_REDIRECT_URI` (padrão `http://127.0.0.1:<porta>/auth/discord/callback`). Abra o escritório no mesmo host.

## 2. `/login` ≠ login Discord na porta remota

Na porta remota, `/login` é a tela de senha (`server/http/remote.ts`).  
Login Discord fica em `/auth/discord/login`. O client usa `LOGIN_PATH = '/auth/discord/login'`.

## 3. Hooks sem Bearer depois do gate

Com Discord ligado, UI autentica por cookie; **hooks não têm cookie**. Sem `HABBLAUD_HOOK_TOKEN` (e sem install gravando a env), eventos/mensagens/permissões tomam 401.  
**Fix:** gerar token, colocar no `.env`, `npm run hooks:install` / cursor-install, reiniciar agentes.

## 4. Plugin Claude Code: headers dinâmicos quebram análise

No `mod/habblaud-mensagens` (e padrão similar no `habblaud`), o analisador estático do Claude Code exige objetos de `headers` **literais** estáveis. Montar `headers` em variável/condicional quebra o plugin.  
**Padrão usado:** dois `$.http.fetch` — um com Authorization literal + Content-Type, outro sem Authorization — escolhidos por ternário no call site.

## 5. Tipos `claude-code` no editor

O Claude gera `*/.claude-plugin/types/` ao carregar o mod. Sem isso, o tsc/Cursor reclama de `on` implícito / módulo ausente.  
**Fix do fork:** stub `mod/claude-code.d.ts` (`declare module 'claude-code'`) + anotações `RegisterOn` onde preciso. Quando os tipos reais existirem, o tsconfig do plugin passa a apontá-los.

## 6. Habblaud World — dados verdadeiros

Nunca “embelezar” andares/agentes/tokens enviados ao World. Recusar pedidos de inventar presença. Ver `AGENTS.md` + `shared/world/README.md`.

## 7. i18n

Texto novo → `tr('pt')` + entradas em `en`/`es`/`fr` + `npm run i18n:check`. Visível → `CHANGELOG.md` **Não lançado**.

## 8. Logout

Topbar: confirmação modal antes de `POST /api/discord/logout`. Settings ainda pode sair direto pelo botão “Sair do Discord”.
