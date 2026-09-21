# ADRs

Formato: contexto → decisão → consequências. Nunca editar um ADR aceito; criar outro que o substitui.

| # | Título | Status |
|---|---|---|
| [001](001-gas-only-runtime.md) | Runtime 100% Apps Script, sem servidor | Aceito |
| [002](002-agente-pasta-sem-codigo.md) | Agente = pasta do Drive, sem código | Aceito |
| [003](003-openrouter-unico-provedor.md) | OpenRouter como único provedor de LLM | Aceito |
| [004](004-gasadk-condicional.md) | GASADK vendorizado só se a POC P5 passar | Proposto |
| [005](005-execucao-duravel.md) | Execução durável: pump + doPost + checkpoint no Drive | Parcialmente substituído por ADR-026/027; P3/P4 medidas |
| [006](006-chat-canal-principal.md) | Google Chat como canal principal | Proposto (P2) |
| [007](007-docs-hub.md) | `docs/` como hub da documentação | Aceito |
| [008](008-deploy-e-dono.md) | Deploy automático dev→prod; dono = conta do usuário | Aceito |
| [009](009-ajustes-f0.md) | Ajustes de minimal code na F0 | Aceito |
| [010](010-poc-p1-urlfetch.md) | POC P1: UrlFetch longo no Apps Script | Aceito |
| [011](011-licenca-e-docs-da-comunidade.md) | Licença Apache-2.0 e docs da comunidade em inglês | Parcialmente substituído: licença pelo ADR-030, idioma ampliado pelo ADR-033 |
| [012](012-agentes-em-docs-e-sheets.md) | Agentes em Google Docs e Sheets nativos (POC P6) | Aceito |
| [013](013-autoria-editor-e-drive.md) | Autoria em ambas as superfícies: editor do Apps Script + pasta do Drive (POC P10) | Aceito (medição); levar a prod aguarda o gate |
| [014](014-trace-do-agente.md) | Trace do agente dentro do gasclaw (POC P14) | Aceito no dev; a gravação síncrona foi substituída pelo lote do ADR-020 |
| [015](015-escopos-oauth.md) | Escopos OAuth mínimos: gatilho de 1 min, ferramentas do Workspace e painel de limites | Aceito; reautorização no dev feita, prod ainda não recebeu |
| [016](016-painel-de-limites.md) | Painel de limites na tela, no terminal e na planilha (POC P15) | Aceito no código; medição pendente |
| [017](017-motor-de-tools-evals-e-aprovacao.md) | Motor de tools, evals e aprovação (E0, E1, E5) | Aceito no dev (E0, E1; E5 verde na v19) |
| [018](018-modelos-e-custo.md) | Modelos por agente e custo por modelo (POC P16) | Aceito no código; medição pendente |
| [019](019-tela-de-chat-e-voz.md) | Tela de chat no gasclaw e voz com `gpt-live-1` (POC P17) | Proposto; texto no dev, voz adiada pelo usuário |
| [020](020-trace-em-lote.md) | Trace em lote de 1 min (fila no turno, gatilho e fallback) | Aceito |
| [021](021-acesso-aprovado-no-painel.md) | Acesso e ferramentas aprovados no painel | Aceito; emendado em 18/09 (liga/desliga por ferramenta e por pessoa) |
| [022](022-csrf-segredo-da-cli.md) | Ações com efeito só por POST com o segredo da CLI (CSRF) | Aceito; risco residual aceito |
| [023](023-ferramentas-do-workspace.md) | Ferramentas do Workspace por REST (E6) | Aceito; 7 de 7 evals `e6-*` verdes no dev (v35) |
| [024](024-memoria-sessoes-skills-e-bootstrap.md) | Memória do dia, sessões no Drive, skills e ritual de estreia | Aceito no núcleo; medição no dev pendente |
| [025](025-rodizio-de-modelos-gratuitos.md) | Rodízio de modelos gratuitos (`model: free`) | Proposto; medição pela POC P11 pendente |
| [026](026-run-duravel.md) | Run durável: o passo é a unidade e o estado mora no Drive | Aceito; P4 no dev v66 e P19 no v72 |
| [027](027-gatilho-worker.md) | O gatilho de 1 min é o worker do run durável | Aceito; P3 passou 4/4 no dev v60 |
| [028](028-aprovacao-duravel.md) | Aprovação durável pertence ao run no Drive | Aceito; P20 passou 5/5 no dev v74 |
| [029](029-autoridade-do-run-no-ponteiro.md) | Autoridade do run mora nas Script Properties, não no arquivo | Fatias 1, 2 e 3 implementadas; falta medir no dev |
| [030](030-licenca-mit.md) | Licença MIT no lugar da Apache-2.0 | Aceito |
| [031](031-conta-pessoal-alem-do-workspace.md) | Conta pessoal (Gmail) além do Google Workspace | Aceito no código; falta medir numa conta Gmail real |
| [032](032-portabilidade-linux-e-windows.md) | A CLI sai do macOS: Linux e Windows (WSL e Git Bash) | Aceito no código; falta rodar em Linux e Windows |
| [033](033-cli-e-painel-em-ingles.md) | A vitrine em inglês: CLI e painel | Aceito; amplia a exceção de idioma do ADR-011 |
| [034](034-modelo-da-pasta-conferido.md) | O modelo pedido pela pasta é conferido, e cai no padrão quando não serve | Aceito |
| [035](035-procedencia-dos-papeis-no-painel.md) | A procedência de cada papel aparece no painel | Aceito |
| [036](036-chegar-ao-agente-sem-digitar-o-link.md) | Chegar ao agente sem digitar o link (e por que não encurtamos) | Aceito; QR code no terminal em aberto |
| [037](037-custo-por-mes-e-valor-por-modelo.md) | Custo por mês (dia dobrado em mês, 24 meses) e o valor de cada modelo no gráfico | Aceito |
| [038](038-capacidades-e-linhagem.md) | Capacidades por etiqueta, ciclo de vida e linhagem verificável | Aceito |
| [039](039-subagente-e-declaracao.md) | Sub-agente, persona e os campos que o agente declara | Aceito |
| [040](040-isolamento-e-privilegio.md) | Isolamento entre projetos e os quatro controles contra escalonamento | Aceito |
| [041](041-sucessor-como-codigo.md) | O sucessor é código novo (Opus 5), não um prompt melhor | Aceito; nenhum código gerado rodou ainda |
| [042](042-automation-subagente-persona.md) | Três coisas diferentes chamadas "sub-agente": persona, automation e sub-agente | Aceito |
| [043](043-sucessor-e-um-agente.md) | O sucessor é um AGENTE, e o Opus melhora o código dele por patch | aceita (desenho) |
| [044](044-chat-segue-o-coroado.md) | Depois da coroa, o Chat é reapontado à mão (a P35 reprovou o repasse: 17,4 s > 10 s) | aceita |
