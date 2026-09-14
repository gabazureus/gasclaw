# Runbook — setup inicial (uma única vez, ~15 min)

`./gasclaw up` conduz tudo isto e pausa em cada item manual. Esta página explica o que cada
passo faz, para o caso de algo falhar.

## 1. Ferramentas (automático)
`up` verifica e instala: Node ≥ 20, `gcloud` (brew cask `google-cloud-sdk`), `clasp` 3.4.1,
`gh`, python3.

## 2. Logins (você clica no navegador)
```bash
gcloud auth login
```
```bash
clasp login
```
```bash
gh auth login
```

## 3. Apps Script API da sua conta
Abra https://script.google.com/home/usersettings e ligue **Google Apps Script API**.

## 4. Admin console (Super Admin, uma vez)
- **Segurança → Acesso e controle de dados → Controles de API → Gerenciar acesso de apps de
  terceiros:** marque o OAuth client do gasclaw, o clasp e o gcloud como **Confiável**.
- **Segurança → Controle de sessão do Google Cloud:** ligue **Exempt trusted apps**.
- Se **URL Fetch allowlist** estiver ativa: libere `openrouter.ai`.

## 5. Vincular o projeto GCP ao script (sem API para isso)
`up` abre as configurações do projeto Apps Script e mostra o número do projeto GCP.
Em **Configurações do projeto → Projeto do Google Cloud → Alterar projeto**, cole o número.
`up` detecta o vínculo e continua.

## 6. Chave do OpenRouter
`up` cria `.env.local` (fora do git). Preencha:
```
OPENROUTER_API_KEY=
```

## 7. Primeiro agente
`up` abre a tela gasclaw. Crie uma pasta no Shared Drive `gasclaw`, cole a URL, clique
**Verificar**. No Google Chat, procure o app **gasclaw** e mande "oi".

## Problemas comuns
| Sintoma | Causa | Correção |
|---|---|---|
| `admin_policy_enforced` no login | app não confiável | passo 4 |
| `invalid_grant` no CI | token expirou (session control / consent Testing) | passo 4 e `./gasclaw doctor` |
| `clasp run` → NOT_FOUND | GCP não vinculado | passo 5 |
| Chat não responde | app não publicado para o domínio | `./gasclaw doctor` |
