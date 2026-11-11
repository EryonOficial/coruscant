# Env cookbook

**Atualizado:** 2026-11-11

## Fluxo

1. `cp .env.example .env`
2. Preencher pelo menos o bloco **Login Discord**
3. Servidor e Compose leem `.env`; variáveis já no shell **vencem** o arquivo
4. Schema Zod no servidor (`server/env.ts` / config) — listas tipo allowlist aceitam CSV

## Discord (obrigatório neste fork)

| Variável | Uso |
|----------|-----|
| `HABBLAUD_DISCORD_CLIENT_ID` | OAuth2 client id |
| `HABBLAUD_DISCORD_CLIENT_SECRET` | OAuth2 secret |
| `HABBLAUD_DISCORD_ALLOWED_IDS` | IDs Discord permitidos (vírgula) |
| `HABBLAUD_DISCORD_REDIRECT_URI` | Opcional; padrão `http://127.0.0.1:<porta>/auth/discord/callback` |
| `HABBLAUD_HOOK_TOKEN` | Bearer para hooks/mod/bridge |

Sem client/secret/IDs → escritório **bloqueado** (tela explicando config).  
Sem `HABBLAUD_HOOK_TOKEN` → UI pode logar, mas hooks/mod ficam 401 no gate (log de aviso no boot).

### Redirect no Discord Developer Portal

Cadastre **exatamente** a URI usada pelo servidor.  
`http://127.0.0.1:4747/...` e `http://localhost:4747/...` são **apps diferentes** para o Discord.  
Se o browser abre em um host e o `redirect_uri` manda outro → `invalid redirect_uri`.

Gerar um token forte para hooks, por exemplo:

```bash
openssl rand -hex 32
```

Coloque o mesmo valor em `.env` e rode o install de hooks para gravar nos ambientes dos agentes.

## Outras vars frequentes

Ver tabela completa no `README.md` / `.env.example`:

- Rede: `HABBLAUD_PORT`, `HABBLAUD_HOST`, `HABBLAUD_BIND`, `HABBLAUD_ALLOWED_HOSTS`
- Fontes: `HABBLAUD_CURSOR`, `HABBLAUD_CURSOR_DIRS`, `HABBLAUD_CODEX*`, `HABBLAUD_CLAUDE*`
- Remoto: `HABBLAUD_REMOTE_*` (`npm run remote:setup`)
- World: `HABBLAUD_WORLD*`

## Checklist ao adicionar env nova

1. `.env.example` (comentado + comentário PT)
2. Schema Zod + tipo em config
3. README (EN) e `README.pt-BR.md` se a tabela pública mudar
4. `memory-bank/env.md` se for grupo novo (ex.: auth)
5. Install scripts (hooks) se a var precisar ir para o ambiente do agente
