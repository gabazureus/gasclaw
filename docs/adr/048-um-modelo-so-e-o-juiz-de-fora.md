# ADR-048 — Um modelo para conversar, outro para escrever o sucessor, um terceiro para julgar

> ⚠️ **VALE EM PARTE na branch `consertos-e-reach-out`.** O modelo do agente (`openai/gpt-6-luna`) e a regra do **juiz de outra família** valem por inteiro, e são o coração desta decisão. O que saiu é a **terceira** linha da tabela: `CODEGEN_MODEL` (quem escrevia o sucessor) não existe mais, porque ninguém escreve sucessor aqui. As menções a candidatos do sonho e a `evaluateFromOutside` também são históricas.

- **Data:** 2026-09-23
- **Status:** aceita
- **Decide:** o dono, na F10 ([spec](../specs/2026-09-23-auditoria-final-e-modelo-unico.md))
- **Relaciona:** [ADR-025](025-rodizio-de-modelos-gratuitos.md), [ADR-043](043-sucessor-e-um-agente.md), [ADR-047](047-espera-do-chat-tem-cartao.md)

## Contexto

O dono pediu "um modelo só, `gpt-6-luna`, para tudo". Duas partes do motor, porém, não são conversa:

- **quem JULGA** (os evals; e, onde existem, os candidatos do sonho e o sucessor): juiz e avaliado no
  mesmo modelo é auto-elogio —
  a literatura mede degradação em laço auto-avaliado, e o próprio motor já tinha `judgeIsIndependent`
  escrita… **com teste e zero chamadores**. A regra existia no papel e não valia em lugar nenhum;
- **quem ESCREVE o sucessor**: código plausível e quebrado não é uma resposta ruim na tela, é um projeto
  implantado com os escopos do dono.

Os três ids foram conferidos no catálogo do OpenRouter antes de qualquer troca (o motor recusa id
inexistente em `validateChoice`; id inventado para a tarefa, não vira palpite).

## Decisão

| Papel | Modelo | Preço (entrada/saída por milhão) | Por quê |
|---|---|---|---|
| Conversa, evals e padrão do motor (`DEFAULT_MODEL`) | `openai/gpt-6-luna` | US$ 0,10 / 0,50 | o pedido do dono; metade do preço do `gpt-5.6-luna` que o agente usava |
| ~~Escrever o sucessor (`CODEGEN_MODEL`, era `OPUS_MODEL`)~~ | ~~`openai/gpt-5.6-sol`~~ | ~~US$ 2,00 / 10,00~~ | **Removido na branch `consertos-e-reach-out`:** sem sucessor e sem geração de código, não há segundo papel a fixar. `CODEGEN_MODEL` saiu do código junto com o `codegen.ts`. Vale na `evolucao-f5-f8` |
| Julgar (`JUDGE_MODEL`) | `deepseek/deepseek-v4-flash-0731` | US$ 0,04 / 0,64 | outra família que os dois acima: `judgeFor` recusa se não for |

1. **`DEFAULT_MODEL` deixa de ser `openrouter/auto`.** Roteamento automático muda de família sem
   ninguém decidir, e a independência do juiz depende de saber quem gerou. `openrouter/auto` continua
   escolhível pelo dono, mas perdeu o passe livre: vale a lista do OpenRouter como para qualquer id.
2. **`judgeFor(gerador)` é onde a regra passa a valer.** Ele recusa juiz da família do gerador **e**
   gerador com roteamento automático — este pode cair na família do juiz sem ninguém ver. (Eram dois os
   lugares onde se julga: os evals (`runEval`) e a avaliação do sucessor de fora. Na branch
   `consertos-e-reach-out` sobrou o primeiro; a regra é a mesma.)
3. **`./gasclaw model <id> [pasta]`** troca o modelo do agente com a autoridade do painel (o dono, provado
   pelo segredo da CLI; ADR-021/022). Sem isso, "um modelo só" dependeria de clique, e a regra do projeto
   é zero operação manual depois do setup.

## Consequências

- Um agente configurado em `openrouter/auto` **não consegue ser avaliado**: `judgeFor` recusa, com motivo.
  É honesto e é a consequência de aceitar roteamento automático; quem quiser eval escolhe um id fixado.
- ~~A sucessão fica mais barata sem virar barata demais~~ — não se aplica na branch
  `consertos-e-reach-out`, onde a sucessão não existe ([ADR-043](043-sucessor-e-um-agente.md)).
- O juiz mais barato que o avaliado é intencional: julgar é ler e comparar, não criar.
