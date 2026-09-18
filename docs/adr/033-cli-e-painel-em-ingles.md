# ADR-033 — A vitrine em inglês: CLI e painel

Status: **Aceito**
Data: 2026-09-18
Emenda: amplia a exceção de idioma do [ADR-011](011-licenca-e-docs-da-comunidade.md)

## Contexto

O ADR-011 abriu uma exceção de idioma para `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` e
`LICENSING.md`: inglês, por serem a porta de entrada da comunidade. O `CLAUDE.md` mantém a regra geral —
conteúdo em pt-BR, identificadores de código em inglês.

Só que a **porta de entrada de verdade não é o README**: é o que aparece na tela de quem rodou
`./gasclaw`. Um projeto com README em inglês e CLI em português é incoerente para quem chega de fora, e a
incoerência aparece no pior momento — durante o setup, quando a pessoa ainda está decidindo se vale a pena.

## Decisão

Toda saída para humano da CLI e do painel é em **inglês**. **Comentário de código continua em pt-BR**, que
é regra do `CLAUDE.md` e não muda.

A fronteira é "o que sai para humano", não "o que está no arquivo". Por isso a trava lê apenas o conteúdo
entre aspas das linhas e o heredoc do `help`: comentário no fim da linha fica de fora, senão o teste viraria
uma trava *contra* a regra do `CLAUDE.md`.

## Consequências

- `test/cliLanguage.test.ts` reprova português na saída da CLI.
- **A primeira trava era uma peneira.** Ela era uma lista de palavras, e lista de palavras só pega o que
  alguém já escreveu e lembrou de listar. Num ataque com 26 frases novas em português, sem um acento
  sequer, **24 passaram**. O detector foi refeito sobre **morfologia** — gerúndio (`-ando/-endo/-indo`),
  `-cao/-coes`, `-mente`, `-agem`, `-ncia`, `-ivel/-avel`, particípio e pretérito — que generaliza para
  palavra que ninguém listou, com lista de exceção para o inglês que cai nas mesmas terminações
  (`travel`, `tornado`). Ao ser religada, a trava nova achou português de verdade ainda em produção
  (`web app respondeu HTTP %s`), que a antiga deixava passar.
- As 21 frases do ataque ficam no autoteste como corpus de regressão. **Um detector que ninguém ataca
  apodrece**: se ele parar de detectar, passa a aprovar tudo em silêncio, que é pior que não ter teste.
- Palavras que colidem com inglês (`no`, `a`, `e`, `os`, `com` — esta casaria dentro de qualquer
  `@gmail.com`) ficam **fora** da lista de propósito. É uma lacuna conhecida e aceita: preferimos deixar
  passar a acusar inglês legítimo e transformar a trava em ruído.
