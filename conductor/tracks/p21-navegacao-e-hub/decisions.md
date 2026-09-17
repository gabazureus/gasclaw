# Decisões — P21

Todas tomadas pelo usuário no gate de alinhamento de 2026-09-17.

## D1 — Navegação por seções no cliente, não por rotas `?page=`

**Alternativas:** (A) uma rota `?page=` por área; (B) trocar a seção visível no cliente; (C) híbrido.

**Escolha: B.** O único ganho real de (A) seria a URL compartilhável por seção, e o painel é de dono
único, sempre aberto pelo mesmo link. (A) pagaria recarga (`doGet` + `settingsState()`, que drena o
lote) e duplicação de CSS/JS entre arquivos, todo dia, por um benefício quase não usado.

**Consequência aceita:** não existe URL por seção. `#hash` dentro do iframe do HtmlService não
aparece na barra de endereço, então nem ele resolveria — é limitação do sandbox, não preguiça.

## D2 — Quatro itens de menu: Início, Agentes, Observabilidade, Testar

As quatro abas atuais de Observabilidade continuam como segundo nível, intocadas. Não separar
Limites e Uso/custo no topo: já têm abas próprias, e subir tudo achataria a hierarquia à toa.

## D3 — O link "Apps Script" é do ambiente, não do agente

Ele era renderizado igual em cada linha da lista (`s.scriptUrl`, o mesmo projeto para todos os
agentes), o que sugeria falsamente que cada agente tem um script. Foi para o cabeçalho. A linha do
agente fica com nome, pasta do Drive e acesso.

**Rejeitado:** mostrar o modelo em uso por agente. Custaria N leituras do Drive no carregamento da
página. Se voltar a ser desejado, que seja sob demanda (ao expandir o agente).

## D4 — Link cruzado: só dev → prod agora; o lado prod fica para depois

**Alternativas:** (A) só dev agora; (B) os dois lados agora, publicando prod; (C) os dois lados
depois de estabilizar e medir.

**Escolha: A agora, C como plano.** (B) exigiria publicar prod hoje, e isso arrastaria a P2 não
medida e o escopo IAM que hoje só existe no dev — contra a regra do projeto de não publicar nada
sem medição.

**Como (C) sai de graça:** o código é simétrico — todo build embute a URL do irmão
(`SIBLING_URL`). Quando prod for publicado legitimamente, o lado prod → hub passa a existir
sozinho, sem retrabalho.

## D5 — A URL do irmão é embutida no build, não descoberta em runtime

Mesmo mecanismo já usado por `__GCP_NUMBER__` e `__CHAT_SA_EMAIL__`: `define` do esbuild,
alimentado pelo `./gasclaw`. Zero chamada em runtime, zero acoplamento entre os ambientes. O link é
navegação pura; nenhum dado atravessa.

## D6 — Hub dentro do dev (`?page=hub`), não um terceiro projeto Apps Script

O hub não é neutro entre os ambientes — mora em um deles. O usuário aceitou esse custo em troca de
zero infraestrutura nova.

## D7 — Rótulo do ambiente no cabeçalho, sem duplicar o link do irmão

O rótulo (`dev`/`prod`) evita o erro operacional de mexer no prod achando que é o dev. Para não
virar redundância com o hub, o **link do irmão mora só no hub**; o cabeçalho tem apenas o rótulo e
o caminho até o hub.

## D8 — O polling da Observabilidade passou a respeitar a seção visível

Efeito colateral do menu: a Observabilidade nasce escondida, e o polling de 5 s bateria no servidor
sem ninguém olhando. `watching()` agora exige aba visível **e** seção à vista. Isso reforça o
critério C7 da P14 em vez de enfraquecê-lo (`test/p14.test.ts` foi atualizado para a regra nova).

## D9 — No hub, o painel do ambiente atual também é link (revisão)

A primeira versão renderizava o ambiente atual como texto, não como link. A revisão mostrou a
contradição: o hub é vendido como ponto de entrada favoritável, e quem o abrisse pelo favorito não
teria caminho para o painel de origem — só para o irmão, que hoje (prod) nem está publicado.

Agora todo painel é link; o atual só ganha o aviso "este é o ambiente deste hub". Nenhum dado novo
foi preciso: `panelsState()` já devolvia a `url` do atual, que era campo morto.

## D10 — O menu é `nav`, não `tablist`: sem setas, sem `aria-controls`

A primeira versão copiou as setas ←/→ do tablist da Observabilidade. As duas revisões convergiram:
num `nav` sem `tabindex` rotativo os quatro botões já são paradas do Tab, então as setas eram
redundantes, contradiziam o tablist que vive cinco linhas abaixo (mesma tecla, contrato diferente)
e o `preventDefault` ainda matava a rolagem horizontal em zoom alto. O `aria-controls` saiu junto:
fora do JAWS, nenhum leitor de tela o expõe — era ARIA sem retorno.

A troca de seção passou a ser anunciada pelo `#msg` (`role="status"`), que já existia e mora fora
das quatro seções.

## D11 — O ambiente entra no `setTitle()` das três telas

O painel roda em iframe, então o nome da aba vem do `setTitle()`. Com dev e prod abertos lado a
lado, as duas abas se chamavam "gasclaw": a pílula no `<h1>` só ajuda depois de já estar na aba
errada, que é exatamente o erro que a P21 queria evitar. O `prod` também ganhou cor própria
(`.env.prod`), porque três caracteres de 12px não se distinguem de relance.
