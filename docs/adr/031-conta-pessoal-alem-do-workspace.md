# ADR-031 — Conta pessoal (Gmail) além do Google Workspace

Status: **Aceito no código; falta medir numa conta Gmail real**
Data: 2026-09-18
Relacionado: [ADR-008](008-deploy-e-dono.md) (deploy e dono), [ADR-015](015-escopos-oauth.md) (escopos),
[ADR-016](016-painel-de-limites.md) (painel de limites), [ADR-006](006-chat-canal-principal.md) (Chat)

## Contexto

O gasclaw nasceu dentro de um Google Workspace e assumiu isso em três lugares, sem nunca ter declarado
essa dependência:

1. **A URL do web app.** O Apps Script serve o web app de uma conta Workspace em
   `script.google.com/a/macros/<domínio>/s/<id>/exec`. Essa forma **não existe** em conta pessoal. Com
   `DOMAIN=gmail.com` a URL montada apontava para um endereço inexistente e **toda** chamada remota
   falhava. Era o bloqueador: não é que o gasclaw funcionasse mal fora do Workspace — ele não funcionava.
2. **A tela de consentimento OAuth.** `INTERNAL` só existe em Workspace. Numa conta pessoal a única opção é
   `EXTERNAL`, e o dono precisa se adicionar como *test user*, senão o Google recusa a autorização dos
   escopos.
3. **O Google Chat.** App do Chat é recurso de Workspace. Não há equivalente em conta pessoal.

Há ainda uma quarta diferença, que já estava no código (`src/limits.ts`) mas não na documentação: as
**cotas do Apps Script** são menores em conta pessoal.

Excluir quem não tem Workspace é excluir a maioria das pessoas que experimentariam o projeto — e o custo
de suportar, medido acima, é pequeno e localizado.

## Decisão

Suportar conta pessoal, com o tipo da conta deduzido do e-mail e gravado em `ACCOUNT_KIND`.

- **Uma regra, num lugar só.** `kind_of_email` (no `gasclaw`) decide `personal | workspace | unknown`,
  minúsculo antes de comparar. É a mesma regra do `accountKind` em `src/limits.ts`.
- **`script_url` é o único lugar que conhece as duas formas de URL**; `exec_url` e `dev_url` saem dele.
  Ninguém mais escreve o prefixo à mão — inclusive as POCs.
- **`unknown` não é `workspace`.** Sem conta detectada, o menu diz que não sabe, em vez de afirmar um tipo
  que ninguém conferiu.
- **O passo 7 (Google Chat) aparece como indisponível**, não como pendente, em conta pessoal.

## Consequências

- O gasclaw passa a rodar numa conta Gmail comum. O app do Chat continua exigindo Workspace; painel,
  conversa na tela, agentes e ferramentas do Google funcionam nos dois.
- Duas listas para a mesma pergunta já divergiram uma vez (o `case` do `account_kind` conhecia
  `*@GMAIL.COM`, o do `ensure_auth` não; um e-mail com maiúscula gravava `workspace` numa conta Gmail e
  quebrava todas as chamadas). Por isso a regra é uma função só, com teste.
- `test/cliAccount.test.ts` executa o `gasclaw` de verdade e trava as duas formas de URL, o tipo da conta e
  a camada de portabilidade. Antes dele, **nenhum** teste da suíte executava o arquivo bash.

## O que ainda NÃO foi medido

O `CLAUDE.md` exige POC medida para afirmação sobre limite do GAS. Registrando o que aqui é **afirmação
não medida**:

- **Nada disto rodou contra uma conta Gmail real.** O suporte foi exercitado por substituição
  (`ACCOUNT_KIND`, `GASCLAW_OS`) e por teste do arquivo bash. Falta o caminho completo numa conta pessoal:
  consentimento `EXTERNAL` com *test user*, autorização dos escopos, publicação e uma conversa.
- **As cotas da tabela (20.000 UrlFetch/dia, 100 e-mails/dia, 90 min de gatilho) vêm da documentação do
  Google, não de medição no dev.** Estão em `src/limits.ts` desde o ADR-016 e nunca foram confirmadas
  contra o comportamento real. Não invente número a partir delas.

Enquanto essa medição não existir, o status deste ADR permanece "falta medir".
