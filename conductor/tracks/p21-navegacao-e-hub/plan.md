# Plan: P21 — navegação do painel e hub de painéis

## Phase 1: Núcleo puro (`src/panels.ts`)

- [ ] Teste primeiro: ordem dev→prod, marcação do atual, omissão de URL vazia, ambiente desconhecido.
- [ ] `panelList(env, appUrl, siblingUrl)`. Sem GAS, sem I/O.

## Phase 2: Borda (`src/main.ts`, `build.mjs`, `gasclaw`)

- [ ] `declare const __ENV__ / __SIBLING_URL__` no padrão de `__DEV__`.
- [ ] `panelsState()` leve (não chama `settingsState()`), `env` em `settingsState()`.
- [ ] `doGet`: rota `?page=hub`.
- [ ] `build.mjs`: `define` de `__ENV__` e `__SIBLING_URL__`; copiar `hub.html`.
- [ ] `gasclaw::deploy()`: exportar `GASCLAW_ENV` e `SIBLING_URL` (URL do irmão, forma de `url()`).
- [ ] Atualizar `test/build.test.ts` (a saída passa a ter `hub.html`).

## Phase 3: Telas

- [ ] `src/hub.html`: lista mínima dos painéis, `target="_top"`, sem `innerHTML`.
- [ ] `src/settings.html`: cabeçalho com rótulo do ambiente + Painéis + Apps Script; `<nav>` de
      quatro seções; agrupar as seções existentes sem reescrever o conteúdo.
- [ ] Tirar o link "Apps Script" da linha do agente e atualizar `test/main-links.test.ts`.

## Phase 4: Verificação e revisão

- [ ] `npx tsc --noEmit` + `npx vitest run` frescos.
- [ ] Revisão de complexidade e acessibilidade do diff.
- [ ] Resumo para o usuário + **pedido explícito de publicação** — não publicar por conta própria.

## Definition of done

Critérios 1–6 da `spec.md`. A track só fecha depois que o usuário vir o painel rodando no dev —
verde local não é evidência de funcionamento real.
