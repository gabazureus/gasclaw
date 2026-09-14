# Como usar o gasclaw

## 1. O que é
O gasclaw roda agentes de IA **100% dentro do Google Apps Script**, sem servidor.
Cada agente é **uma pasta do Google Drive** com arquivos markdown, e você conversa com ele pelo **Google Chat**.
O seu computador só compila (TypeScript → JS) e publica. O modelo de IA vem do **OpenRouter**.

## 2. Setup inicial (uma vez)

```bash
./gasclaw up          # dev
./gasclaw up --prod   # prod (uma vez, depois do dev)
```

O `up` instala o que falta (Node, gcloud, gh, dependências npm), cria o projeto GCP e o script, publica e abre a tela.
Nos passos que não têm API, ele **pausa**, abre a página certa e continua quando você aperta Enter.
Cada passo concluído fica salvo em `gasclaw.env`, então rodar de novo não repete nada.

Passos manuais, na ordem em que aparecem:
1. Login no gcloud e no clasp (o navegador abre).
2. Ligar a **Google Apps Script API** em https://script.google.com/home/usersettings.
3. Configurar a tela de consentimento OAuth como **Interna**, com nome `gasclaw` e o seu e-mail de suporte.
4. Vincular o **número do projeto GCP** ao script: Configurações do projeto → Alterar projeto.
5. Autorizar o web app na primeira abertura (Permitir).
6. Configurar o **Chat app**: nome, desmarcar "complemento do Workspace", conexão pelo ID de implantação e visibilidade no domínio.
7. Criar `.env.local` com `OPENROUTER_API_KEY=sk-or-…`. O `up` copia a chave para a área de transferência, e você cola na tela.

Se algo falhar: [runbooks/setup-inicial.md](runbooks/setup-inicial.md) e `./gasclaw doctor`.

> A chave fica **só** em `.env.local`, que é ignorado pelo git. Nunca a cole em chat, issue ou commit.

## 3. Dia a dia

Todos os comandos aceitam `--prod`; sem a flag, valem para dev. A lista completa sai em `./gasclaw help`.

| Comando | O que faz |
|---|---|
| `./gasclaw up` | configura (se faltar algo), publica e abre a tela |
| `./gasclaw doctor` | diagnostica Node, logins, build/testes, script, deploy, chave e health, e diz como corrigir |
| `./gasclaw status` | mostra ambiente, conta, projeto GCP, URLs do editor e do web app, implantações e health |
| `./gasclaw logs` | mostra os logs ao vivo |
| `./gasclaw down` | pausa todos os agentes (kill switch remoto) |
| `./gasclaw restart` | faz `down` e depois `up` |
| `./gasclaw rollback` | volta a implantação para a versão anterior |
| `./gasclaw open` | abre a tela gasclaw |
| `./gasclaw ship` | publica em prod, na mesma URL (exige ter rodado `up --prod` antes) |

O comando `ci` também existe, mas é usado só pelo GitHub Actions.

### A tela gasclaw
Só o dono acessa a tela (web app `MYSELF`). Ela tem cinco blocos:
- **Status:** mostra 🟢 Ativo ou ⏸ Pausado. O botão **Pausar/Ativar** é o kill switch, igual ao `down`/`up`. Com o gasclaw pausado, o Chat responde "O gasclaw está pausado pelo administrador."
- **Chave OpenRouter:** cole a chave e salve. Ela precisa começar com `sk-or-` e fica guardada nas Script Properties.
- **Agentes:** cole a **URL de uma pasta do Drive** e clique em **Adicionar e verificar**. O agente marcado com ⭐ é o que responde no Google Chat. Use **Tornar padrão** para trocar e **Remover** para tirar da lista (a pasta continua no Drive).
- **Testar:** envia um texto ao agente ⭐ e mostra a resposta, o modelo usado e o tempo em ms.
- **POC P1:** mede uma resposta longa do OpenRouter. O critério é passar de 60 s sem erro.

### Montar a pasta do agente no Drive
Crie uma pasta vazia e adicione a URL dela na tela. Os arquivos que faltarem são criados a partir dos templates, e os que já existem **nunca são sobrescritos**.

| Arquivo | Para quê |
|---|---|
| `AGENTS.md` | regras, com frontmatter de configuração |
| `SOUL.md` | personalidade |
| `IDENTITY.md` | nome e emoji |
| `USER.md` | diretivas sobre quem o agente atende |

Frontmatter do `AGENTS.md` (YAML plano, sem chaves aninhadas):

```yaml
---
model: openrouter/auto        # qualquer id do OpenRouter
users: [voce@dominio.com]     # e-mails que podem falar com o agente
---
```

- O dono sempre tem acesso. Com `users` vazio, só o dono usa o agente.
- Limites: **20.000 caracteres por arquivo** e **60.000 no total**, e o que passar disso é cortado. Arquivo ausente vira `(missing)` no prompt.
- O Chat guarda as últimas **20 mensagens** por agente e espaço, por **6 h**. A resposta é limitada a **1.000 tokens**, porque o Chat espera no máximo 30 s. Se a resposta demorar, troque `model` por um modelo mais rápido.
- Editou a pasta? A próxima mensagem já usa o conteúdo novo, **sem deploy**.
- Na F0 o agente ainda não tem ferramentas: ele só conversa.

## 4. Acompanhar e dirigir o desenvolvimento (devmode)

Abra o Claude Code **dentro de `~/Projects/gasclaw`**. Fora dessa pasta, o `/devmode` não existe.

| Comando | Quando usar |
|---|---|
| `/devmode` (sem nada) | retoma o trabalho em andamento e guia a próxima etapa |
| `/devmode c <comentário>` | trabalho avulso (operação, debug) com as regras aplicadas: causa raiz antes de mudar e evidência antes de dizer "feito" |
| `/devmode do <tarefa>` | executa **uma** tarefa delimitada, com roteamento e verificação |
| `/devmode lean <ideia>` | fluxo completo guiado, com `minimal-code` ativo em cada passo |

Onde acompanhar:
- **[CHANGELOG.md](../CHANGELOG.md):** o que entrou em cada task, com status, commit e desvios. Cada task concluída ganha a sua entrada no mesmo commit.
- **`devmode-dashboard.html`** (na raiz): notas por fase (0–10). Abra no navegador. O hook do devmode o atualiza, e você pode gerar de novo com `python3 .devmode/dashboard.py .`.
- **`bd ready`:** tarefas prontas para começar (memória do Beads, que sobrevive entre conversas).
- **Planos:** [docs/plans/](plans/). Comece pelo [handoff](plans/2026-09-14-handoff.md).
- **Specs:** [docs/specs/](specs/) · **ADRs** (por que decidimos algo): [docs/adr/](adr/README.md).
- **Fases e tracks:** [conductor/tracks.md](../conductor/tracks.md) · **Índice geral:** [docs/README.md](README.md).
