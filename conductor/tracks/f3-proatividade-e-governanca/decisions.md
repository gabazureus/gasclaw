# Decisões — F3 proatividade e governança

Decisões do gate de alinhamento de 2026-09-17. Não reabrir sem motivo novo.

| # | Decisão | Por quê | Origem |
|---|---|---|---|
| D1 | **Um mecanismo, uma fonte.** Agenda em `jobs.md`; heartbeat é uma linha dela | A máquina é idêntica; muda o texto e o default de falar | G1 (A) |
| D2 | **Standing orders não viram feature** | O corpo do `AGENTS.md` já entra no prompt (`workspace.ts:118`) | G1 (A) |
| D3 | **Gramática fechada e legível**, não cron completo | Cron não expressa horário ativo nem fuso, e convida a um parser que não precisamos | G2 (A) |
| D4 | **Último disparo nas Script Properties**, nunca na pasta | Um editor da pasta não deve poder forçar redisparo (ADR-002) | G2 |
| D5 | **Heartbeat por agente, com teto global de despertares/dia no painel** | Preserva "agente = pasta" sem deixar a cota escapar | G3 (C) |
| D6 | **`NO_REPLY` + span no trace** | Sem o span não dá para distinguir "rodou e calou" de "nunca rodou" | G4 (C) |
| D7 | **Run proativo: teto próprio menor + teto diário agregado; ao estourar, falha honesta, nunca `paused`** | Um run que ninguém pediu não tem direito de fazer pergunta | G5 (B+C) |
| D8 | **Tetos ajustáveis no painel**, não constantes de código. Partida: US$ 0,02/run, US$ 0,50/dia/agente | O número certo só aparece no uso | G5 |
| D9 | **Run proativo nasce `ownerDm: false`**; exceção só se o destino for a DM do dono | Falha fechado; `MEMORY.md` privada não vaza para espaço compartilhado | G5, pergunta aberta |
| D10 | **Política determinística em código; o modelo nunca decide aprovação** | O conteúdo que a política protege entra no mesmo contexto que a avaliaria | G6 (A) |
| D11 | **A pasta sugere, o painel aprova** — mesmo precedente de `ACCESS:<folderId>` | Mantém a pasta compartilhável fora da fronteira de confiança | G6a |
| D12 | **Política pode auto-aprovar, mas só de lista fechada.** `gmail.send`, `calendar.update` e `memory.remove` nunca. Padrão: pedir. Parse ruim: fail-closed | Auto-aprovação é o valor do item; irreversível não entra | G6b (ii) |
| D13 | **`hooks/` como no Eve: recusado, com ADR** | Seria código lido da pasta do Drive (ADR-002). Não há versão segura com `eval` | G7 (A) |
| D14 | **Serialização por espaço ≠ dedupe.** Um run aberto por `<folderId>:<espaço>`; reentrega já resolvida na P2 | São dois problemas distintos sob um nome só | G8 (A) |
| D15 | **Ordem: governança → P22 → despertar → serialização → ADR dos hooks** | O usuário escolheu governança primeiro; a POC fica como gate de viabilidade | G9 |
| D16 | **Nenhum gatilho novo.** O tique de 1 min que já existe avalia a agenda | ADR-027; e os 20 gatilhos por script são finitos | restrição 3 do usuário |
| D17 | **Revoga a linha 133 do design spec** ("1 pump + 1 heartbeat + 1 jobs + 1 inbox") | Anterior à ADR-027 e à medição da P3 | achado desta track |

## Enquadramento

Isto é **dívida de execução de um desenho já escrito**, não escopo novo:
`docs/specs/2026-09-14-gasclaw-design.md` (linhas 37, 42, 44, 60, 97) já
contratualizou `HEARTBEAT.md`, `jobs.md`, standing orders e um módulo
`scheduler`; a Parte D → F3 do plano F0 repete. Varredura em `src/`: zero
ocorrências de `heartbeat`, `cron`, `schedule`, `standing`, `dedup`.

## Achado que reordenou a track

Todo caminho de escape do motor exige clique humano — `waiting` em
`agent.ts:164`, `paused` em `run.ts:190` — e nenhum dos dois é entregue ao Chat
hoje (handoff §5). Um run proativo não tem ninguém do outro lado. Por isso
governança **não** é paralela à proatividade: é pré-requisito.
