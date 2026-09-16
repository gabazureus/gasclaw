# POC P20 — aprovação durável

Pergunta: uma aprovação sobrevive à perda do `CacheService` e continua segura por 24 horas sem replay de LLM ou efeito?

Execute somente no dev:

```sh
./gasclaw poc p20
```

Critérios:

- **C1:** cache removido; aprovação após mais de 10 min retoma do Drive com duas chamadas totais ao LLM (pedido + conclusão), um passo e um efeito.
- **C2:** terceiro é recusado sem consumir; o solicitante usa a mesma credencial.
- **C3:** segundo clique é recusado; não cria segundo passo nem efeito.
- **C4:** em 24 h a credencial é rotacionada, o run segue `waiting` com o mesmo snapshot/pending e zero chamada adicional ao LLM; a nova credencial conclui uma vez.
- **C5:** os cenários Chat e tela exercitam o mesmo `RunIO.decide` Drive-backed.

## Resultado real

**Aprovada 5/5 no dev v74 em 2026-09-16.**

- C1: cache removido; retomada após **660.001 ms**; status `done`; **2** chamadas totais ao LLM, **1** passo e **1** efeito.
- C2: terceiro `rejected`; a mesma credencial foi aceita depois para o solicitante.
- C3: clique duplo `rejected`; contadores permaneceram em um passo e um efeito.
- C4: em 24 h, `refreshed`; run ainda `waiting`, mesma pendência/snapshot e LLM ainda em **1**; nova credencial terminou `done`, com duas chamadas totais, um passo e um efeito.
- C5: os cenários rotulados Chat e tela usaram o mesmo `RunIO.decide` com arquivo real no Drive.

Na primeira execução logo após publicar v73, o protocolo atingiu uma instância nova e a medição seguinte caiu numa instância aquecida anterior (`POC desconhecida: p20`). Sem novo deploy, protocolo e medição repetidos passaram. O `pc.sh` agora tolera somente esse erro transitório por até 30 s.
