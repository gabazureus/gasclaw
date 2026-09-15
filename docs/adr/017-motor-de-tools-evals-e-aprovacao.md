# ADR-017 — Motor de tools, evals e aprovação (E0, E1, E5)

- **Status:** Aceito no dev para E0 e E1 (6 de 6 evals na versão 16) · 2026-09-15 · E5 com núcleo e Chat prontos; a medição no dev fica para depois da reautorização dos escopos (ADR-015)
- Complementa o [ADR-002](002-agente-pasta-sem-codigo.md): nenhuma tool vem do Drive nem do modelo; a lista é fechada no motor.

## Contexto
O protótipo completo (Beads `gasclaw-mua`) precisa de um agente que usa ferramentas com aprovação, como no Eve, e
de um jeito de provar comportamento no dev sem clicar à mão. Ordem decidida pelo usuário: E0 evals → E1 motor
de tools → E5 aprovação + `ask` → E6 ferramentas do Workspace.

## Fonte da verdade
- OpenRouter, *tool calling*: `tools: [{type:'function', function:{name, description, parameters}}]`; a resposta traz `message.tool_calls[{id, type, function:{name, arguments}}]` com `arguments` em **string JSON**, `content: null` e `finish_reason: 'tool_calls'`; o resultado volta como `{role:'tool', tool_call_id, content}`. O nome da função aceita só `[a-zA-Z0-9_-]`.
- Eve, tools: política de aprovação `never` (padrão), `once` e `always`; evals com `calledTool`, `includes`, e juiz LLM *soft* por padrão (entra no relatório, não reprova).
- Google Chat (app do Apps Script): card em `cardsV2` com `buttonList` e `onClick.action.function` + `parameters`; o clique chega como `CARD_CLICKED` com `common.parameters`; a resposta `actionResponse.type = UPDATE_MESSAGE` atualiza o card.

## Decisão
1. **Registro fechado** (`src/tools/registry.ts`): cada tool tem nome, descrição, JSON Schema, `approval` e `run`. O frontmatter `tools: [...]` do `AGENTS` só escolhe entre elas (nome exato ou grupo: `memory` → `memory.*`). Nome no fio: `.` vira `_`.
2. **Validação no núcleo**: `arguments` é parseado e validado contra um subconjunto de JSON Schema (objeto plano, tipos, `required`, `maxLength`, sem extras, chave própria). Argumento inválido, tool fora da allowlist ou inexistente viram **resultado de tool com recusa**, nunca exceção nem execução.
3. **Turno puro** (`runTurn` em `src/agent.ts`): LLM com tools → valida → executa `never` → devolve ao modelo → repete até a resposta, a pendência ou o limite de `steps` (padrão 10). Prazo de 20 s no Chat e 300 s na tela, checado antes de cada chamada ao modelo e de cada tool. Chave de idempotência `runId:step:callId`; no Chat, `runId` é o `message.name` (reentrega do mesmo evento gera a mesma chave).
4. **Memória** (`MEMORY.md` na pasta do agente): recall de até 4.000 caracteres, fato de até 2.048 bytes, recusa acima do teto, entra como **mensagem do usuário** e só na DM do dono. `memory.remove` pede aprovação (`always`, apaga dado do usuário) e exige trecho de 3+ caracteres.
5. **Aprovação e `ask`** (`src/approval.ts`): a pendência devolve o estado do turno; vira card com Aprovar/Negar (ou botões de opção no `ask`). Ticket de **uso único** no CacheService com trava no `take`, validade de **10 min**, e só quem pediu responde (clique de outra pessoa não consome). `once` libera a tool pelo resto do turno retomado. O system prompt fica fora do ticket e é relido na retomada. `ask` sem opções é respondido pela próxima mensagem da mesma pessoa na conversa.
6. **Evals** (`evals/*.md` no repositório, nunca no Drive): frontmatter (`name`, `channel` chat|tela, `model`, `tools`, `steps`, `memory: reset`, `judge`), `## turnos` (com `(nova sessão)`, `(aprovar)`, `(negar)`, `(repetir clique)`), `## roteiro` opcional (modelo determinístico) e `## verificações` (`span`, `calledTool`, `noTool`, `includes`, `refused`, `approved`, `denied`, `stopped`). O cenário roda no web app do dev pelo mesmo `handleChat` da produção, com um agente próprio em `Meu Drive/gasclaw/agentes/eval`. `./gasclaw eval` sai ≠ 0 em falha. Cenários com roteiro também rodam offline no `npm test`.

## Medição (dev, versão 16, `./gasclaw eval`)
| Cenário | Verificações | Tempo | Resultado |
|---|---|---|---|
| smoke | `llm_call`, `reply`, `noTool`; juiz PASS | 8,7 s | ✅ |
| e1-now | `calledTool now`, `tool_call`; juiz PASS ("08:50") | 8,5 s | ✅ |
| e1-memoria | `calledTool memory.save` → nova sessão → resposta com "10h" | 10,7 s | ✅ |
| e1-limite | `stopped steps`, aviso de limite | 2,6 s | ✅ |
| e1-injecao | `refused memory.save` (campo desconhecido e tipo errado) | 2,2 s | ✅ |
| e1-fora-da-lista | `refused memory.save` e `refused eval` | 0,5 s | ✅ |
| e5-aprovar, e5-negar, e5-token-reusado | passam offline; dev pendente | — | 🟡 |

## Consequências
- Nova tool exige deploy (ADR-002). Tool com efeito externo (E6) nasce com `approval` diferente de `never`; envio de e-mail só com `always`.
- **Limites conhecidos (minimal):** o registro `done` da idempotência não persiste entre execuções (entra com a fila durável da F2); escrita em `MEMORY` como Google Doc é recusada até uma POC medir o upload com conversão; o cenário vai por GET com teto de 2 KB; a limpeza do card com `cardsV2: []` no `UPDATE_MESSAGE` ainda não foi medida no Chat real.
- O token OAuth do CLI de evals vai pelo stdin do `curl`, nunca na linha de comando.
- O juiz é soft: um veredito FAIL aparece no relatório sem reprovar o cenário.
