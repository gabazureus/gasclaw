# Spec: F3 — proatividade e governança de ferramentas

> ## ⛔ VERSÃO REPROVADA NA REVISÃO DE DESENHO (2026-09-17) — NÃO IMPLEMENTAR
>
> Dois revisores independentes (segurança e complexidade) reprovaram a **Fase 1**
> desta versão, por motivos opostos que convergem na mesma conclusão: a linguagem
> de predicados da política é ao mesmo tempo **insegura** (uma regra restringe só
> os argumentos que nomeia; todos os outros ficam livres) e **super-construída**
> (uma das quatro formas não tem nenhuma tool aplicável no registro inteiro).
>
> Além disso, a revisão de segurança encontrou um furo que nem o gate de
> alinhamento nem esta spec previram: **`jobs.md` na pasta entrega ao editor da
> pasta o *prompt* e o *destino da entrega* de um run não supervisionado** — o que
> é estritamente mais poderoso do que afrouxar uma aprovação.
>
> O documento fica aqui como registro do que foi proposto e reprovado.
> A revisão do desenho está no gate de SPECIFY; nada é implementado antes das
> decisões do usuário.

> Escrita depois do gate de alinhamento de 2026-09-17 (G1–G9). Vocabulário em
> `UBIQUITOUS_LANGUAGE.md`, seção *Proatividade e governança*.
> **Rigor de módulo/interface só para a Fase 1.** As fases seguintes ficam em
> nível de conceito de propósito: a Fase 2 (POC P22) pode invalidar o desenho do
> despertar, e escrever interface antes da medição seria gerar ativo sem evidência.

## Problem & purpose

O gasclaw só age quando alguém fala com ele. O usuário quer um agente que acorde
sozinho — agendamentos, heartbeat, ordens permanentes — como no Eve e no OpenClaw.

O bloqueio não é escrever um despertador: é que **todo caminho de escape do motor
atual exige um clique humano**, e um run proativo não tem ninguém do outro lado.
Tool com `approval: 'always'` para o turno em `waiting` (`src/agent.ts:164`);
estourar os US$ 0,10 para em `paused` perguntando se continua (`src/run.ts:190`).
Pelo handoff de 2026-09-17 (§5), nenhum desses dois estados é entregue ao Chat.
Um heartbeat às 3h que decida criar um evento vira run parado e invisível.

Logo, governança de ferramentas não é um item paralelo à proatividade: é
**pré-requisito**. É por isso que ela vem primeiro.

## Design concept

**Um despertador, uma agenda, e o prompt que já é lido.**

O gatilho de 1 min que já existe (`drainRuns`, `src/main.ts:803`) passa a também
perguntar "venceu algum compromisso?". Não há gatilho novo — a ADR-027 já provou
que o tique ocioso custa 716 ms e que o conjunto consome 8,47% das 6 h/dia.

A agenda mora em `jobs.md` na pasta do agente, com gramática fechada e legível.
**O heartbeat é uma linha dessa agenda**, não uma máquina separada: muda o texto
(corpo do `HEARTBEAT.md`) e o default de falar (`NO_REPLY`). **Standing orders não
são feature nenhuma**: o corpo do `AGENTS.md` já entra no system prompt
(`workspace.ts:118`); construir algo ali seria reimplementar o que existe.

Antes de qualquer despertar, a **política de aprovação** dá ao agente uma regra
determinística para decidir sozinho o que pode fazer sem perguntar — avaliada em
código, jamais pelo modelo, e vigente só depois de o dono aprovar no painel.

## Scope

**In scope**, na ordem aprovada:

1. **Política de aprovação declarativa** (`approval: policy` do Eve).
2. **POC P22** — custo da proatividade na cota de gatilho. Gate de viabilidade.
3. **Despertar** — agenda (`jobs.md`), heartbeat, `NO_REPLY`, run proativo.
4. **Serialização por espaço** — depois de a P2 fechar.
5. **ADR de recusa dos `hooks/`**.

**Out of scope**, explicitamente:

- `subagents/`, `channels/`, `connections/`, manifest compilado, `doctor --fix`
  (recusados pelo usuário nesta rodada).
- Inbox Excel (P8) e templates de agente, embora também sejam F3.
- Entrega de `waiting`/`paused` no Chat — é da pista P2, e esta track a contorna
  fazendo o run proativo **nunca** entrar nesses estados.
- `hooks/` como o Eve faz — recusado, ver Fase 5.

## Behavior

**Caminho feliz.** O dono escreve em `jobs.md`: `seg-sex 07:00 | briefing do dia`.
Em algum tique depois das 07:00 de uma segunda, o compromisso vence. O gasclaw cria
um run proativo, que roda no mesmo pump de sempre. A política já aprovada permite
`calendar.list` e `gmail.search` sem perguntar. A resposta chega no destino
configurado. O último disparo é anotado nas Script Properties.

**Heartbeat.** Mesma mecânica, compromisso `a cada 30m 08:00-20:00 | HEARTBEAT`.
Na maioria das vezes o modelo responde `NO_REPLY`: nada é enviado, mas o despertar
vira span no trace — é o que distingue "rodou e calou" de "nunca rodou".

**Casos de borda.**

- `jobs.md` ausente: agente sem agenda, sem erro (mesma regra dos papéis).
- Linha inválida: ignorada com aviso; **as outras linhas continuam valendo**.
- Política que não faz parse: **rejeitada por inteiro**, volta ao `Approval`
  estático do registro. Fail-closed.
- Compromisso vencido enquanto o script esteve fora do ar: dispara **uma vez** ao
  voltar, não uma vez por ocorrência perdida.
- Dois tiques concorrentes: o mesmo compromisso não vira dois runs.
- Agenda com muitas linhas: teto explícito, avaliado antes de tocar o Drive.

**Erros.** Run proativo que estoura teto ou esbarra numa tool que a política manda
perguntar termina em **falha honesta e registrada** — nunca `paused`, nunca
`waiting`. Um run que ninguém pediu não tem direito de fazer pergunta.

## Module & interface changes — Fase 1 (política de aprovação)

### `policy` — **novo** — **crítico: revisão por inteiro, `security-hardening`**

- **Propósito:** decidir, por regra determinística, se uma chamada de tool é
  permitida, precisa perguntar, ou é negada.
- **Interface (o contrato que os testes verificam):**
  - `parsePolicy(text: string): { policy: Policy | null; errors: string[] }`
    — qualquer erro devolve `policy: null` (fail-closed por inteiro).
  - `decidePolicy(policy: Policy | null, call: { name: string; args: Record<string, unknown> }, ctx: PolicyCtx, fallback: Approval): PolicyOutcome`
  - `type PolicyOutcome = 'allow' | 'ask' | 'deny'`
  - `type PolicyCtx = { unattended: boolean; ownerDm: boolean }`
  - `const NEVER_AUTO: readonly string[]` — `gmail.send`, `calendar.update`,
    `memory.remove`. Nenhuma regra jamais os libera.
- **Vocabulário fechado de predicados** — exatamente quatro formas, nada mais:
  1. `proativo` / `interativo` (booleano do contexto do run)
  2. `dm_do_dono`
  3. `<arg> <= N` e `<arg> >= N`, só para argumentos inteiros já validados
  4. `<arg> em [a, b, c]` — comparação exata, minúsculas, **sem regex**
  Predicado desconhecido invalida a política inteira.
- **Core vs. shell:** 100% núcleo puro. Sem I/O, sem relógio, sem Drive.
- **Fronteira:** entra a política já parseada e os argumentos **já validados pelo
  schema** da tool; sai uma de três palavras. Nunca vê texto do modelo, nunca
  interpola string, nunca compila expressão.
- **Delegação:** revisão por inteiro. É o mecanismo que protege envio de e-mail e
  criação de evento.
- **Invariantes:**
  - primeira regra que casa vence; nenhuma regra casa → `fallback` (o `Approval`
    estático de hoje);
  - `NEVER_AUTO` é aplicado **depois** da avaliação, como segunda barreira;
  - a política só pode *afrouxar* para tools fora de `NEVER_AUTO`; pode *apertar*
    qualquer uma;
  - política ausente ou nula ⇒ comportamento idêntico ao de hoje.

### `agent` — **modificado** — **crítico**

- **Propósito:** trocar o único ponto de decisão de aprovação por uma consulta à
  política, preservando o comportamento atual quando não há política.
- **Interface:** `agent.ts:164`, o cálculo de `needs`. `Toolkit` ganha
  `policy?: Policy | null` e `unattended?: boolean`.
- **Delegação:** revisão por inteiro.
- **Invariante:** sem política, `runTurn` produz exatamente os mesmos
  `Pending`/`TurnResult` de hoje — provado por regressão sobre os testes existentes.

### `policyStore` — **novo** — **crítico**

- **Propósito:** guardar a política **vigente**, escrita só pelo dono.
- **Interface:** `policyIO().get(folderId)` / `.set(folderId, text)`; Script
  Properties sob `POLICY:<folderId>`.
- **Core vs. shell:** casca fina; toda a decisão está em `policy`.
- **Fronteira — a decisão de segurança central:** a pasta do Drive **sugere** a
  política (bloco em `AGENTS.md`); ela só entra em vigor depois de o dono aprovar
  no painel. É o mesmo precedente de `ACCESS:<folderId>` (`workspace.ts:134`), e
  mantém quem tem acesso de edição à pasta compartilhada fora da fronteira de
  confiança.
- **Invariante:** escrita só pelo caminho com `assertOwner()`.

### `settings` (painel) — **modificado** — não crítico

- Mostrar política sugerida × vigente, com diff, e o botão de aprovar. Mesmo
  desenho da tela de acesso que já existe.

## Fases 2–5 — propósito, sem interface ainda

- **Fase 2 — POC P22.** Mede o custo da proatividade **antes** de desenhar o
  despertar. Critérios em *Acceptance criteria*.
- **Fase 3 — despertar.** Agenda em `jobs.md`, heartbeat como linha da agenda,
  `NO_REPLY` com span, run proativo (`ownerDm: false`, teto próprio, nunca
  `paused`), último disparo nas Script Properties. Reaproveita `RunPointer.notBefore`
  e `due()` (`src/run.ts:144`) para a hora marcada; recorrência é avaliada a cada
  tique, **sem materializar run com antecedência**.
- **Fase 4 — serialização por espaço.** No máximo um run aberto por
  `<folderId>:<espaço>`, chave que já existe em `sessionQueue.ts`. Depois da P2.
- **Fase 5 — ADR de recusa dos `hooks/`.**

## Data

| Onde | O quê | Por quê ali |
|---|---|---|
| `POLICY:<folderId>` (Script Properties) | política **vigente** | fora da pasta compartilhável; só o dono escreve |
| `AGENTS.md` (pasta) | política **sugerida** | o dono edita onde já edita tudo |
| `jobs.md` (pasta) | a agenda | agente = pasta (ADR-002) |
| `JOB:<folderId>:<id>` (Script Properties) | último disparo | um editor da pasta não pode forçar redisparo |
| `DurableRun` | proveniência do despertar | o run já é a unidade durável (ADR-026) |

Tetos, **ajustáveis no painel, não constantes de código**: US$ 0,02 por run
proativo e US$ 0,50/dia por agente como ponto de partida, mais um teto de
despertares/dia visível junto aos itens de `src/limits.ts`.

## Testing strategy

Fronteira: o núcleo puro. `decidePolicy` e `parsePolicy` são funções sem I/O —
testadas por tabela, direto, sem mock. `runTurn` já é puro e já tem suíte; a
mudança em `agent.ts` é verificada por regressão (sem política ⇒ saída idêntica)
mais casos novos com política.

Mock só do que não é nosso: Drive, Properties, relógio. Nada de mockar `policy`.

Casos adversariais são obrigatórios nesta fase, não opcionais:
regra tentando auto-aprovar `gmail.send`; predicado desconhecido; YAML malformado;
argumento com nome de predicado; lista `em [...]` gigante; política de 10 KB
(acima do limite de 9 KB por Property); regra que casa duas vezes.

Sem meta de cobertura. "Pronto" = contrato, bordas, invariantes e regressão.

## Acceptance criteria

**Fase 1 — política**

- [ ] Sem política configurada, os 793 testes atuais continuam verdes e `runTurn`
      produz saída idêntica à de hoje.
- [ ] Nenhuma regra consegue auto-aprovar `gmail.send`, `calendar.update` ou
      `memory.remove` — provado por teste adversarial.
- [ ] Política malformada não aprova nada: cai no `Approval` estático.
- [ ] A política só entra em vigor depois de o dono aprovar no painel; editar a
      pasta sozinho não muda o comportamento — provado por teste.
- [ ] Nenhum texto vindo do modelo participa da decisão — provado por revisão por
      inteiro com `security-hardening` e pelo tipo de `decidePolicy`.
- [ ] `npx tsc --noEmit` limpo e `npx vitest run` verde.

**Fase 2 — POC P22** (medida no dev, veredito JSON, régua da P3)

- [ ] C1: tique ocioso com agenda vazia ≤ 1.000 ms.
- [ ] C2: tique avaliando a agenda sem nada vencido ≤ 1.000 ms.
- [ ] C3: custo fixo diário projetado (1.440 tiques + 48 heartbeats sintéticos de
      1 agente) ≤ 20% das 6 h, cronometrado **dentro** do gatilho (ADR-027 §3).
- [ ] C4: `ScriptApp.getProjectTriggers()` continua com **um** gatilho.
- [ ] ADR escrita com o número medido, reprovação inclusive.

**Fase 3 — despertar** (só se a P22 passar)

- [ ] Um compromisso vence e produz exatamente um run proativo.
- [ ] `NO_REPLY` não envia mensagem e mesmo assim aparece no trace.
- [ ] Run proativo nunca termina em `waiting` nem `paused`.
- [ ] Compromisso perdido durante indisponibilidade dispara uma vez, não N.
- [ ] Dois tiques concorrentes não duplicam o run.

## Riscos assumidos

1. **A P22 pode reprovar.** A aritmética não medida sugere ~13% da cota por agente
   com heartbeat de 30 min e run de 60 s; três agentes passariam de 40%, somados
   aos 8,47% de hoje. Se reprovar, o heartbeat muda de período ou de desenho — e a
   ADR registra a reprovação, como a P3 fez.
2. **Medir a P22 publica o dev a partir da árvore de trabalho**, levando junto o
   código não commitado da P2. Exige autorização explícita do usuário.
3. **Fronteira de confiança da pasta** continua aberta para o *estado* do run (risco
   já registrado no handoff §5). Esta spec resolve para a política, não para o run.
