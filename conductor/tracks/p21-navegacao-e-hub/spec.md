# Spec: P21 — navegação do painel e hub de painéis

## Problem & purpose

O painel do gasclaw é uma tela única: `src/settings.html` é um scroll contínuo com seis seções
(Status, Chave, Agentes, Testar, Observabilidade, POC P1). Quem abre precisa rolar para achar
qualquer coisa, e não existe nenhum caminho entre os dois ambientes (dev e prod), que hoje são
duas URLs sem relação visível — dá para mexer no painel errado sem perceber.

O objetivo é deixar a experiência navegável, "como um site", **sem perder o minimalismo atual**
(sem framework, sem CDN, sem gradiente) e sem unificar os ambientes: o isolamento dev/prod
continua absoluto.

## Design concept

Três mudanças pequenas e independentes:

1. **Menu por seções no cliente.** Um `<nav>` no topo do painel com quatro itens — Início,
   Agentes, Observabilidade, Testar — que mostram/escondem seções da mesma página. É o mesmo
   mecanismo que a aba de Observabilidade já usa (`role="tablist"`), sem recarga e sem arquivo novo.
2. **Hub de painéis** (`?page=hub`), uma página nova e mínima que lista os painéis dos dois
   ambientes e marca em qual você está. É o ponto de entrada que dá para favoritar.
3. **Identidade do ambiente sempre visível**: um rótulo discreto (`dev` / `prod`) no cabeçalho
   do painel, ao lado do link para o hub.

A URL do ambiente irmão é **embutida em build time** (`define` do esbuild, alimentado pelo
`./gasclaw`), como já acontece com `__GCP_NUMBER__` e `__CHAT_SA_EMAIL__`. Nenhuma chamada em
runtime, nenhuma leitura de dados do outro ambiente: o link é navegação pura.

### Simetria assimétrica (decisão do usuário: A agora, C depois)

O código é escrito **simétrico** — cada build embute a URL do irmão. Mas só o dev é publicado
agora. O painel de prod continua na v1 (14/09) e **não** será publicado nesta track, porque isso
arrastaria a P2 não medida e o escopo IAM. Quando prod for publicado legitimamente, o lado
prod → hub passa a existir sozinho, sem retrabalho. Enquanto isso, o hub mostra prod como um
painel listado (a URL de prod já é conhecida no build do dev).

## Scope

**Dentro:** menu de seções no painel; página `?page=hub`; rótulo do ambiente; mover o link
"Apps Script" das linhas de agente para o cabeçalho; injeção de `__ENV__` e `__SIBLING_URL__`.

**Fora:** qualquer publicação em prod; qualquer alteração na P2/chat assíncrono; ler o modelo de
cada agente (custaria N leituras do Drive no carregamento); URL compartilhável por seção (o
`#hash` dentro do iframe do HtmlService não aparece na barra de endereço — decisão consciente).

## Behavior

- Abrir o painel mostra **Início** (status, chave, segredo da CLI). O item ativo tem
  `aria-current="page"`; os demais, não.
- Clicar num item do menu troca a seção visível sem recarregar. As abas internas de
  Observabilidade continuam exatamente como estão.
- O cabeçalho mostra `gasclaw · dev` (ou `prod`), um link **Painéis** para `?page=hub` e um link
  **Apps Script** do ambiente.
- `?page=hub` lista os painéis conhecidos, em ordem fixa (dev, prod). **Todos** são links que abrem
  no topo (`target="_top"`), inclusive o do ambiente do próprio hub — ele só ganha um aviso ao lado.
  A revisão apontou a contradição da versão anterior desta spec: um hub feito para ser favoritado
  não pode deixar o painel de origem inalcançável (ver `decisions.md`, D9).
- Se a URL do irmão não estiver embutida (build local, sem deploy), o hub lista só o atual — sem
  link quebrado e sem erro.

## Module & interface changes

### `panels` — novo — núcleo puro

```ts
export type PanelEnv = 'dev' | 'prod';
export type Panel = { env: PanelEnv; url: string; current: boolean };
/** Lista os painéis conhecidos, sempre na ordem dev, prod. Entradas sem URL são omitidas. */
export function panelList(env: string, appUrl: string, siblingUrl: string): Panel[];
```

Função pura, sem GAS: decide ordem, marca o atual e descarta o que não tem URL. Testável sem stub.

### `main` — modificado — borda

- `doGet`: uma rota a mais — `?page=hub` → `hub.html`. Mesmo tratamento de dono das demais telas.
- `export function panelsState()`: `{ env, panels }` para o hub. Leve de propósito: **não** chama
  `settingsState()` (que roda `observe.maybeDrain()` e lê todos os agentes).
- `settingsState()`: ganha o campo `env`, para o rótulo do cabeçalho.
- `declare const __ENV__ / __SIBLING_URL__`, no mesmo padrão de `__DEV__`.

### `settings.html` — modificado

Cabeçalho com rótulo + links; `<nav>` com quatro botões; as seções existentes agrupadas em quatro
contêineres. O conteúdo de cada seção **não muda** — é reagrupamento, não reescrita. Na linha do
agente, o link "Apps Script" sai (era idêntico para todos os agentes: é do ambiente, não do agente).

### `hub.html` — novo

Página mínima (sem CSS compartilhado, sem framework): título, lista dos painéis, link de volta.

### `build.mjs` / `gasclaw` — modificados

`define` ganha `__ENV__` e `__SIBLING_URL__`, vindos de `GASCLAW_ENV` e `SIBLING_URL` exportados
pelo `deploy()`. A URL do irmão usa a mesma forma já existente em `gasclaw::url()`.

> Cuidado: `build.mjs` e `gasclaw` têm alterações **não commitadas** da P2. As mudanças desta
> track são aditivas e cirúrgicas; nada da P2 é tocado.

## Testing strategy

- `panels`: núcleo puro — ordem, marcação do atual, omissão de URL vazia, ambiente desconhecido.
- `main`: `panelsState()` com os stubs de GAS que `main-links.test.ts` já usa; `doGet?page=hub`
  serve o arquivo certo.
- Telas: asserção estrutural sobre o HTML (como `p17.test.ts` e `main-links.test.ts` fazem) —
  `aria-current`, ausência de `href="?page="` relativo, ausência de `innerHTML`.
- `build`: a saída passa a ter `hub.html`; `__ENV__`/`__SIBLING_URL__` chegam ao bundle.

Nada de teste de aparência. Nada de meta de cobertura.

## Acceptance criteria

1. `npx tsc --noEmit` limpo e `npx vitest run` verde, com os testes novos.
2. O painel abre em Início e troca de seção sem recarregar; teclado e leitor de tela funcionam
   (`aria-current`, foco visível, sem `div` clicável).
3. `?page=hub` lista dev e prod, marca o atual, e o link do outro abre no topo.
4. Sem `innerHTML` novo; nenhum conteúdo vindo do modelo entra como HTML.
5. Nenhum commit, nenhum push, nenhum `./gasclaw up` sem pedido explícito do usuário.
6. Verificação real no dev só depois de autorização dele — o código verde local **não** conta
   como "visto funcionando".

## Open questions / risks

- **Redundância**: hub + rótulo + link do irmão poderiam se sobrepor. Resolvido por desenho — o
  link do irmão mora **só** no hub; o cabeçalho tem só o rótulo e o caminho até o hub.
- **`settings.html` engordando**: hoje 453 linhas. O menu acrescenta ~25. Se passar de ~550,
  propor extração antes de continuar somando (não nesta track).
- **Lado prod pendente**: por decisão, fica esperando uma publicação legítima de prod. Não é
  dívida escondida: está registrado aqui e no plano.
