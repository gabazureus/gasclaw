# ADRs

Formato: contexto → decisão → consequências. Nunca editar um ADR aceito; criar outro que o substitui.

| # | Título | Status |
|---|---|---|
| [001](001-gas-only-runtime.md) | Runtime 100% Apps Script, sem servidor | Aceito |
| [002](002-agente-pasta-sem-codigo.md) | Agente = pasta do Drive, sem código | Aceito |
| [003](003-openrouter-unico-provedor.md) | OpenRouter como único provedor de LLM | Aceito |
| [004](004-gasadk-condicional.md) | GASADK vendorizado só se a POC P5 passar | Proposto |
| [005](005-execucao-duravel.md) | Execução durável: pump + doPost + checkpoint no Drive | Proposto (P3, P4) |
| [006](006-chat-canal-principal.md) | Google Chat como canal principal | Proposto (P2) |
| [007](007-docs-hub.md) | `docs/` como hub da documentação | Aceito |
| [008](008-deploy-e-dono.md) | Deploy automático dev→prod; dono = conta do usuário | Aceito |
| [009](009-ajustes-f0.md) | Ajustes de minimal code na F0 | Aceito |
| [010](010-poc-p1-urlfetch.md) | POC P1: UrlFetch longo no Apps Script | Aceito |
| [011](011-licenca-e-docs-da-comunidade.md) | Licença Apache-2.0 e docs da comunidade em inglês | Aceito |
| [012](012-agentes-em-docs-e-sheets.md) | Agentes em Google Docs e Sheets nativos (POC P6) | Aceito |
| [013](013-autoria-editor-e-drive.md) | Autoria em ambas as superfícies: editor do Apps Script + pasta do Drive (POC P10) | Aceito (medição); levar a prod aguarda o gate |
| [014](014-trace-do-agente.md) | Trace do agente dentro do gasclaw (POC P14) | Aceito no dev; a gravação síncrona foi substituída pelo lote do ADR-020 |
| [015](015-escopos-oauth.md) | Escopos OAuth mínimos: gatilho de 1 min, ferramentas do Workspace e painel de limites | Aceito; reautorização no dev feita, prod ainda não recebeu |
| [016](016-painel-de-limites.md) | Painel de limites na tela, no terminal e na planilha (POC P15) | Aceito no código; medição pendente |
| [017](017-motor-de-tools-evals-e-aprovacao.md) | Motor de tools, evals e aprovação (E0, E1, E5) | Aceito no dev (E0, E1; E5 verde na v19) |
| [018](018-modelos-e-custo.md) | Modelos por agente e custo por modelo (POC P16) | Aceito no código; medição pendente |
| [019](019-tela-de-chat-e-voz.md) | Tela de chat no gasclaw e voz com `gpt-live-1` (POC P17) | Proposto; texto no dev, voz adiada pelo usuário |
| [020](020-trace-em-lote.md) | Trace em lote de 1 min (fila no turno, gatilho e fallback) | Aceito |
| [021](021-acesso-aprovado-no-painel.md) | Acesso e ferramentas aprovados no painel | Aceito; painel em construção |
| [022](022-csrf-segredo-da-cli.md) | Ações com efeito só por POST com o segredo da CLI (CSRF) | Aceito; risco residual aceito |
