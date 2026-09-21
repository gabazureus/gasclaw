# POC P36 — as quatro capacidades no motor que responde

> **Status:** medida em 2026-09-21 no dev, no sucessor coroado (v14–v18). Serviu para fechar a F9
> ([spec](../../docs/specs/2026-09-21-fechamento-da-branch.md)).

## A pergunta

As quatro capacidades marcadas no painel (Dream, Reach out, Succeed e Create agents) fazem, **no motor que
de fato responde**, o que o texto delas promete?

Depois da coroa, o motor que responde é o sucessor. O `./gasclaw` fala com o pai, então os passos rodam
contra o sucessor com `GASCLAW_ENGINE_URL`. Na primeira vez, o segredo da CLI é registrado nele.

## Como rodar

```bash
export GASCLAW_ENGINE_URL="https://script.google.com/a/macros/<domínio>/s/<Deployment ID do sucessor>/exec"
./gasclaw poc p36 status        # ligado?, capacidades aprovadas/efetivas, mayAct, ferramentas, agenda
./gasclaw poc p36 dream         # começa um ciclo pelo MESMO botão do dono
./gasclaw poc p36 dreamstate    # passos feitos/total, eliminados, placar, material
./gasclaw poc p36 dm            # a conversa direta do dono (com o erro real, se não achar)
./gasclaw poc p36 wake          # um job daqui a 2 min na agenda REAL (--variant deny: pede ferramenta fora da lista)
./gasclaw poc p36 wakeread      # o último despertar: status, resposta, entrega
./gasclaw poc p36 wakeclear     # devolve a agenda anterior
./gasclaw poc p36 create        # o efeito de agent.create: o agente nasce sem nada
./gasclaw poc p36 createclean   # tira o agente de teste do painel (a pasta fica no Drive)
unset GASCLAW_ENGINE_URL        # up/down/ship/restart/rollback recusam com ela definida
```

## Resultados

| Capacidade | Medido | Leitura |
|---|---|---|
| **Dream** | `started: false`, "no real failures to dream about"; `material: ""` | Recusa honesta: não há falha real agrupada em 30 dias. Não se fabrica falha para forçar um ciclo. |
| **Reach out** | o job das 17:57 rodou às 17:58:26, uma vez, sem ferramenta, e respondeu "pong" (5,7 s, US$ 0,00074) | ✅ o despertar funciona |
| **Reach out** (entrega) | antes do conserto, `delivery: null`: a resposta morria no trace. Depois, `status: sent`, recibo `spaces/g_jQUqAAAAE/messages/…`, 79 s | ✅ com a [ADR-045](../../docs/adr/045-reach-out-entrega-ao-dono.md) |
| **Reach out** (fora da lista) | o modelo não chamou `docs.create` e perguntou "Aprova?", pergunta que foi entregue ao dono; nada foi criado | ✅ nada age sem o dono. O caminho "a ferramenta fora da lista faz o run falhar" fica provado por teste: o modelo não chamou a ferramenta. |
| **Create agents** | `f9-probe-mubqfy9c`: `caps: "[]"`, `tools: []`, `users: []`; removido depois | ✅ nasce sem nada |
| **Succeed** | health do coroado **10/10** (sucessor v20); a 10ª informa os dois lados de CAP | ✅ depois da coroa vale o painel do sucessor (decisão do dono) |

## Achados que viraram conserto (com teste)

1. **A resposta do Reach out não ia a lugar nenhum.** Consertado pela ADR-045.
2. **`findDirectMessage` com o e-mail volta 403** com a identidade do app. A busca passou a usar o id
   numérico da conta (o `sub` do userinfo).
3. **O `chatLink` pegava a primeira conversa direta do app**, que podia ser de outra pessoa.
4. **A 10ª verificação mandava rodar `inherit` na direção errada:** as 4 capacidades estavam ligadas no
   **sucessor**, e o pai só tinha Succeed. Agora ela mostra os dois lados.
