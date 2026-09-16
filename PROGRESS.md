# PROGRESS — gasclaw

> Onde o gasclaw está, item por item, com a porcentagem de progresso e se já foi resolvido.
> **Atualizado em:** 2026-09-16 · dev na versão 74 · P3 aprovada 4/4 (worker 3.992 ms, idle completo 716 ms, 8,47% das 6 h) · P4 aprovada 3/3 · P19 aprovada 3/3 · P20 aprovada 5/5 (Drive, 24 h, uso único e vínculo) · testes 748/748 · prod ainda na versão 1.
> **Fontes:** [spec](docs/specs/), [plano F0](docs/plans/2026-09-14-gasclaw-f0-plano-implementacao.md),
> [ADRs](docs/adr/README.md), [CHANGELOG](CHANGELOG.md), [log da wiki](docs/wiki/log.md),
> [tracks](conductor/tracks.md), Beads (`bd list`) e `git log`.

## Como ler

**Porcentagem**
| Valor | Significado |
|---|---|
| 100% | feito **e** verificado de verdade (no Google ou nos testes) |
| até 70% | código pronto com testes, mas ainda sem verificação real |
| 10% | só desenhado (spec, ADR ou decisão registrada) |
| 0% | nada feito |

A porcentagem de cada fase é a média simples dos itens dela.

**Status:** ✅ feito · 🟢 quase · 🔄 em andamento · 🟡 parcial · ⏳ planejado · ⏸️ adiado · ❌ bloqueado

**Resolvido?**
| Marca | Significado |
|---|---|
| ✅ Sim | concluído e verificado; não precisa de mais nada |
| 🟡 Parcial | uma parte está verificada, mas falta algo listado em "O que falta" |
| ❌ Não | ainda não foi feito ou não foi verificado |
| ⏸️ Adiado | parado por decisão do usuário |

---

## Resumo

| Fase | Itens | Progresso | Resolvidos |
|---|---|---|---|
| **F0**: fundação e primeira fatia | 18 | ████████░░ **82%** | 11 de 18 |
| **F1**: agente-pasta completo | 21 | ██████░░░░ **56%** | 7 de 21 |
| **F2**: tarefas longas e aprovação | 12 | █████░░░░░ **51%** | 5 de 12 |
| **F3**: proatividade e dados | 4 | █░░░░░░░░░ **10%** | 0 de 4 |
| **F4**: canais extras | 4 | █░░░░░░░░░ **10%** | 0 de 4 |
| **Transversal** (docs, open source, segurança, POCs) | 22 | ███████░░░ **69%** | 12 de 22 |
| **Produto (F0–F4)** | 59 | ██████░░░░ **56%** | 23 de 59 |
| **Geral** | 81 | ██████░░░░ **60%** | 35 de 81 |

> A F1 subiu de 45% para 56% porque seis itens ficaram prontos no dev e foram medidos: trace do agente (P14 12/12),
> observabilidade na tela (P15 6/6), motor de tools, aprovação com card, ferramentas do Google e o rodízio de
> modelos gratuitos (P11 5/5). **Ressalva do rodízio:** foi uma execução só, e um turno levou 35,8 s contra
> mediana de 4,1 s — os modelos gratuitos têm cauda longa, então "funciona" ainda não quer dizer "é estável".
> O Transversal subiu de 65% para 69% com a auditoria concluída sem nenhum crítico e dois itens novos (aviso honesto
> quando a ferramenta falha; ação com efeito que sobrevive à resposta perdida).
>
> A F2 chegou a 51% com o **núcleo do run durável** ([ADR-026](docs/adr/026-run-duravel.md)), o gatilho-worker medido
> pela P3 ([ADR-027](docs/adr/027-gatilho-worker.md)): checkpoint por passo, estado na pasta do agente, fila própria,
> lease de 6 min, teto de US$ 0,10 e incerteza honesta para efeitos em voo. A P4 provou no dev v66 que o mesmo run
> atravessa três execuções e não repete um efeito já registrado; a P19 provou no v72 que uma morte depois do efeito
> deixa `inflight` durável, não chama o passo na retomada e devolve o aviso de incerteza. A P20 provou no v74 que a
> aprovação sobrevive sem cache por 24 h, não é consumida por terceiro e não reenfileira no clique repetido.
>
> **O que ainda segura a F1 e o produto:** o acesso de outra pessoa nunca foi testado de verdade na tela (90%);
> a tela de chat está só com texto, porque a voz foi adiada por você (80%); "Novo agente" ainda não foi usado na tela (85%).
> **Fora do produto:** as POCs ainda vão no bundle de prod, só desligadas; **prod segue na versão 1**, enquanto o dev está na 73;
> a publicação pelo GitHub/CI continua adiada por você; e o Monitoring fica indisponível porque você decidiu não habilitar faturamento.

---

## F0 — Fundação e primeira fatia utilizável (82%)

| Elemento | Status | % | Resolvido? | O que falta | Fonte |
|---|---|---|---|---|---|
| Fundação: devmode, hub de docs, commit inicial | ✅ | 100 | ✅ Sim | — | plano#Task 0 |
| Build (esbuild IIFE) e testes (vitest) | ✅ | 100 | ✅ Sim | — | plano#Task 1 |
| Leitura da pasta do agente (`workspace`) | ✅ | 100 | ✅ Sim | — | plano#Task 2 |
| Cliente OpenRouter (`llm`) | ✅ | 100 | ✅ Sim | — | plano#Task 3 |
| Turno do agente com histórico limitado (`agent`) | ✅ | 100 | ✅ Sim | — | plano#Task 4 |
| Handler do Google Chat e botão de pausa (`chat`) | ✅ | 100 | ✅ Sim | — | plano#Task 5; log (Chat respondeu "pausado") |
| Armazenamento: chave, agentes, pausa, cache (`store`) | ✅ | 100 | ✅ Sim | — | plano#Task 6 |
| Tela gasclaw: chave, agente ⭐, teste, pausar | ✅ | 100 | ✅ Sim | — | plano#Task 7 |
| CLI `./gasclaw` | 🟢 | 85 | 🟡 Parcial | verificados: `up`, `down`, `status`, `doctor`, `rollback`; falta testar `restart`, `ship`, `logs` e `open` | plano#Task 8 |
| Deploy dev (`./gasclaw up`) | ✅ | 100 | ✅ Sim | — (hoje na versão 3) | log#Task 9 |
| POC P1: chamada longa ao OpenRouter | ✅ | 100 | ✅ Sim | — (109–126 s sem erro) | [ADR-010](docs/adr/010-poc-p1-urlfetch.md) |
| ADR-009, índices e tracks (Task 11) | ✅ | 100 | ✅ Sim | — (commit `2d22645`) | [ADR-009](docs/adr/009-ajustes-f0.md) |
| Teste: editar `SOUL.md` sem novo deploy (haicai) | ⏳ | 70 | ❌ Não | rodar o teste no dev | plano#Task 9 Step 5 |
| Teste: memória no Chat ("o que eu disse antes?") | ⏳ | 70 | ❌ Não | rodar o teste no dev | plano#Task 9 Step 6 |
| Teste: outra pessoa do domínio fala com o agente | ⏳ | 70 | ❌ Não | pôr o e-mail em `users` e testar (risco: "Acesso negado" no Drive) | plano#Task 9 Step 6 |
| Ambiente prod | 🟡 | 60 | 🟡 Parcial | feito: projeto, script, web app, app do Chat e `doctor --prod`; falta a chave e o agente na tela de prod, e uma conversa | log#prod |
| GitHub privado, secret, push e CI verde (Task 10) | ⏸️ | 20 | ⏸️ Adiado | só o `deploy.yml` existe; faltam `gh auth login` (deu erro, causa não investigada), o repo, o secret `CLASPRC_JSON` e o push | plano#Task 10; Beads `gasclaw-mw8` |
| POC P7: validade do token do CI | ⏸️ | 0 | ⏸️ Adiado | depende da Task 10 | spec#11 |

---

## F1 — Agente-pasta completo (56%)

| Elemento | Status | % | Resolvido? | O que falta | Fonte |
|---|---|---|---|---|---|
| **POC P6: agentes em Google Docs/Sheets nativos (com `.md` também)** | ✅ | 100 | ✅ Sim | — (passou em 2 execuções automáticas; a leitura híbrida em produção e a opção "Criar como Docs \| Markdown" entram nos itens seguintes da F1) | [ADR-012](docs/adr/012-agentes-em-docs-e-sheets.md); [poc/p6-docs-nativos](poc/p6-docs-nativos/README.md) |
| **Autoria no editor do Apps Script** (`agentes/<nome>/<PAPEL>.md.html` + pasta do Drive criada sozinha) | 🟢 | 85 | 🟡 Parcial | no dev (v14): `loadAgent` lê editor → Google Doc → `.md` (+ planilha `config`) com cache de 30 s; edição no editor chega ao agente em 12,8 s sem `up` (C7); se o editor falhar, segue com o Drive e registra no trace; motor em 1 arquivo; `up` preserva o editor; falta só usar "Novo agente" de verdade na tela (e, depois, levar para prod) | [ADR-013](docs/adr/013-autoria-editor-e-drive.md); [poc/p10-editor](poc/p10-editor/README.md) |
| Trace do agente: cada run com os passos (arquivos lidos e origem, prompt, chamadas ao modelo com tokens/custo, ferramentas, memória, resposta) · aba Ao vivo + detalhe do run na tela · planilha com 1 linha por run · JSON completo em `gasclaw/runs/<id>.json` guardado por 90 dias e depois para a lixeira · `./gasclaw trace <id>` | ✅ | 100 | ✅ Sim | — (POC P14 12/12 na v34 com o desenho em lote: turno com p95 de 636 ms, cobertura 1,000, tela em 1,3 s, planilha em 38,1 s pelo gatilho, 0 vazamentos, 21 min/dia de gatilho contra a cota de 360) | [ADR-014](docs/adr/014-trace-do-agente.md); [ADR-020](docs/adr/020-trace-em-lote.md); [poc/p14-trace](poc/p14-trace/README.md) |
| **Observabilidade na tela** (lote de 1 min, modelos e custo por modelo, limites) | ✅ | 100 | ✅ Sim | — (no dev: abas Ao vivo, Lote, Modelos e custo e Limites; `./gasclaw limits` e `usage`; P15 6/6 e P16 7/7 na v35, com o custo do trace a −0,1% do que o OpenRouter cobrou; gatilho de 1 min ativo). Monitoring segue indisponível por faturamento, decisão do usuário | [ADR-016](docs/adr/016-painel-de-limites.md); [ADR-018](docs/adr/018-modelos-e-custo.md); [poc/p15-limites](poc/p15-limites/README.md); [poc/p16-custo](poc/p16-custo/README.md) |
| E0 harness de evals (`./gasclaw eval`) | ✅ | 100 | ✅ Sim | — (6/6 no dev v16: smoke, e1-now, e1-memoria, e1-limite, e1-injecao, e1-fora-da-lista) | commit `9fa87d7` |
| E1 motor de tools (allowlist, schema, limite de passos, memória só na DM do dono) | ✅ | 100 | ✅ Sim | — (toolkit ligado no Chat real e só com as tools aprovadas no painel; evals `e1-*` verdes na v35) | `9fa87d7`, `c9c11c9` |
| E5 aprovação + ask | ✅ | 100 | ✅ Sim | — (aprovação de tool: uso único e 24 h no Drive desde P20/v74; `ask`: 10 min no cache; evals e `webchat-*` verdes) | [ADR-028](docs/adr/028-aprovacao-duravel.md); `106f11e`, `7cb6e42`, `69f4ac8` |
| E6 ferramentas do Workspace por REST (agenda, Gmail, contatos, tarefas, Drive/Docs/Sheets) | ✅ | 100 | ✅ Sim | — no dev: 7 evals `e6-*` verdes na v35 (agenda, freebusy, gmail-rascunho, contato, drive, tarefa, injeção), cada um apagando o que criou; ferramentas do Google só para o dono, com card completo | [ADR-023](docs/adr/023-ferramentas-do-workspace-rest.md) |
| P17 / ADR-019: tela de chat do gasclaw e voz | 🟢 | 80 | 🟡 Parcial | texto pronto no dev (`?page=chat`, link absoluto, trace completo, `webchat-*` verdes na v35); **voz adiada por decisão do usuário** | [ADR-019](docs/adr/019-tela-de-chat-e-voz.md) |
| **Acesso e ferramentas aprovados no painel** (M2, ADR-021) | 🟢 | 90 | 🟡 Parcial | no dev: todo agente fica só com o dono e sem tools até o clique em Aprovar; falta **testar o acesso de outra pessoa de verdade na tela** | [ADR-021](docs/adr/021-acesso-aprovado-no-painel.md) |
| Rodízio de modelos gratuitos (`model: free`) | 🟢 | 90 | 🟡 Parcial | no dev e medido pela POC P11 na v39 (5 de 5): 20 de 20 turnos, troca de modelo em 1,1 s, p95 de 10,9 s. Escreva `free` no `AGENTS` ou na tela. Falta **tirar a consulta de cota do caminho do turno** (ela levou o C7 da P16 a 6 chamadas ao `/key` em 30 min, contra o teto de 3) e repetir a medição: uma execução só, com um turno de 35,8 s contra mediana de 4,1 s | [ADR-025](docs/adr/025-rodizio-de-modelos-gratuitos.md); [poc/p11-free](poc/p11-free/README.md) |
| Chat na tela gasclaw (para quem usa Gmail pessoal) | ⏳ | 10 | ❌ Não | decidido: aba de conversa no web app, com instalação e cota próprias da pessoa; exige ADR (a spec §2 deixava o chat web fora do MVP) | Beads `gasclaw-v53` |
| `./gasclaw up` detecta Gmail pessoal e pula o Chat | ⏳ | 10 | ❌ Não | decidido: conta `@gmail.com` → pula consentimento Interno e app do Chat; verificar consentimento "Externo/Teste" | Beads `gasclaw-v53` |
| Conversas no Drive e resumo automático | ⏳ | 10 | ❌ Não | tudo (pode usar Sheets, se a P6 passar) | spec#6; plano#D.F1.1 |
| Memória: `remember`, `memory/AAAA-MM-DD.md`, `MEMORY.md` (inspirada em Eve/OpenClaw) | ⏳ | 10 | ❌ Não | tudo; primeira tool, exige suporte a tool calls no `llm` | spec#3, #6; plano#D.F1.2 |
| Ritual de estreia `BOOTSTRAP.md` | ⏳ | 10 | ❌ Não | tudo | plano#D.F1.3 |
| Skills (`read_skill`) | ⏳ | 10 | ❌ Não | tudo | plano#D.F1.4 |
| Vários agentes, cada espaço do Chat ligado ao seu | 🟡 | 20 | ❌ Não | a lista com ⭐ já existe; falta o vínculo por espaço | plano#D.F1.5 |
| Grupos do Google em `users` | ⏳ | 10 | ❌ Não | tudo | plano#D.F1.6 |
| Deploy seguro: divergência, poda de versões, rollback automático | ⏳ | 10 | ❌ Não | tudo; o rollback automático no CI depende da Task 10 | spec#9; plano#D.F1.7 |
| "Verificar" na tela | 🟡 | 30 | ❌ Não | já verifica a pasta e cria os arquivos; falta a chamada real ao LLM e a checagem do Chat | plano#D.F1.8 |

---

## F2 — Tarefas longas e aprovação (51%)

| Elemento | Status | % | Resolvido? | O que falta | Fonte |
|---|---|---|---|---|---|
| POC P2: Chat assíncrono (card enviado depois) | ⏳ | 10 | ❌ Não | tudo | spec#10; ADR-006 |
| POC P3: gatilho como worker do pump | ✅ | 100 | ✅ Sim | — (4/4 repetido no dev v60 após incluir a reconciliação durável de traces interrompidos; custo fixo projetado em 8,47% da cota Workspace) | spec#10; [ADR-027](docs/adr/027-gatilho-worker.md) |
| POC P4: run durável em 3+ execuções | ✅ | 100 | ✅ Sim | — (dev v66: cache removido antes de cada retomada; mesmo `runId`, checkpoints 1→2→done, resposta `p4-ok`, 1 efeito e 1 chave durável) | spec#10; ADR-005, [ADR-026](docs/adr/026-run-duravel.md) |
| POC P19: morte entre efeito e checkpoint | ✅ | 100 | ✅ Sim | — (dev v72: 1 efeito, `inflight` no Drive, 0 `done key`, 0 chamadas do passo na retomada e aviso honesto) | [POC](poc/p19-inflight/README.md); [ADR-026](docs/adr/026-run-duravel.md) |
| POC P20: aprovação durável | ✅ | 100 | ✅ Sim | — (dev v74: cache removido; aprovação após 660.001 ms; terceiro e clique duplo recusados; expiração em 24 h rotaciona sem replay; 1 efeito por run) | [POC](poc/p20-approval/README.md); [ADR-028](docs/adr/028-aprovacao-duravel.md) |
| POC P5: GASADK com seam OpenRouter e checkpoint | ⏳ | 10 | ❌ Não | tudo | ADR-004 |
| Resposta em até 20 s, senão "pensando…" e fila | ⏳ | 10 | ❌ Não | tudo | spec#6 |
| Checkpoint, lease, estados e idempotência | ✅ | 100 | ✅ Sim | — (P4 provou retomadas ordenadas; P19 provou a janela ambígua depois do efeito) | spec#6; plano#D.F2.5; [ADR-026](docs/adr/026-run-duravel.md) |
| Limites `steps` e `usd_per_run` | 🟡 | 50 | ❌ Não | teto de US$ 0,10 por run no núcleo, com pausa e opção de continuar; falta alimentar o custo real de cada passo | plano#D.F2.5; [ADR-026](docs/adr/026-run-duravel.md) |
| Tools (Gmail, Drive, Sheets, Docs, Agenda, HTTP) com cards Aprovar/Negar | ⏳ | 10 | ❌ Não | tudo | spec#8; plano#D.F2.6 |
| Retry com backoff em 429/5xx | ⏳ | 10 | ❌ Não | tudo (parte vem antes, com o rodízio de modelos gratuitos) | plano#D.F2.7 |
| **Papéis responder, validar e redigir, só sob pedido (POC P9)** | ⏳ | 10 | ❌ Não | decidido: resposta normal com 1 modelo; um comando (ex.: `/revisar`) aciona validador e redator no modo "pensando…" | Beads `gasclaw-v53` |

---

## F3 — Proatividade e dados (10%)

| Elemento | Status | % | Resolvido? | O que falta | Fonte |
|---|---|---|---|---|---|
| `HEARTBEAT.md` (a cada 30 min, no horário ativo) | ⏳ | 10 | ❌ Não | tudo | plano#D.F3.1 |
| `jobs.md` (cron) e tool `schedule` | ⏳ | 10 | ❌ Não | tudo | plano#D.F3.2 |
| Inbox Excel → Google Sheets (POC P8) | ⏳ | 10 | ❌ Não | tudo | plano#D.F3.3 |
| Modelos prontos: assistente executivo e analista de planilhas | ⏳ | 10 | ❌ Não | tudo | plano#D.F3.4 |

---

## F4 — Canais extras (10%)

| Elemento | Status | % | Resolvido? | O que falta | Fonte |
|---|---|---|---|---|---|
| Gmail: label `gasclaw` vira tarefa, resposta na thread | ⏳ | 10 | ❌ Não | tudo | plano#D.F4.1 |
| HTTP `doPost` com token | ⏳ | 10 | ❌ Não | tudo | plano#D.F4.2 |
| MCP/A2A (só se a P5 passar) | ⏳ | 10 | ❌ Não | depende da P5 | ADR-004 |
| `npx gasclaw` para qualquer pessoa instalar | ⏳ | 10 | ❌ Não | tudo | plano#D.F4.3 |

---

## Transversal (69%)

| Elemento | Status | % | Resolvido? | O que falta | Fonte |
|---|---|---|---|---|---|
| Hub `docs/` | ✅ | 100 | ✅ Sim | — | ADR-007 |
| Spec e ADRs 001–023 | ✅ | 100 | ✅ Sim | — (004, 005 e 006 seguem "Proposto" até as POCs; ADR-019, da voz, segue proposto por decisão do usuário) | [ADRs](docs/adr/README.md) |
| CHANGELOG | ✅ | 100 | ✅ Sim | — | [CHANGELOG](CHANGELOG.md) |
| `como-usar.md` e READMEs (EN e pt-BR) | ✅ | 100 | ✅ Sim | — (conferidos com o estado real da F1 pela auditoria em `f7a8fec`; avisos dos ADR-021 e 022 em `c098b41`) | [como-usar](docs/como-usar.md) |
| Auditoria completa (0 críticos · 12 altos · 25 médios · 18 baixos) | 🟢 | 95 | 🟡 Parcial | concluída sem nenhum crítico; corrigidos A3, A4, A5, M1 (CSRF por segredo, ADR-022), M2 (acesso no painel, ADR-021), M16, M19, B1–B4, redact de mais formatos, lote e limites; pendentes de baixa severidade no Beads: M13, M18, clique de terceiro no ticket, `INTEGRATION.md` do devmode | ADR-020, 021, 022 |
| Ações com efeito que sobrevivem à resposta perdida (job recuperável) | ✅ | 100 | ✅ Sim | — o Google às vezes perde a resposta do web app (medido: sem relação com duração nem com chamadas simultâneas); cada ação com efeito leva um identificador, o servidor executa uma vez só e a CLI busca o resultado guardado em vez de repetir a chamada | [ADR-020](docs/adr/020-trace-em-lote.md) |
| Aviso honesto quando a ferramenta falha | ✅ | 100 | ✅ Sim | — com a ferramenta falhando, o agente avisa em vez de dizer que fez; havia o caso oposto (a API do Google desligada e o agente respondendo "Evento criado") | [ADR-023](docs/adr/023-ferramentas-do-workspace-rest.md) |
| POCs fora do bundle de prod | ⏳ | 10 | ❌ Não | hoje o código das POCs vai no bundle de prod, só desligado por `__DEV__` (ADR-022); tirar do bundle | ADR-022 |
| `product.md`, `tech-stack.md`, `UBIQUITOUS_LANGUAGE.md` | ✅ | 100 | ✅ Sim | — | plano#A.4 |
| Runbooks `setup-inicial` e `devmode-update` | ✅ | 100 | ✅ Sim | — | plano#A.4 |
| Arquivos open source (LICENSE Apache-2.0, NOTICE, LICENSING, CoC, CONTRIBUTING) | ✅ | 100 | ✅ Sim | — (conferir o texto do CoC 2.1 no site oficial antes de abrir o repo) | ADR-011 |
| Sem `eval`; pasta do agente nunca vira código | ✅ | 100 | ✅ Sim | — | ADR-002 |
| Web app `MYSELF` e `assertOwner` | ✅ | 100 | ✅ Sim | — (o Chat funcionou sem `DOMAIN`) | ADR-009 |
| Segredos fora do git (`.env`, `.env.local`, `.clasprc`) | ✅ | 100 | ✅ Sim | — (histórico verificado sem segredos) | log#prod |
| Wiki (`overview`, entidades, conceitos) | 🟡 | 40 | 🟡 Parcial | o log está em dia; o `overview.md` está vazio | docs/wiki |
| Preparação para abrir o repo | 🟡 | 40 | 🟡 Parcial | histórico limpo; falta trocar `OWNER/gasclaw` e decidir o `gasclaw.env` (tem domínio e IDs) | ADR-011 |
| Regra "POC em `poc/` com critério e ADR" | 🟡 | 75 | 🟡 Parcial | a P6 já está em `poc/`; a P1 ainda mora em `src/main.ts` | CLAUDE.md |
| Numeração das POCs consistente na spec | 🟡 | 30 | ❌ Não | P6 = Docs/Sheets e P8 = Excel só no ADR-009; spec §10–11 desatualizada; P2/P3 aparecem na F0 da spec e na F2 do plano | ADR-009 item 20 |
| Admin Workspace: "apps confiáveis" (pré-requisito da P7) | ⏳ | 10 | ❌ Não | configurar no Admin | runbook setup-inicial |
| Runbook de migração para conta dedicada | ⏳ | 10 | ❌ Não | escrever | spec#12; ADR-008 |
| Compra única de US$ 10 no OpenRouter (1.000 req/dia nos modelos gratuitos) | ⏳ | 0 | ❌ Não | **ação sua**: comprar no site do OpenRouter (os créditos não são gastos usando modelos gratuitos) | Beads `gasclaw-v53` |
| Privacidade dos provedores gratuitos (registro/treino das conversas) | ⏳ | 0 | ❌ Não | verificar a política antes de usar `model: free` com memória pessoal | Beads `gasclaw-v53` |

---

## POCs

| POC | Fase | Status | Resolvido? | Critério | Resultado |
|---|---|---|---|---|---|
| P1: chamada longa (UrlFetch) | F0 | ✅ | ✅ Sim | mais de 60 s sem erro | 109,5 s, 110,1 s e 126,1 s sem erro ([ADR-010](docs/adr/010-poc-p1-urlfetch.md)) |
| P2: Chat assíncrono | F2 | ⏳ | ❌ Não | card enviado 2 min depois do evento, sem chave de conta de serviço | — |
| P3: gatilho-worker | F2 | ✅ | ✅ Sim | C1 `runId` correto termina em `done/ok` · C2 worker sintético ≤ 10 s · C3 handler completo vazio < 1 s · C4 custo fixo ≤ 20% das 6 h | dev v60: 3.992 ms · 716 ms com zero traces/runs · 1.829.440 ms/dia (8,47%) · 4/4 ([ADR-027](docs/adr/027-gatilho-worker.md)) |
| P4: run durável | F2 | ✅ | ✅ Sim | 3+ execuções sem perder estado e **zero efeito duplicado em retomadas ordenadas** | dev v66: 3 UUIDs, leitura forçada do Drive, checkpoints 1→2→done, `p4-ok`, 1 efeito/1 chave ([POC](poc/p4-run/README.md), [ADR-026](docs/adr/026-run-duravel.md)) |
| P19: efeito em voo | F2 | ✅ | ✅ Sim | morte depois do efeito e antes do checkpoint final; zero repetição e aviso honesto | dev v72: `inflight: gmail.send`, 1 efeito, 0 `done key`, 0 chamadas do passo na retomada, status `failed` ([POC](poc/p19-inflight/README.md), [ADR-026](docs/adr/026-run-duravel.md)) |
| P5: GASADK | F2 | ⏳ | ❌ Não | planner via OpenRouter com checkpoint por step | — |
| **P6: Docs/Sheets nativos** | F1 | ✅ | ✅ Sim | C1: 4 Docs < 3 s · C2: < 200 ms com cache (V1, V2 ou validade de 30 s) · C3: editar invalida o cache · C4: títulos e listas preservados · C5: pasta mista resolve cada papel | C1 1,1–1,2 s; V1 472–608 ms e V2 294–383 ms → validade de 30 s (54–77 ms); C3, C4 e C5 ✅ ([ADR-012](docs/adr/012-agentes-em-docs-e-sheets.md)) |
| P7: token do CI | F0 | ⏸️ | ⏸️ Adiado | deploy verde 8+ dias depois do login | — |
| **P10: editor do Apps Script** | F1 | ✅ | ✅ Sim | C1 nomes `.md.html` preservados · C3 leitura fiel byte a byte, listagem sem hardcode, < 3 s, precedência editor → Doc → `.md` · C4 edição chega sem `up` · C5 `up` preserva o editor · C6 motor em 1 arquivo | ver a linha da P10 na Esteira e o [ADR-013](docs/adr/013-autoria-editor-e-drive.md) |
| P15: painel de limites | F1 | ⏳ | ❌ Não | C1 11 fontes ok/pendente · C2 cache < 1 s · C3 selos · C4 linha diária · C5 `./gasclaw limits` · C6 de quem é a cota | código pronto; medição aguarda gcloud e reautorização ([ADR-016](docs/adr/016-painel-de-limites.md)) |
| P16: modelos e custo | F1 | ⏳ | ❌ Não | C1 ±2% do `usage_daily` · C2 < 1 s · C3 dia = soma das horas · C4 troca ≤ 30 s · C5 recusa sem tools · C6 `prune` · C7 ≤ 3 `/key` em 30 min | código pronto; medição aguarda gcloud ([ADR-018](docs/adr/018-modelos-e-custo.md)) |
| **P11: rodízio de modelos gratuitos** | F1 | ✅ | ✅ Sim | C1–C5 na Esteira | 5 de 5 na v39: C1 20/20 turnos · C2 p95 10.924 ms (mediana 4.051 ms) · C3 troca em 1.146 ms · C4 nenhum candidato sem ferramentas · C5 automática. Expôs dois defeitos: o 403 "only available on agentic harnesses" travava o rodízio (0 de 20 na v37) e o `step()` aceitava `{"ok":false}` com HTTP 200 ([ADR-025](docs/adr/025-rodizio-de-modelos-gratuitos.md)) |
| **P14: trace do agente** | F1 | 🟡 | 🟡 Parcial | C1–C10 na Esteira | 2 execuções automáticas: C2–C5 e C7–C10 ✅; C1 ❌ p95 3.893 ms; C6 tela 2,5 s ✅ e planilha 5,2 s ([ADR-014](docs/adr/014-trace-do-agente.md)) |
| P8: Excel → Sheets | F3 | ⏳ | ❌ Não | xlsx de 5 MB lido em < 60 s | — |
| P9: papéis responder/validar/redigir | F2 | ⏳ | ❌ Não | a definir: tempo da cadeia com modelos gratuitos e ganho de qualidade medido | — |

---

## Fatos verificados que guiam as próximas decisões (2026-09-14)

| Fato | Fonte | Consequência |
|---|---|---|
| O OpenRouter tem **22 de 445** modelos gratuitos, 19 com tools | `GET https://openrouter.ai/api/v1/models` | dá para ter um rodízio com modelos que aceitam tools |
| Modelos `:free`: **20 req/min**; **50 req/dia** sem créditos e **1.000 req/dia** com compra única de US$ 10 ou mais; o limite vale por conta, somando todos os modelos | docs OpenRouter, *API reference → Limits* | o rodízio não aumenta a cota diária; três papéis custam três chamadas por mensagem |
| Criar um app do Chat exige *"A Business or Enterprise Google Workspace account"* | Google, quickstart de Chat app com Apps Script | quem usa Gmail pessoal não tem app do Chat → chat na tela gasclaw |
| O export de Doc como markdown é `drive/v3/files/{id}/export?mimeType=text/markdown` (até 10 MB) e o escopo `drive` já basta | docs da Drive API, conferido pelo orquestrador | a P6 não pediu reautorização |
| O Apps Script aguenta uma chamada única de mais de 2 min | ADR-010 | a F2 pode fazer chamadas longas por passo |
| Upload com conversão aceita Markdown → Google Doc; listar a pasta custa 294–608 ms | docs da Drive API; ADR-012 | a tela pode criar Docs sem escopo novo; cache de 30 s em vez de validar a cada mensagem |

## Decisões recentes (2026-09-14)

| Decisão | Resolvido? | Onde está registrada |
|---|---|---|
| Fechar a F0 com markdown; a F1 começa pela POC P6 | ✅ Sim | log da wiki; ADR-009 |
| Suportar os dois formatos (Google Doc e `.md`); a tela oferece "Criar como Docs \| Markdown" | 🟡 Parcial (núcleo pronto; tela na F1) | Beads `gasclaw-0ce` |
| Cache da P6: nenhuma checagem ficou abaixo de 200 ms → validade de 30 s | ✅ Sim (medido) | [ADR-012](docs/adr/012-agentes-em-docs-e-sheets.md) |
| GitHub e CI adiados | ⏸️ Adiado | Beads `gasclaw-mw8` |
| Não trocar a chave do OpenRouter que apareceu parcialmente na sessão | ✅ Sim (risco aceito) | CHANGELOG#Segurança |
| Modelos gratuitos: rodízio na F1, logo depois da P6 | ✅ Sim (decisão) | Beads `gasclaw-v53` |
| Papéis responder/validar/redigir só sob pedido, na F2 | ✅ Sim (decisão) | Beads `gasclaw-v53` |
| Compra única de US$ 10 no OpenRouter | ✅ Sim (decisão; a compra é sua) | Beads `gasclaw-v53` |
| Segunda usuária com Gmail pessoal: instalação própria e chat na tela; o `up` detecta e pula o Chat | ✅ Sim (decisão) | Beads `gasclaw-v53` |

## Bloqueios e próximos passos

1. **POCs sem trabalho manual:** `./gasclaw poc <id>` (a P6 passou; as próximas POCs seguem o mesmo padrão).
2. **Fechar as ressalvas da F0:** teste do haicai, memória no Chat, outra pessoa do domínio, e a chave e o agente no prod.
3. **Agora (P6 resolvida):** o plano detalhado da F1, começando pela leitura híbrida com cache de 30 s (rodízio `model: free`, chat na tela, detecção de Gmail pessoal, memória).
4. **Quando quiser:** retomar a Task 10 (GitHub) investigando antes o erro do `gh auth login`.

## Esteira de POCs (evoluir a aplicação junto com as medições)

Cada POC tem critério medido, roda sozinha por `./gasclaw poc <id>` (só no dev, com arquivos de teste criados automaticamente) e termina num ADR. Quando passa, a capacidade entra no produto no item da fase indicado. Ordem de execução de cima para baixo.

| Ordem | POC | Pergunta que responde | Critérios medidos | Automação | Status | Libera no produto |
|---|---|---|---|---|---|---|
| — | P1: chamada longa | O UrlFetch aguenta mais de 60 s? | > 60 s sem erro | botão/`poc p1` | ✅ passou (109–126 s) · ADR-010 | F2: passos longos |
| — | P6: Docs/Sheets nativos | Dá para ler o agente em Google Docs rápido e fiel? | C1 < 3 s · C2 < 200 ms com cache · C3 edição invalida · C4 títulos/listas · C5 pasta mista | `poc p6` (100% automática) | ✅ passou (C1 1,1–1,2 s; cache 30 s) · ADR-012 | F1: leitura híbrida Doc/.md |
| — | P10: editor do Apps Script como pasta do agente | Dá para criar e editar o agente dentro do editor do Apps Script, com nomes de arquivo servindo de pastas e o motor num único arquivo? | C1 nomes `.md.html` preservados · C2 exibição no editor · C3 leitura fiel byte a byte, listagem sem hardcode, < 3 s, precedência editor → Doc → `.md` · C4 edição chega ao agente sem `up` · C5 `up` não apaga o editor · C6 motor em 1 arquivo | `poc p10` (100% automática) | ✅ passou (execução 1 completa; execução 2 parcial repetiu C1, C3 e C4): `getContent` não é fiel, `getRawContent` e o export do HEAD são (419–1.270 ms); edição vista sem deploy pelo export; `up` 34,8 s preserva; só `_motor.gs` · ADR-013 | F1: autoria no editor + Drive |
| 1 | **P14: trace do agente** | Dá para registrar cada run do agente, passo a passo, e ver ao vivo dentro do gasclaw (tela, planilha e `./gasclaw trace`) sem passar dos 30 s do Chat e sem duplicar a página Execuções do Google? | C1 checkpoint + flush com p95 < 1,5 s em 50 runs · C2 5 runs simultâneos sem misturar · C3 falha de gravação não derruba a resposta · C4 criação automática da planilha e da pasta · C5 `./gasclaw poc p14` · C6 ao vivo ≤ 5 s · C7 polling 5 s por 30 min dentro da cota · C8 trace com `resolve_agent` + `llm_call` + `reply`, soma dos passos ±10% da duração · C9 zero ocorrência de chave ou `Bearer` (teste canário) · C10 `./gasclaw trace <id>` mostra a árvore | `poc p14` (100% automática) | 🟡 8 de 10 no dev (v13): C1 p95 3.893 ms ❌ (JSON síncrono 1,3–1,6 s); C6 tela 2,5 s ✅, planilha 5,2 s; C8 cobertura 0,92; C9 0 vazamentos · ADR-014 | F1: trace do agente (aba Ao vivo, detalhe do run, planilha, `gasclaw/runs/<id>.json` por 90 dias); base de medição da P11 e da P9 |
| 2 | P11: rodízio de modelos gratuitos | Os modelos `:free` respondem dentro dos 30 s do Chat com troca automática? | taxa de sucesso ≥ 95% em 20 mensagens · p95 < 25 s · troca em 429/5xx < 2 s | `poc p11` | ⏳ | F1: `model: free` |
| 3 | P12: conta Gmail pessoal | O gasclaw instala e roda numa conta `@gmail.com` (consentimento Externo/Teste) sem o app do Chat? | `up` sem pausas de Workspace · chat na tela responde · token dura ≥ 8 dias | `poc p12` (precisa de uma conta pessoal de teste) | ⏳ | F1: chat na tela e 2ª usuária |
| 4 | P2: Chat assíncrono | Dá para responder "pensando…" e enviar a resposta depois, como app? | card enviado 2 min depois do evento, sem chave de conta de serviço | `poc p2` | ⏳ | F2: resposta assíncrona |
| 5 | P3: gatilho-worker | O custo fixo do worker direto deixa margem para o trabalho real? | worker ≤ 10 s · idle completo < 1 s · 1.440 idles + 200 steps/dia ≤ 20% de 6 h | `poc p3` | ✅ 4/4 no dev v60 | F2: execução durável |
| 6 | P4: run durável | Uma tarefa sobrevive a várias execuções? | 3+ execuções sem perder estado e zero efeito duplicado | `poc p4` | ✅ 3/3 no dev v66 | F2: checkpoint |
| 7 | P19: efeito em voo | O run evita repetir uma ação quando morre entre efeito e checkpoint? | efeito 1 vez · passo 0 vezes na retomada · aviso honesto | `poc p19` | ✅ 3/3 no dev v72 | F2: idempotência na janela ambígua |
| 8 | P9: papéis responder/validar/redigir | A cadeia de 3 modelos melhora a resposta e cabe no modo assíncrono? | tempo da cadeia e ganho de qualidade medido em 10 perguntas | `poc p9` | ⏳ (depende da P2) | F2: `/revisar` |
| 9 | P5: GASADK | O planner do GASADK funciona com OpenRouter e checkpoint? | planner + checkpoint por step | `poc p5` | ⏳ | F2: planner |
| 10 | P8: Excel → Sheets | Um xlsx grande vira Sheets a tempo? | xlsx de 5 MB lido em < 60 s | `poc p8` | ⏳ | F3: inbox |
| — | P7: token do CI | O token do clasp no GitHub dura? | deploy verde 8+ dias após o login | exige GitHub | ⏸️ adiada com a Task 10 | F1: deploy seguro |

**Regra da esteira:** uma POC por vez; ao passar, escrever o ADR, atualizar esta tabela e a linha do item no PROGRESS, e só então implementar a capacidade no produto (com testes) e publicar no dev.

## Como manter este arquivo

- Atualize no mesmo commit sempre que um item mudar de status.
- Só marque **✅ Sim** com evidência (teste, log ou comando real).
- Recalcule a porcentagem da fase como a média dos itens.
