# ADR-019 — Tela de chat no gasclaw e voz com `gpt-live-1` (POC P17)

- **Status:** Proposto · 2026-09-15 · texto em implementação; **voz adiada pelo usuário** (C2 reprovado por evidência)
- Relaciona: [ADR-001](001-gas-only-runtime.md) (runtime só GAS), [ADR-003](003-openrouter-unico-provedor.md) (OpenRouter único; exceção pedida só para voz), [ADR-017](017-motor-de-tools-evals-e-aprovacao.md) (motor, aprovação)

## Contexto
Em vez de um bot no Meet, o usuário quer uma tela de chat no gasclaw: texto pelo OpenRouter e voz full-duplex
pela OpenAI `gpt-live-1` (US$ 0,05/min), com as mesmas tools, aprovação e histórico.

## Fonte da verdade
- OpenAI `gpt-live-1` (developers.openai.com/api/docs/models/gpt-live-1; guides `voice-webrtc?api=live`, `live-delegation`, `live-conversations`): no navegador o transporte é **WebRTC**; o servidor faz `POST /v1/live/sessions` com `{session:{model:'gpt-live-1', instructions, delegation:{type:'client'}}, transport:{type:'webrtc', sdp:<offer>}}` e recebe `201 {session:{id}, transport:{sdp:<answer>}}`. **Não existe token efêmero** nesse fluxo. Criar a sessão cobra 15 s. Canal de dados `oai-events`; delegação `client` via `session.delegation.created` → `session.commentary.append`; uso em `session.usage.updated`/`session.closed` (`usage.seconds`).
- **Evidência medida (HTML servido pelo web app dev, colado pelo usuário):** o `iframe#sandboxFrame` do HtmlService declara `allow="accelerometer *; autoplay *; clipboard-read *; clipboard-write *; encrypted-media *; fullscreen *; geolocation *; gyroscope *; local-network-access *; magnetometer *; midi *; payment *; picture-in-picture *; screen-wake-lock *; sync-xhr *; web-share *"` — **sem `microphone`**. Pela Permissions Policy, um frame aninhado não recebe um recurso que o pai não delegou; `getUserMedia` falha para qualquer página do HtmlService.

## Decisão (parcial)
1. **Tela de texto:** `src/chat.html` servida por `doGet?page=chat` (só o dono). `chatSend`/`chatClick` chamam o mesmo `handleChat` do Google Chat com um evento sintético de DM (`tela/chat`): tools, aprovação por botões (ticket de uso único, 10 min) e `ask`. Tudo que vem do modelo entra por `textContent`.
2. **Voz dentro do HtmlService: descartada** (C2). Nem WebRTC ao vivo nem gravação de áudio no navegador funcionam ali.
3. **Núcleo de voz pronto e sem UI** (`src/voice.ts`): pedido/resposta de `/v1/live/sessions` com o SDP, cancelamento de chaves em erro (canário), custo por segundo e instruções; `voiceDelegate` leva a transcrição ao mesmo `handleChat` (C3 e C5 testados offline).

## Decisão do usuário (2026-09-15)
**Chat de texto agora; voz depois.** Alternativas registradas para quando a voz voltar:
| Opção | Como | Troca |
|---|---|---|
| A | Página estática de voz fora do HtmlService (ex.: GitHub Pages) com microfone; troca o SDP e delega as tools ao web app do gasclaw | Exceção ao ADR-001 só para uma página estática; autenticação do dono entre a página e o web app (CORS/redirect do Apps Script) a medir |
| B | Página local servida por `./gasclaw voice` no PC do dono (localhost é contexto seguro para o microfone) | Só funciona com o PC ligado; o PC deixa de ser só build |

## Consequências
- `OPENAI_API_KEY` só entra se A for escolhida; ficaria em Script Properties, nunca no HTML nem no trace. O `redact` do trace precisa cobrir `sk-proj-…`/`sk-…` antes disso.
- A tela de texto não pede escopo novo.
