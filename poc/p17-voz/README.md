# POC P17 — Tela de chat com voz (texto OpenRouter + voz OpenAI `gpt-live-1`)

**Pergunta:** dá para conversar com o agente por texto e por voz numa tela do gasclaw, com as mesmas tools,
aprovação e histórico, sem a chave da OpenAI sair do Apps Script?

**Status:** texto em andamento; **voz adiada pelo usuário** (C2 reprovado por evidência). Decisão em [ADR-019](../../docs/adr/019-tela-de-chat-e-voz.md).

## Fonte da verdade (OpenAI, 2026-09-15)
- `gpt-live-1`: US$ 0,05/min cobrado por segundo; criar a sessão cobra 15 s; sem tier Free; `function_calling` e delegação.
- Navegador: **WebRTC**. O servidor faz `POST /v1/live/sessions` com `{session:{model, instructions, delegation}, transport:{type:'webrtc', sdp:<offer>}}` e recebe `201 {session:{id}, transport:{sdp:<answer>}}`. **Não há token efêmero**: o servidor troca o SDP e só o answer volta ao navegador.
- Canal de dados `oai-events`: `session.started`, `session.input_transcript.delta`, `session.output_transcript.delta`, `session.delegation.created`, `session.usage.updated` (`usage.seconds`), `session.closed`; o cliente envia `session.commentary.append`/`session.thinking.append` (`delegation_id`, `content` ≤ 500 tokens) e `session.close`.
- Delegação `client`: o evento não traz a fala; o cliente usa a transcrição.

## Critérios
| # | Critério | Resultado |
|---|---|---|
| C1 | troca de SDP pelo GAS < 2 s, sem `sk-` na resposta (canário) | núcleo `src/voice.ts` testado (canário no erro); medição no dev pausada |
| C2 | microfone no iframe do HtmlService | ❌ **reprovado por evidência de primeira mão**: o `iframe#sandboxFrame` servido pelo web app dev tem `allow="accelerometer *; autoplay *; clipboard-read *; clipboard-write *; encrypted-media *; fullscreen *; geolocation *; gyroscope *; local-network-access *; magnetometer *; midi *; payment *; picture-in-picture *; screen-wake-lock *; sync-xhr *; web-share *"`, **sem `microphone`**; um frame aninhado não recebe o que o pai não delegou |
| C3 | tool pedida por voz executa com aprovação | `voiceDelegate` = mesmo `handleChat`; teste `webchat.test.ts` ✅ (offline) |
| C4 | segundos e custo no trace | `voiceCost` testado; pausado |
| C5 | texto e voz no mesmo histórico | teste `webchat.test.ts` ✅ (offline) |

## Consequência para o desenho
- A tela de **texto** (`src/chat.html`, `doGet?page=chat`) segue e serve para qualquer caminho de voz.
- Nenhuma página nossa dentro do HtmlService consegue usar o microfone: nem WebRTC ao vivo, nem gravação no navegador.
- `src/voice.ts` fica como núcleo puro para uma página de voz fora do HtmlService, se o usuário escolher esse caminho.
