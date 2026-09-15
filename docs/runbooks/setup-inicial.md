# Runbook — setup inicial (uma única vez, ~15 min)

`./gasclaw up` conduz tudo isto e pausa em cada item manual; o passo a passo com os cliques está em
[como-usar.md §2](../como-usar.md#2-publicar-pela-primeira-vez). Esta página explica o que cada passo faz,
para o caso de algo falhar.

## 1. Ferramentas (automático)
`up` exige o Homebrew e instala o que falta: Node e `gcloud` (cask `google-cloud-sdk`). O `clasp` vem
pinado no `package.json` (`npm ci`). O `gh` não é necessário enquanto a publicação pelo GitHub/CI estiver
adiada (Task 10, `gasclaw-mw8`).

## 2. Logins (você clica no navegador)
```bash
gcloud auth login --enable-gdrive-access
```
```bash
npx clasp login
```
O `--enable-gdrive-access` é o que deixa o CLI chamar o web app (`status`, `poc`, `trace`, `eval`).

## 3. Apps Script API da sua conta
Abra https://script.google.com/home/usersettings e ligue **Google Apps Script API**.

## 4. Admin console (Super Admin, uma vez, só se o domínio restringir apps)
- **Segurança → Acesso e controle de dados → Controles de API → Gerenciar acesso de apps de
  terceiros:** marque o OAuth client do gasclaw, o clasp e o gcloud como **Confiável**.
- **Segurança → Controle de sessão do Google Cloud:** ligue **Exempt trusted apps**.
- Se **URL Fetch allowlist** estiver ativa: libere `openrouter.ai`.

## 5. Vincular o projeto GCP ao script (sem API para isso)
`up` abre as configurações do projeto Apps Script e mostra o número do projeto GCP.
Em **Configurações do projeto → Projeto do Google Cloud → Alterar projeto**, cole o número.
`up` detecta o vínculo e continua.

## 6. Chave do OpenRouter
Crie `.env.local` na raiz do projeto (fica fora do git) com:
```
OPENROUTER_API_KEY=sk-or-...
```
O `up` avisa se o arquivo faltar. No fim, ele copia a chave para a área de transferência para você colar
na tela gasclaw.

## 7. Reautorização quando entram escopos novos
Quando o `appsscript.json` ganha escopos ([ADR-015](../adr/015-escopos-oauth.md)), abra a tela gasclaw uma
vez e clique em **Permitir**. Até lá, o gatilho de 1 min, os processos e o Monitoring aparecem como
"aguardando autorização" ou "pendente" no painel de limites.

## 8. Primeiro agente
`up` abre a tela gasclaw. Escreva um nome e clique em **Novo agente** (cria `Meu Drive/gasclaw/agentes/<nome>/`)
ou cole a URL de uma pasta em **Usar pasta existente**. No Google Chat, procure o app **gasclaw dev**
(ou **gasclaw** em prod) e mande "oi".

## Problemas comuns
| Sintoma | Causa | Correção |
|---|---|---|
| `admin_policy_enforced` no login | app não confiável | passo 4 |
| `invalid_grant` no CI | token expirou (session control / consent Testing) | passo 4 e `./gasclaw doctor` |
| `clasp run` → NOT_FOUND | GCP não vinculado | passo 5 |
| `status` sem health remoto | login do gcloud sem acesso ao Drive | passo 2 |
| Painel: "aguardando autorização" | escopo novo ainda não autorizado | passo 7 |
| Chat não responde | app não publicado para o domínio | `./gasclaw doctor` |
