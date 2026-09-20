# Plano — F6: o enxame

Ordem: **núcleo puro primeiro, casca depois, medição no ambiente por último**. Nenhuma fase
começa antes de a anterior estar verde, e nenhuma "conclui" sem evidência fresca.

## Fase 0 — o que é decisão do dono (bloqueia tudo)

- [ ] **H1 — orçamento da corrida.** Declarar `CODEGEN_DAILY_CAP_USD` para a corrida (15 filhos ×
      US$ 1,00 = US$ 15,00) e `FAMILY_CAP_USD` acompanhando. Escrever no `decisions.md` o valor,
      a data e **o valor de volta** ao fim. Sem isso, a corrida para na 3ª geração.
- [ ] **H2 — intervalo ao piso.** Baixar o intervalo do agente para 1 h no painel (piso absoluto;
      o painel não deixa descer disso).

## Fase 1 — P29: o teto da plataforma (US$ 0, sem Opus)

Núcleo puro + sonda. O código do filho é string fixa: mede a **plataforma**, não o modelo.

- [ ] `poc/p29-enxame/README.md` com critérios C1–C4 **antes** de qualquer linha de sonda
- [ ] sonda `pocP29(step)`: `burst` (5 filhos, ms de cada, primeiro 429), `quota` (onde o dia
      recusa), `consent` (tempo de parede até `authState === 'authorized'`), `cleanup`
- [ ] rodar no dev, gravar os números **com a versão do dev** no README
- [ ] **Portão:** se C2 recusar abaixo de 15, a corrida passa a ser "até N", com N medido

## Fase 2 — P30: encadear a linhagem (conserta D1)

O defeito: `main.ts:2158` passa `incumbentSource: agente.system` em **toda** geração.

- [ ] **Teste primeiro** (falhando): com um filho anterior, o pedido ao Opus contém o **fonte dele**
- [ ] núcleo: `lastChildSource(lineage, children)` — puro, escolhe de quem herdar
- [ ] casca: ler `projects/<id>/content` pela API. **Nunca do Drive** (ADR-002)
- [ ] fallback preservado: sem filho anterior, cai no prompt — o comportamento de hoje
- [ ] **Mutação:** desfazer o encadeamento tem que matar o teste de C1

## Fase 3 — P31: aptidão do filho (conserta D2)

O defeito: a linhagem grava `delta: null` sempre, e nada executa o filho.

- [ ] contrato do filho no crivo e no pedido ao Opus: `doGet` devolve `{ ok, score }`
- [ ] **Teste primeiro:** resposta válida → `delta` não nulo; lixo, silêncio ou não autorizado →
      `delta: null` **com motivo no trace**
- [ ] `beatsIncumbent` passa a decidir sobre esse número
- [ ] **Mutação:** trocar o `null` de C2 por `0` mata um teste — zero é nota, ausência não é

## Fase 4 — a corrida assistida (24 h, até 15 filhos)

Só com Fases 1–3 verdes e H1/H2 registrados.

- [ ] painel do enxame: N filhos, estado de cada um, gasto acumulado contra o teto, último `delta`
- [ ] rodar, **acompanhando**: cada filho tem um clique do dono (H3) e um registro na linhagem
- [ ] pelo menos uma geração **recusada pelo crivo**, com motivo visível — crivo que nunca recusou
      não foi exercitado
- [ ] **H4 — parada:** `./gasclaw down` provado durante a corrida, não depois
- [ ] ao fim: devolver `CODEGEN_DAILY_CAP_USD` e `FAMILY_CAP_USD` aos valores de origem

## Fase 5 — fechar

- [ ] README/README_PT_BR: como rodar o enxame **no ambiente de quem lê**, com ASCII
- [ ] PROGRESS + CHANGELOG + `decisions.md` com os números medidos
- [ ] commit + push
