# ADR-024 — Memória do dia, sessões no Drive, skills e ritual de estreia

- **Status:** Aceito no núcleo (testes offline) · 2026-09-15 · publicação e medição no dev em lote, junto com a P11 da outra pista
- **Relaciona:** spec §3/§4/§6 · [ADR-012](012-agentes-em-docs-e-sheets.md) (pasta do agente) · [ADR-017](017-motor-de-tools-evals-e-aprovacao.md) (motor, aprovação, evals) · [ADR-021](021-acesso-aprovado-no-painel.md) (acesso aprovado) · [ADR-023](023-ferramentas-do-workspace.md) (ferramentas do Workspace)

## Contexto
Faltavam quatro peças do "agente-pasta completo" da spec: memória que dura mais que um turno, conversa que
sobrevive ao cache de 6 h, skills sob demanda e o ritual de estreia. O usuário pediu nessa ordem, por ser o
que ele mais sente no dia a dia.

## Decisão

### 1. Memória (spec §3/§6)
- **Dois lugares:** `MEMORY.md` continua a memória curada; `memory/AAAA-MM-DD.md` guarda as notas do dia, escritas pelo agente com `memory.save`.
- **Recall:** curada + hoje + ontem, nessa ordem de prioridade, dentro de **4.000 caracteres** no total (títulos, separadores e o corte contam). Entra como **mensagem do usuário**, nunca no system, e **só na DM do dono**.
- **Limite por entrada:** 2.048 **bytes** (não caracteres). O schema da tool aceita texto longo de propósito: quem recusa é a memória, com o motivo, e o motor avisa que nada foi feito.
- **Flush antes de compactar:** quando o histórico chega ao limite, uma chamada ao modelo pede os fatos duráveis e eles viram nota do dia. Roda fora do caminho da resposta e nunca derruba o turno.
- `memory.remove` tira o fato da curada e da nota de hoje.

### 2. Sessões no Drive (spec §6)
- **Fonte da verdade:** `.gasclaw/sessions/<espaço>.json` na pasta do agente, uma por agente + espaço. O CacheService (6 h) fica só como camada rápida.
- **Compactação:** acima de **12.000 caracteres**, o começo vira resumo (até 1.500 caracteres, acumulando com o resumo anterior) e as **8 mensagens recentes** ficam intactas. O resumo volta como mensagem do usuário, marcado como contexto.
- **Robustez:** `parseSession` aceita só o que tem forma de sessão, porque o arquivo é editável pelo dono; resumo vazio ou falha do modelo não mexem na sessão.
- **Custo por turno:** alvo **≤ 300 ms** a mais, medido por `./gasclaw poc p18` (compara turno com cache quente contra leitura/escrita no Drive, com limpeza do arquivo de teste). Medição pendente da janela no dev. Se estourar, a proposta vem antes de mudar o desenho.

### 3. Skills (spec §4)
- `skills/<nome>/SKILL.md` na pasta do agente. **Só o índice** (nome + descrição, teto de 1.500 caracteres) entra no prompt; o corpo vem sob demanda pela tool **`read_skill`** (sem aprovação, cortado em 6.000 caracteres).
- A descrição sai do frontmatter `description` ou da primeira linha do corpo. Cache de 30 s, a mesma validade da leitura do agente (ADR-012).
- **Skill é texto** (ADR-002): nada dela é executado. Skill inexistente falha com o motivo, e o motor avisa em vez de o agente inventar um passo a passo.

### 4. Ritual de estreia (spec §3)
- Na **primeira conversa da DM do dono**, o `BOOTSTRAP.md` da pasta entra como mensagem do usuário (conteúdo da pasta, nunca regra do motor) pedindo no máximo duas perguntas curtas.
- O arquivo só é **consumido quando cumpriu o papel** (o agente gravou algo com `memory.save`); senão fica para a próxima conversa. "Consumir" é copiar para `.gasclaw/BOOTSTRAP.done.md` e mandar o original para a **lixeira do dono**, nunca apagar de vez.

## Medição (dev, v41)

### Evals (`./gasclaw eval`, 4 de 4 verdes)
| Eval | Resultado | Tempo | Observação |
|---|---|---|---|
| mem-dia | ✅ | 13,7 s | `memory.save` → nova sessão → lembra do chá |
| skill-usa | ✅ | 3,3 s | `read_skill` chamada; a resposta segue o passo da skill |
| skill-ausente | ✅ | 3,4 s | aviso honesto do motor, sem inventar passo a passo |
| bootstrap-primeira-conversa | ✅ | 10,9 s | span `bootstrap` presente: o ritual entrou de verdade no turno |

Nenhum dos quatro cria dado na conta, então a limpeza é 0 por desenho.

### Custo da sessão no Drive (`./gasclaw poc p18`) — **reprovado**
10 amostras (o padrão do harness na versão publicada; a CLI não passa `turns`):

| Métrica | Valor |
|---|---|
| Base (cache quente) | 1.638–2.926 ms |
| Com Drive (cache frio) | 2.452–3.609 ms |
| Diferença por turno | mínimo 112 ms, mediana 773 ms, média 829 ms, p95 1.847 ms |
| Turnos acima da meta de 300 ms | 8 de 10 |
| Turnos em que o Drive foi mais lento que a base | **10 de 10** |

**Leitura:** diferente da medição anterior (onde a base variou 1.765–4.670 ms e em 2 de 10 turnos ficou mais lenta
que o Drive), aqui a base foi mais estável e o Drive perdeu em **todos** os turnos. Isso aponta custo real, não ruído
da linha de base. A meta de 300 ms **não é cumprida** com 1 leitura + 1 escrita no Drive por turno.

#### Repetição com 20 amostras (dev v42, `e14f5b2` publicado) — **confirma o custo**
| Métrica | 10 amostras (v41) | 20 amostras (v42) |
|---|---|---|
| Base (cache quente) | 1.638–2.926 ms | 2.134–4.573 ms |
| Com Drive (cache frio) | 2.452–3.609 ms | 2.923–3.631 ms |
| Diferença mediana | 773 ms | **718 ms** |
| Diferença média | 829 ms | 488 ms |
| p95 | 1.847 ms | **1.226 ms** |
| Turnos acima de 300 ms | 8 de 10 | **13 de 19** |
| Drive mais lento que a base | 10 de 10 | 15 de 19 |

As duas medições concordam na mediana (~700–800 ms), que é o número que importa: o custo do Drive é real e a meta de
300 ms não é cumprida com 1 leitura + 1 escrita por turno. O lado do Drive é **estável** (2.923–3.631 ms); quem oscila
é a linha de base (um turno chegou a ser 1.580 ms mais lento que o Drive). Ou seja, a média e o p95 medem o ruído da
base — a mediana, não. Essa é a razão de a leitura anterior de "regressão de 683 ms" não se sustentar como *média*
enquanto o custo em si se confirma.

### Decisão do usuário sobre o custo: gravação em lote
Levei duas opções (1 escrita por turno com ~800 ms a mais, ou escrever a cada N turnos) e o usuário escolheu uma
terceira: **lote**, o mesmo padrão já provado no trace. O turno responde na hora e a gravação sai logo depois, pelo
gatilho de 1 min. A opção "a cada N turnos" foi recusada com razão: trocava latência por **perda silenciosa** de até
N−1 turnos de conversa, e o usuário não seria avisado da perda.

Regras do lote (`src/sessionQueue.ts` + `src/sessionQueueStore.ts`):
- **Fila própria** (`S:`), nunca a `Q:` do trace nem a `R:` dos runs: perdas diferentes custam coisas diferentes.
- **Exceção obrigatória:** turno que termina em **pendência de aprovação** (ou dentro de um run durável) grava
  **imediatamente**, sem passar pelo lote — o estado precisa estar no Drive antes de a execução acabar, senão o
  Aprovar volta para uma conversa que não existe.
- Entrada corrompida é ignorada com aviso (não trava a fila) e cada conversa desiste depois de 3 tentativas, em vez
  de ficar na fila para sempre.
- As funções do `batch.ts` não foram reaproveitadas como estão porque a entrada de lá é linha de planilha
  (`row`/`recs`/`rowDone`); o que se reaproveitou foi o **desenho** (prefixo nas Properties, fila ordenada por `at`,
  `settle` com tentativas).

## Limitações conhecidas
1. **`mem-limite` é offline:** o texto de 2.200 bytes não cabe no teto de 2 KB do cenário enviado no POST. O teto é limitação da nossa CLI, não do produto.
2. **Sem evals de sessão:** o runner zera o histórico em `(nova sessão)` e não toca no Drive nem no cache, então um cenário passaria mesmo sem a persistência existir. A cobertura ficou em teste unitário. Para valer no dev, o runner precisaria de um `(nova execução)` que limpe só o contexto do processo, e o `env` do eval precisaria receber um `sessionIO` — não cabe em poucas linhas.
3. **`mem-privado` é teste, não eval:** o runner só fala pela DM do dono; "num espaço" não dá para escrever em cenário. Vira eval quando o runner simular espaço.

## Consequências
- O `main.ts` precisa de um diff para valer em produção: deps de sessão (`history`/`saveHistory`/`compact`), fuso na memória, índice de skills e provider no ctx, hook de bootstrap e registro da POC P18. Sem ele, o comportamento é o de antes.
- Uma conversa longa passa a custar 1 leitura e 1 escrita no Drive por turno (com cache na leitura) e, quando compacta, 1 chamada a mais ao modelo, fora do caminho da resposta.
- A pasta do agente ganha `memory/`, `skills/` e `.gasclaw/sessions/`, todas criadas sozinhas.
