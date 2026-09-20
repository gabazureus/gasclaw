# Plano — F6: o enxame

Ordem: **núcleo puro primeiro, casca depois, medição no ambiente por último**. Nenhuma fase
começa antes de a anterior estar verde, e nenhuma "conclui" sem evidência fresca.

## Fase 0 — o que é decisão do dono (bloqueia tudo)

- [ ] **H5 — a bateria (portão NOVO, achado na Fase 3).** Quem define o que é "melhor". Não pode vir
      da pasta (ADR-002) nem do gerador (auto-avaliação). Declarada por `setAgentBattery(pasta, json)`:
      uma lista de `{ "input": "...", "expected": "..." }`. Sem ela, `measureChild` não mede — e diz por quê.

- [ ] **H1 — orçamento da corrida.** Declarar `CODEGEN_DAILY_CAP_USD` para a corrida (15 filhos ×
      US$ 1,00 = US$ 15,00) e `FAMILY_CAP_USD` acompanhando. Escrever no `decisions.md` o valor,
      a data e **o valor de volta** ao fim. Sem isso, a corrida para na 3ª geração.
- [ ] **H2 — intervalo ao piso.** Baixar o intervalo do agente para 1 h no painel (piso absoluto;
      o painel não deixa descer disso).

## Fase 1 — P29: o teto da plataforma (US$ 0, sem Opus)

Núcleo puro + sonda. O código do filho é string fixa: mede a **plataforma**, não o modelo.

- [x] `poc/p29-enxame/README.md` com critérios C1–C4 **antes** de qualquer linha de sonda
- [x] sonda `pocP29(step)`: `burst` (5 filhos, ms de cada, primeiro 429), `quota` (onde o dia
      recusa), `consent` (tempo de parede até `authState === 'authorized'`), `cleanup`
- [x] rodar no dev, gravar os números **com a versão do dev** no README — v132/v133; C3 aguarda o dono
- [x] **Portão:** ABERTO — 40 criações no dia sem recusa; a corrida continua "até 15"
- [x] **D3 (achado pela P29):** registro de filhos estourava em 11 — consertado e remedido

## Fase 2 — P30: encadear a linhagem (conserta D1)

O defeito: `main.ts:2158` passa `incumbentSource: agente.system` em **toda** geração.

- [x] **Teste primeiro** (falhando): com um filho anterior, o pedido ao Opus contém o **fonte dele**
- [x] núcleo: `heirOf(lineage, parent)` — puro, escolhe de quem herdar
- [x] casca: ler `projects/<id>/content` pela API. **Nunca do Drive** (ADR-002)
- [x] fallback preservado: sem filho anterior, cai no prompt — o comportamento de hoje
- [x] **Mutação:** desfazer o encadeamento tem que matar o teste de C1 — 5 de 5 mortas

## Fase 3 — P31: aptidão do filho (conserta D2)

O defeito: a linhagem grava `delta: null` sempre, e nada executa o filho.

- [x] contrato do filho no crivo e no pedido ao Opus — **CORRIGIDO**: `{ ok, score }` deixava o filho dar a própria nota. Agora `?input=` entra, `{ output }` sai, e o MOTOR compara com o esperado
- [x] **Teste primeiro:** resposta medida → `delta` real; não autorizado/sem resposta → `null` com motivo; lixo de filho alcançável → caso FALHOU (senão o quebrado escaparia da comparação)
      `delta: null` **com motivo no trace**
- [x] `beatsIncumbent` decide sobre passes/k — k são CASOS distintos, não repetições (código é determinístico)
- [x] **Mutação:** trocar o `null` por `0` mata um teste — 8/8 no núcleo, 6/6 na fiação
- [x] **redirecionamento 302** do Apps Script seguido com segurança (previsto, não medido)
- [ ] **medição real** — bloqueada por H3 (um filho autorizado) e H5 (a bateria do dono)

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
