# ADR-022 — Ações com efeito só por POST com o segredo da CLI (CSRF, auditoria M1)

- **Status:** Aceito · 2026-09-15 · decisão do orquestrador sobre o achado M1 da auditoria (sem mudar decisão do usuário) · risco residual aceito

## Contexto
O web app roda como o dono (`MYSELF` + `USER_DEPLOYING`). Até aqui, `eval`, `poc`, `enable`,
`disable` e `drain` eram GET. Um link ou uma imagem numa página qualquer, aberta pelo dono logado
no Google, podia disparar essas ações com os cookies dele (CSRF).

## Decisão
1. **GET só lê:** `health`, `trace`, `live`, `runs`, `limits`, `usage` e `models`. Ação com efeito
   no GET responde `405` sem efeito.
2. **POST com segredo:** o `doPost` exige `CLI_SECRET` no corpo, comparado em tempo constante
   (`src/cli.ts`). Sem o segredo, ou com o segredo errado, responde `403` sem efeito. A tela usa
   `google.script.run`, que não é CSRF-ável, e não precisa do segredo.
3. **Segredo:** gerado no PC pelo `./gasclaw up` (`openssl rand -hex 32`), guardado em `.env.local`
   (gitignored, `chmod 600`, nunca em `gasclaw.env`) e registrado no web app com `setsecret`.
   Token e segredo vão pelo stdin do `curl` (`--config -`), nunca no argv nem na URL.
4. **`eval`** valida o modelo pedido com `validateChoice`. **POCs** só respondem no build do dev (`__DEV__`).

## Risco residual (aceito)
O primeiro `setsecret` grava sem exigir segredo: antes do primeiro `up`, um POST forjado feito com a
sessão do dono poderia registrar outro segredo. Mitigação mínima, sem mecanismo novo:
- (a) o `up` registra o segredo **logo depois do deploy**, antes de qualquer outra chamada;
- (b) o painel mostra "segredo da CLI registrado em <data/hora>" e o botão **Redefinir segredo**
  (só o dono, por `google.script.run`); o próximo `up` registra de novo;
- (c) com um segredo já gravado, `setsecret` com outro valor responde `403` e não sobrescreve.

## Consequências
- `./gasclaw poc`, `eval` e `down` passam a falhar com uma mensagem clara até o primeiro `up` registrar o segredo.
- Pendente: o código das POCs ainda vai no bundle de prod, desligado por `__DEV__`. Tirá-lo do bundle fica registrado no PROGRESS.
