# Spec — F8: o filho herda TUDO do pai, e o Chat segue o motor coroado

- **Data:** 2026-09-21 · **Status:** aceita pelo dono (decisões A–K no PROGRESS), nada implementado além do item A
- **Base:** [ADR-043](../adr/043-sucessor-e-um-agente.md) · spec anterior: [sucessão por patch](2026-09-21-sucessao-por-patch.md)
- **Pedido do dono (verbatim):** *"o filho deve ter as memórias do pai, tudo do pai, retomar o chat a partir do pai"*

## Onde mora cada coisa do "tudo do pai" (levantado no código)

| Onde | O quê | O filho já tem? |
|---|---|---|
| Pasta do agente no Drive | `MEMORY.md`, `memory/`, sessões do chat (`sessionIO`), papéis | **sim** — mesma pasta |
| Script Properties do PAI | `ACCESS:` (pessoas e tools aprovadas), `CAP:`, `STATUS:`, `STEPS:`, `MODEL:`, `AUTOOK:`, `BATTERY:`, `CFG:`, `FAIL:`, `GENINT:`, `MANDATE:`, `SCHED:`, `SCHEDSEEN:`, `LASTGEN:`, `CREATOR`, `CAPS_ENABLED`, `LINEAGE`, `CODEGEN:<dia>`, `BUDGET_OVERRIDE`, `RUNS_FOLDER_ID`, `RUNS_SHEET_ID` | **não** — por projeto; a semente só leva a lista de agentes |
| Segredos | `OPENROUTER_API_KEY`, `CLI_SECRET*`, `KEYSEC:`, `KEYDEL:` | **nunca passam** (ADR-040 opção 4) |
| Estado do motor | `RUNTIME_ENABLED`, `SUCC:`/`SUCCESSORS`, `CHILDREN`, `P3x_*`, runs em voo (`R:`/`RUNNING:`…) | **não passam**: são do motor, não do agente |

## Fase 1 — HERANÇA na coroa (núcleo puro + casca)

- `inheritable(props): {key, value}[]` em `src/succession.ts`: LISTA FECHADA de prefixos/chaves da tabela
  acima. Fail-closed: chave fora da lista NÃO passa; segredo NUNCA passa, mesmo se alguém o pôr na lista
  (teste explícito com cada segredo). Valor > 9 KB recusa com motivo (não corta).
- Porta `inherit` no SUCESSOR (antes do segredo da CLI, como `crown`/`readiness`): só do pai da semente,
  só enquanto PARADO (antes da coroa) ou recém-coroado pelo mesmo pai; grava as chaves recebidas; nunca
  aceita segredo nem estado do motor (filtro do lado do receptor TAMBÉM — defesa em profundidade).
- `crownSuccessor` passa a herdar ANTES de ligar o sucessor; falha na herança = coroa recusada e o pai
  volta (mesma regra do `crownLanded`). `./gasclaw succession inherit <id>` para um sucessor já coroado
  (é o caso do `1w3Pju8v…` hoje).
- Checagem nova no health (10ª): **"as permissões do filho são as do pai"** — compara `ACCESS:`/`CAP:`/`STATUS:`
  pela porta `readiness` (que passa a devolvê-los, sem segredo). `successorHealth` passa a funcionar num
  sucessor COROADO (hoje recusa) e, para coroado, a checagem de código compara com o build atual do pai
  (o patch já está no `src`), não com o patch do registro.

## Fase 2 — o Chat segue o motor coroado (depende da P35)

- **P35** (sonda já no ar, `./gasclaw poc p35 read`): critérios C1 a identidade do `onMessage` do pai é
  aceita pelo web app do sucessor; C2 ida e volta < 10 s. O dono manda UMA mensagem no Chat.
- **Se passar:** o `onMessage` do pai, com sucessor coroado, NÃO roda o agente: repassa o evento cru ao
  sucessor (porta `chatrelay`, só do pai da semente, só com o sucessor ligado) e devolve a resposta dele;
  o sucessor aceita/enfileira/entrega com a identidade do app (mesmo projeto GCP). Timeout ou recusa →
  resposta honesta ao usuário ("o agente está trocando de motor"), nunca silêncio.
- **Se reprovar:** registrar o número, ADR curta, e o caminho manual único (reapontar o Deployment ID no
  console) documentado no README. Nunca relaxar o critério.

## Fase 3 — o resto da ordem decidida

- **G** `e1-memoria` reprova nos dois motores: causa-raiz ANTES de tocar (systematic-debugging); conserto com teste.
- **F** apagar `src/sessionQueue.ts` + `src/sessionQueueStore.ts` e os testes deles (zero consumidores); manter `voice.ts`.
- **I** checklist de ida para prod (NÃO executar o `ship`): o que muda para o usuário, o passo do GCP, o
  roteamento, o `sync`. O `ship` é decisão do dono.

## Critérios de aceite

1. Depois de `succession inherit`, o painel do sucessor mostra as mesmas pessoas, tools e capacidades do pai; health 10/10.
2. Nenhum segredo atravessa — teste com cada segredo na entrada da lista e na porta.
3. (Se P35 passar) uma mensagem no Chat é respondida pelo sucessor coroado, e o pai segue `enabled:false`.
4. `tsc` limpo, suíte verde, cada guarda nova com mutação morta, símbolo CHAMADO no bundle.
5. PROGRESS, CHANGELOG, README/README_PT_BR atualizados; commit e push a cada fase; nada em prod.

## Invariantes (herdadas da F7)

Nada da pasta executa (ADR-002) · ninguém escreve no próprio projeto (`mayWriteProject`) · nenhuma chave
entregue automaticamente · o pai coroado não é religado pela CLI · dois motores nunca respondem juntos ·
o custo é contado sempre · pare em cada portão humano.
