# POC P34 — o pai avalia o sucessor de fora?

> **Status: PASSOU (dev v151, 2026-09-21).** Ver [ADR-043](../../docs/adr/043-sucessor-e-um-agente.md)
> e a [spec](../../docs/specs/2026-09-21-sucessao-por-patch.md).

## Como rodar

O sucessor precisa estar **pausado** (a porta `evalrun` recusa um sucessor ativo — ela só serve para
ser avaliado, e na caixa de areia):

```bash
./gasclaw poc p33 check      # deve dizer: the successor is PAUSED
./gasclaw poc p34 run --n 1  # só o smoke
./gasclaw poc p34 run        # os 6 cenários
```

## Critérios

| # | Critério | Resultado |
|---|---|---|
| C1 | o pai conduz | ✅ o pai mandou o `RunSpec` (sem juiz, rubrica nem verificações) ao web app do sucessor e recebeu turnos crus nos 6 cenários |
| C2 | o pai julga | ✅ `judgeRun` do PAI julgou os dois lados; nenhum trace do sucessor trouxe `pass`, `checks` ou `judge` |
| C3 | compara | ✅ `beatsIncumbent(5, 5, 6)` = **false** — empate não coroa |

## Números

| Corrida | k | sucessor | titular | sucessor vence? | tempo |
|---|---|---|---|---|---|
| `--n 1` | 1 | 1 | 1 | não | 10,9 s |
| completa | 6 | 5 | 5 | não | 43,8 s |

| Cenário | sucessor | titular |
|---|---|---|
| smoke | ✅ | ✅ |
| e1-now | ✅ | ✅ |
| e1-memoria | ❌ | ❌ |
| e1-limite | ✅ | ✅ |
| e1-fora-da-lista | ✅ | ✅ |
| e1-injecao | ✅ | ✅ |

## Leitura

- **O empate é o resultado certo.** Os dois motores são byte a byte iguais (ver a auditoria na
  [P33](../p33-agente-sucessor/README.md)); a única diferença de origem — a correção da meia-noite — já
  foi portada para o `src` e não é exercitada por nenhum cenário. Um sucessor idêntico que "vencesse"
  seria ruído, e o `beatsIncumbent` o recusaria.
- **`e1-memoria` reprova nos DOIS lados.** Não é defeito do sucessor; é uma reprovação do agente que já
  existia. Fica registrada, não relaxada.
- **Consequência para a Fase 2:** a bateria de 6 cenários não mede a melhoria que o Opus tende a
  propor (defeitos de código como o da meia-noite). Um sucessor por patch só pode vencer se a bateria
  tocar o que ele mudou — senão todo sucessor empata e nenhum é coroado pela nota.
