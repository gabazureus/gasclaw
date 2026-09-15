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

## Limitações conhecidas
1. **`mem-limite` é offline:** o texto de 2.200 bytes não cabe no teto de 2 KB do cenário enviado no POST. O teto é limitação da nossa CLI, não do produto.
2. **Sem evals de sessão:** o runner zera o histórico em `(nova sessão)` e não toca no Drive nem no cache, então um cenário passaria mesmo sem a persistência existir. A cobertura ficou em teste unitário. Para valer no dev, o runner precisaria de um `(nova execução)` que limpe só o contexto do processo, e o `env` do eval precisaria receber um `sessionIO` — não cabe em poucas linhas.
3. **`mem-privado` é teste, não eval:** o runner só fala pela DM do dono; "num espaço" não dá para escrever em cenário. Vira eval quando o runner simular espaço.

## Consequências
- O `main.ts` precisa de um diff para valer em produção: deps de sessão (`history`/`saveHistory`/`compact`), fuso na memória, índice de skills e provider no ctx, hook de bootstrap e registro da POC P18. Sem ele, o comportamento é o de antes.
- Uma conversa longa passa a custar 1 leitura e 1 escrita no Drive por turno (com cache na leitura) e, quando compacta, 1 chamada a mais ao modelo, fora do caminho da resposta.
- A pasta do agente ganha `memory/`, `skills/` e `.gasclaw/sessions/`, todas criadas sozinhas.
