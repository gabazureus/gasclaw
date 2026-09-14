# Product

> Conductor's product context, devmode-aware. This is the stable backdrop every
> track is planned against. Keep it short and true.

## Vision
gasclaw roda agentes de IA **100% dentro do Google Apps Script** do seu Workspace, sem
hospedagem. Um agente é uma **pasta no Google Drive** (estilo Eve/OpenClaw); você cola a URL
da pasta na tela do gasclaw e conversa com ele pelo **Google Chat**. O resto roda sozinho.

## Target users & their pain
Donos de Google Workspace (começando pelo próprio autor) que querem agentes sobre
Gmail/Drive/Sheets/Docs/Calendar sem pagar VPS/Vercel/Cloud Run nem operar infraestrutura.

## Goals / non-goals
- **Goals:** agente-pasta sem código; Chat como canal principal; execução durável além do
  limite de 6 min; aprovação humana por card; heartbeat e `jobs.md`; Excel → Sheets
  automático; setup único guiado e deploy automático dev→prod com rollback.
- **Non-goals:** sandbox/execução de código arbitrário; browser automation; modelos locais;
  compatibilidade 1:1 com o pacote `eve`; 20+ canais; UI de chat web própria (F1–F3).

## Success
- Depois do setup inicial (≤ 15 min), nenhum comando manual é necessário para operar.
- Um run atravessa ≥ 3 execuções GAS sem perder estado.
- Criar um agente novo = criar pasta + colar URL, sem deploy.
- Custo de hospedagem: R$ 0 (só tokens do OpenRouter).

## Working agreement (devmode)
This project develops with the devmode process: reach a shared **design concept**
before writing assets (`grill-me`), speak one **ubiquitous language**
(`UBIQUITOUS_LANGUAGE.md`, includes the module map), build **deep modules** with a
**functional core / imperative shell**, design interfaces deliberately and
delegate implementations as gray boxes where safe, and implement **test-first**
with strong feedback loops. See `workflow.md` for the task lifecycle.

> The AI is the tactics; the human (with the `design-architect`) is the strategy.
