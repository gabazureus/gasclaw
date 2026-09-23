# Spec — F10: auditoria final de tudo, evals de todas as ferramentas, e um modelo só (`gpt-6-luna`)

- **Data:** 2026-09-23
- **Branch:** `evolucao-f5-f8` (a `main`, em `e4b8006`, não se toca)
- **Estado:** dev pai v179, sucessor coroado `1w3Pju8v…` v27, health 10/10, suíte 2328 verde
- **Pedido do dono:** "audite e ajuste tudo que foi feito até aqui, não deixe passar nada, faça tudo
  impecavelmente. Rode diversos testes de avaliação com o agente para verificar todos os usos de
  ferramentas. Use o modelo `gpt-6-luna` para tudo, mude todos eles para esse novo modelo."

## Parte 1 — Auditoria de tudo (o diff `e4b8006..HEAD`)

Ênfase no que foi feito DEPOIS da última auditoria: fila de perguntas `ask`, corridas do cartão,
expiração da espera (7 dias), varredura de esperas, `DREAMSTEP_MS` por agente, renomes para inglês,
"o clique só registra a decisão" e "cartão de pedido encerrado diz que acabou".

### Pendências conhecidas — cada uma conserta ou vira POC com número

| # | Pendência | Como se resolve |
|---|---|---|
| P1 | **Critério REPROVADO:** o tique ocioso passou de 1000 ms (P3/ADR-027) em 2 de 4 medições (844–1021 ms). A parte nova (fila + esperas) foi 52–129 ms | medir de novo no dev com **N ≥ 10**, achar onde o tempo vai (limpeza de trace, gravação em lote), consertar ou abrir POC com critério. **O limiar não se afrouxa.** |
| P2 | A retomada pelo gatilho faz **uma chamada de modelo a mais** por aprovação (1 → 2 nos testes; suspeita: resumo da sessão) | confirmar a causa no código e no real; se for desperdício, consertar; se for o resumo, provar e registrar |
| P3 | Trace legado dos runs parados ANTES do conserto ainda diz "ok" | confirmar que só os antigos, e que nada mais mente ao dono |
| P4 | Testes vácuos | mutações amostradas no diff recente, incluindo os oráculos trocados hoje em `test/chatEspera.test.ts` |
| P5 | Segurança do fluxo de espera, ponta a ponta, depois de TODAS as mudanças | destino nunca vem do arquivo do run; só o dono aprova/continua/responde; nada executa duas vezes; apagar a conferência de assinatura em `decide` tem de continuar quebrando os 3 testes de ataque do `runAuthority` |
| P6 | Docs × código × textos | CHANGELOG, PROGRESS, ADR-043..047, READMEs (en/pt-BR), `UBIQUITOUS_LANGUAGE`, ajuda da CLI, `CAP_TEXT` e `settings.html`: nada promete o que o motor não faz |

## Parte 2 — Evals: todas as ferramentas exercitadas

O registro tem 26 ferramentas (`now`, `ask`, `persona`, `read_skill`, `memory.*`, `calendar.*`,
`gmail.*`, `contacts.find`, `tasks.*`, `drive.search`, `docs.*`, `sheets.*`, `agent.create`,
`agent.message`). Os cenários vivem em `evals/*.md` e rodam no motor com `./gasclaw eval`.

- **A1.** Levantar a cobertura: qual ferramenta do registro **nenhum** eval exercita. A lista é o entregável.
- **A2.** `./gasclaw eval --all` no dev (contra o motor que responde, via `GASCLAW_ENGINE_URL`), com o
  resultado cenário a cenário, custo e tempo. Reprovou → causa-raiz → conserto test-first → roda de novo.
- **A3.** Escrever os evals que faltarem para as ferramentas descobertas, no mesmo formato dos que existem
  (dado, nunca código — ADR-002), incluindo o caminho de recusa (ferramenta fora da lista, aprovação negada).
- **A4.** Nenhum eval pode tocar dado real do dono sem caixa de areia: o que cria/edita roda no ambiente de
  teste dos evals, como os atuais.

## Parte 3 — Um modelo só: `gpt-6-luna`

**Antes de qualquer troca, provar que o id existe** no catálogo do OpenRouter (`./gasclaw` → `action=models`);
o motor já recusa id inexistente (`validateChoice`). Id inventado = tarefa parada, não adivinhada.

Onde há modelo hoje, e o que muda:

| Lugar | Hoje | Decisão |
|---|---|---|
| Agente (pasta/painel) | `openai/gpt-5.6-luna` | vira `gpt-6-luna` |
| Padrão do motor (`DEFAULT_MODEL`) | `openrouter/auto` | vira `gpt-6-luna` |
| Evals (`./gasclaw eval`) | o modelo do agente | idem, sem `--model` |
| Ciclo do sonho (candidatos e juiz) | o modelo do agente | idem — **ver a ressalva abaixo** |
| Enxame/automação (filhos) | herdado | idem |
| Escrever o sucessor (`OPUS_MODEL`) | `anthropic/claude-opus-5` | **decisão do dono** (ver abaixo) |

**Duas ressalvas que precisam de decisão, não de chute:**

1. **Juiz e candidato no mesmo modelo.** Hoje o conjunto-juiz mede o candidato. Se os dois forem o mesmo
   modelo, a avaliação perde independência (um modelo é leniente consigo). Opções: (a) manter o juiz noutro
   modelo; (b) aceitar e registrar o viés em ADR. Recomendação: (a).
2. **O escritor do sucessor.** A [ADR-043](../adr/043-sucessor-e-um-agente.md) escolheu o Opus 5 para
   escrever o patch do motor. Trocar por `gpt-6-luna` muda a qualidade e o custo da sucessão. Opções:
   (a) trocar também, com uma medição antes/depois; (b) manter o Opus e registrar a exceção. Recomendação:
   (b), com a troca medida numa POC antes de decidir.

## Critérios de aceite (medidos; nenhum limiar afrouxa depois de falhar)

| # | Critério | Como se mede |
|---|---|---|
| C1 | `tsc` rc=0 e suíte inteira verde | `npx tsc --noEmit`; `vitest --reporter=json` |
| C2 | Cada conserto tem teste que falha sem ele | vermelho antes; mutação do guarda |
| C3 | P1 resolvido ou medido com N ≥ 10 e POC aberta | números no dev |
| C4 | P2 explicado com evidência, e consertado se for desperdício | trace/contagem de chamadas |
| C5 | Segurança do fluxo de espera intacta | mutações nos 3 testes de ataque + revisão |
| C6 | Cobertura de ferramentas por eval declarada, e os buracos fechados | tabela ferramenta → eval |
| C7 | `./gasclaw eval --all` verde no dev | saída do comando, custo e tempo |
| C8 | O modelo novo aparece no trace de um turno real | `./gasclaw trace` mostra `llm_call · <modelo>` |
| C9 | Health do sucessor 10/10 depois de publicar | `./gasclaw succession health <id>` |
| C10 | Docs em dia, inclusive ADR da troca de modelo e das ressalvas | diff |

## Fora do escopo

- `./gasclaw ship` (prod) e mexer na `main`.
- Rodar `succession inherit` (apagaria as capacidades que o dono ligou no sucessor).
- Clicar cartões no Chat pelo dono.

## Passos

1. Auditoria do diff, com as revisões de segurança e corretude; lista de achados.
2. P1 e P2 medidos no dev com números; consertar ou abrir POC.
3. Consertos test-first + mutação; suíte verde; commit.
4. Cobertura de ferramentas (A1), evals novos (A3), `eval --all` (A2/A7) no motor que responde.
5. Provar o id do modelo; decidir as duas ressalvas com o dono; aplicar a troca; medir custo antes/depois.
6. Publicar (`up` → `succession sync` → `succession health` 10/10); docs; commit; push.
