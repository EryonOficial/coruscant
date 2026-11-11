# Instalar o Habblaud (completo, sem Docker)

Instale o **Habblaud** na minha máquina (**não neste projeto**), rodando com Node.js como um serviço, e deixe tudo funcionando e configurado para os meus agentes: **Claude Code**, **Codex**, **Cursor** — os que eu usar.

- **Repositório:** https://github.com/EryonOficial/coruscant
- **Pasta:** `~/habblaud` (no Windows, dentro do WSL)
- **Endereço final:** https://habblaud.localhost
- **Sistemas:** macOS, Linux e Windows
- **Agentes:** Claude Code, Codex e/ou Cursor (conecte os que eu usar)

## Regras

- Este prompt vale igual no **Claude Code**, no **Codex** e no **Cursor**: siga do mesmo jeito em qualquer um.
- Faça tudo sozinho, na ordem abaixo. Só me interrompa para pedir permissão.
- Se o sandbox ou as permissões bloquearem algo (rede, pastas fora deste projeto, serviços do sistema, `sudo`), peça a minha aprovação para rodar fora dele. Nunca pule um passo por isso.
- Instale sempre a versão **completa**, sem opções reduzidas (nada de `--sem-permissoes` ou `--sem-mensagens`).
- Se algo der erro, leia o README do repositório, corrija e continue até tudo funcionar.

## 0. Descubra o sistema e os agentes

### Sistema

Detecte o sistema operacional e a arquitetura (`uname -sm`; no Windows, `$env:OS` e `[Environment]::OSVersion`) e **adapte todo o fluxo abaixo a ele**. Os comandos estão em bash: traduza para o shell do sistema quando precisar.

- **macOS** (Intel ou Apple Silicon): roda direto, usando o Homebrew.
- **Linux** (Ubuntu, Debian, Fedora, Arch…): roda direto, usando o gerenciador de pacotes da distro (`apt`, `dnf`, `pacman`…).
- **Windows 10/11**: roda pelo **WSL2**, com o Habblaud **dentro do Ubuntu do WSL**.
  - Sem WSL: `wsl --install -d Ubuntu` no PowerShell como administrador. Se pedir para reiniciar, pare e me explique em "Sua vez" que basta reiniciar e colar este mesmo prompt de novo.
  - Comandos do Windows (instalar programas, firewall, tarefas no login) rodam no PowerShell; os do Habblaud rodam no WSL (`wsl -d Ubuntu -- bash -lc "..."`).
- **Qualquer outra situação**: use o equivalente mais próximo e siga em frente. O resultado final precisa ser sempre o mesmo.

### Agentes

Descubra quais agentes eu uso e conecte **todos** os que existirem:

- **Claude Code:** `claude --version` ou pastas `~/.claude*` (e `CLAUDE_CONFIG_DIR`).
- **Codex** (CLI ou app): `codex --version` ou pastas `~/.codex*` (e `CODEX_HOME`).
- **Cursor:** pasta `~/.cursor` (e `CURSOR_HOME`), ou no Windows `%USERPROFILE%\.cursor`.
- Se só um existir, siga só com ele: não instale os outros. Se nenhum existir, pare e me diga.
- **Windows:** se o Claude Code, o Codex ou o Cursor rodam nativos no Windows (`%USERPROFILE%\.claude`, `%USERPROFILE%\.codex`, `%USERPROFILE%\.cursor`), aponte o Habblaud para essas pastas (no WSL: `/mnt/c/Users/<usuário>/...`) com `HABBLAUD_CLAUDE_DIRS`, `HABBLAUD_CODEX_DIRS` e `HABBLAUD_CURSOR_DIRS` no ambiente do serviço, como o README descreve, e garanta que o mod e os hooks sejam instalados nessas mesmas pastas.

## Passo a passo

### 1. Ferramentas

- Confira `git` e **Node.js 22.12+** (`node --version`). Instale ou atualize o que faltar:
  - **macOS:** pelo Homebrew (instale o Homebrew antes, se faltar).
  - **Linux:** pelo `nvm` ou pelo gerenciador de pacotes.
  - **Windows:** dentro do WSL, pelo `nvm`.
- **Claude Code** (se eu uso): **2.1.287+** (`claude --version`); atualize se for mais antigo.
- **Codex** (se eu uso): atualize para a versão mais recente, do mesmo jeito que ele foi instalado (npm `@openai/codex` ou Homebrew).

### 2. Baixar e compilar

- `git clone https://github.com/EryonOficial/coruscant.git ~/habblaud`
- `cd ~/habblaud && npm install && npm run build`

### 3. Deixar sempre ligado

- Crie um serviço que rode `npm start` nessa pasta, que reinicie se cair e suba sozinho no login, com no ambiente:
  - o Node 22.12+ no `PATH`;
  - se eu uso o Codex: o `codex` alcançável (a pasta dele no `PATH` ou `HABBLAUD_CODEX_BIN` com o caminho completo), porque sem Docker é o próprio Habblaud que entrega as mensagens ao Codex.
- Por sistema:
  - **macOS:** um LaunchAgent.
  - **Linux:** um serviço systemd de usuário (com `loginctl enable-linger`).
  - **Windows:** um serviço systemd de usuário no WSL (ative `systemd=true` em `/etc/wsl.conf` e rode `wsl --shutdown` uma vez) e uma tarefa no Agendador de Tarefas que inicia o WSL no login e o mantém ligado.
- Ative e inicie o serviço.

### 4. Conectar o Claude Code (se eu uso)

- `npm run mod:install`, **sem flags**: instala o mod `habblaud` e os plugins `habblaud-permissoes` e `habblaud-mensagens` em todas as minhas contas do Claude Code.
- Confira com `npm run mod:status` que os três estão instalados e ligados em todas as contas.

### 5. Conectar o Codex (se eu uso)

- `npm run codex:install`, **sem flags**: acrescenta os hooks do Habblaud no `hooks.json` de cada pasta do Codex (com backup; os outros hooks ficam).
- Confira com `npm run codex:status`. Se ele avisar sobre o Node do shell de login, corrija como a mensagem indica e rode `npm run codex:install` de novo.
- Sem Docker não precisa do `codex:bridge`: o serviço do passo 3 já entrega as mensagens.
- Não tente aprovar os hooks por mim nem mexer no `config.toml` do Codex: ele só aceita essa aprovação dentro dele, em `/hooks`. Isso fica para mim, em "Sua vez".

### 6. Conectar o Cursor (se eu uso)

- `npm run cursor:install`, **sem flags**: acrescenta os hooks do Habblaud no `hooks.json` de cada pasta do Cursor (com backup; os outros hooks ficam).
- Confira com `npm run cursor:status`.
- Reinicie o Cursor (ou confira Settings › Hooks) para carregar os hooks. Nesta versão o escritório mostra presença/atividade/subagentes; ainda não há aprovação de permissões nem “Mandar mensagem” para o Cursor.

### 7. Endereço bonito (portless)

- `npm install -g portless` e `portless alias habblaud 4747` (no Windows, dentro do WSL).
- O Habblaud já aceita endereços `*.localhost`: não mude nada nele.
- Garanta que o proxy do portless suba sozinho no login (do mesmo jeito do passo 3) e confie no certificado local se ele pedir (no Windows, também no Windows, para o navegador aceitar).

### 8. Testar

- `http://localhost:4747/api/health` responde, com o terminal, o responder e as mensagens pelo escritório ligados, e mostra as contas do Claude Code, do Codex e/ou do Cursor que eu uso (`cursorEvents: true` se o Cursor estiver ligado).
- https://habblaud.localhost abre o escritório (no Windows, teste no navegador do Windows).

## Quando terminar, me responda assim

1. **Pronto:** o endereço para abrir, o sistema detectado e os agentes conectados (Claude Code, Codex, Cursor ou a combinação).
2. **Sua vez** (só se for necessário): se ficou algo que só eu posso fazer, como digitar a senha do computador, reiniciar, autorizar algo nas configurações do sistema ou rodar um comando no terminal, liste cada ação em passos numerados, com o comando exato para copiar. **Se conectou o Codex, inclua sempre:** feche o Codex que estiver aberto (inclusive esta conversa, se ela for no Codex), abra de novo, digite `/hooks` e aprove os hooks do Habblaud. **Se conectou o Cursor, inclua:** reinicie o Cursor (ou confira Settings › Hooks). Se não ficou nada, pule esta parte.
3. **Como usar:** abrir o Claude Code, o Codex ou o Cursor em qualquer projeto e ver o agente chegar (os do Codex com o selo CODEX, os do Cursor com CURSOR, a partir da primeira mensagem / dos hooks); clicar num personagem para ver o que ele faz (tecla `T` abre o terminal); aprovar pedidos pelo escritório quando o agente for Claude/Codex (tecla `P`); mandar mensagens na caixa **Mandar mensagem** (Claude/Codex); ver o Meu dia (tecla `M`); modo demonstração com `?mock=1`; e rodar `/reload-plugins` nas sessões do Claude Code que já estavam abertas.
4. **Manutenção:** os comandos para ver o status, ver os logs e reiniciar o serviço no meu sistema, e o lembrete de que cada atualização pede `npm run build`, reiniciar o serviço, `npm run mod:install`, `npm run codex:install` e `npm run cursor:install` conforme os agentes que eu uso.

Seja curto e direto.
