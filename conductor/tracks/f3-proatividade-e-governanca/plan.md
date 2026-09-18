# Plano: F3 — proatividade e governança de ferramentas

> Ordem aprovada pelo usuário no gate de 2026-09-17 (G9), com a POC encaixada
> como gate de viabilidade imediatamente antes do despertar.
> Fases por fatia: núcleo funcional → casca imperativa → caminho crítico.

**Estado da árvore:** 19 arquivos não commitados da pista P2 + o conserto do
`notBefore`. **Nunca** `reset`, `checkout`, `stash` ou `clean`. Sem commit, push
ou publicação sem autorização explícita do usuário.

**Verificação de cada fase:** `npx tsc --noEmit` e `npx vitest run`
(linha de base: 86 arquivos, **793** testes, verdes em 2026-09-17).

---

## Fase 1 — Política de aprovação  ⟵ crítica, revisão por inteiro

1. **Núcleo puro `src/policy.ts`** — `Policy`, `PolicyRule`, `PolicyOutcome`,
   `PolicyCtx`, `NEVER_AUTO`, `parsePolicy`, `decidePolicy`. Sem I/O.
   Teste primeiro, por tabela, incluindo os casos adversariais da spec.
2. **Costura em `src/agent.ts`** — trocar o cálculo de `needs` (linha ~164) por
   consulta à política, com `fallback` no `Approval` estático.
   *Portão de regressão:* sem política, os 793 testes atuais continuam verdes.
3. **Casca `src/policyStore.ts`** — `POLICY:<folderId>` nas Script Properties;
   escrita só pelo caminho com `assertOwner()`; teto de tamanho antes de gravar
   (Property aguenta 9 KB).
4. **Política sugerida** — ler o bloco do `AGENTS.md` em `workspace.ts` como
   *sugestão*, sem efeito nenhum até o dono aprovar.
5. **Painel** — sugerida × vigente, diff, botão de aprovar; espelha a tela de
   acesso que já existe.
6. **Revisão por inteiro** com `security-hardening` + painel de revisores.
   Nada de gray-box aqui.

**Gate:** critérios da Fase 1 na spec, todos verificáveis localmente.

---

## Fase 2 — POC P22: custo da proatividade  ⟵ gate de viabilidade

7. `poc/p22-proatividade/` na forma das POCs anteriores (README, harness,
   `pc.sh`, veredito JSON), cronômetros **dentro** do gatilho (ADR-027 §3).
8. Medir C1–C4. **Requer autorização do usuário**: publicar o dev leva junto a
   árvore não commitada da P2.
9. ADR com o número medido — inclusive se reprovar, como a ADR-026 fez com a P3.

**Gate:** P22 verde ⇒ Fase 3. P22 vermelha ⇒ voltar ao desenho do despertar
antes de escrever qualquer linha dele.

---

## Fase 3 — Despertar  ⟵ só depois da P22

10. **Núcleo puro `src/agenda.ts`** — gramática fechada de `jobs.md`
    (3 formas), `parseAgenda`, `dueJobs(agenda, lastFired, now, tz)`. Sem I/O.
11. **Heartbeat como linha da agenda**, derivada do frontmatter. Sem máquina
    própria.
12. **Casca** — último disparo nas Script Properties; materializar o run
    proativo quando vence; reaproveitar `RunPointer.notBefore`/`due()`
    (`src/run.ts:144`) para a hora marcada.
13. **Run proativo** — `ownerDm: false`, teto próprio, `NO_REPLY` com span,
    e o invariante duro: **nunca `waiting`, nunca `paused`**.
14. **Tetos no painel** (US$ 0,02/run, US$ 0,50/dia/agente, despertares/dia),
    ao lado dos itens de `src/limits.ts`.

---

## Fase 4 — Serialização por espaço  ⟵ depois da P2 fechar

15. No máximo um run aberto por `<folderId>:<espaço>`, reaproveitando a chave
    que já existe em `sessionQueue.ts`. Encosta em `runner.ts`/`chatAsync.ts`,
    por isso vem depois.

---

## Fase 5 — Recusa dos `hooks/`

16. ADR registrando que `hooks/` como no Eve é inviável sob a ADR-002 (seria
    código lido da pasta do Drive), para a pergunta não voltar à mesa.

---

## Dívidas registradas, fora desta track

- Entrega de `waiting`/`paused` no Chat (pista P2).
- Fronteira de confiança do **estado do run** na pasta compartilhada
  (handoff §5). Esta track resolve para a política, não para o run.
- Revogar a linha 133 de `docs/specs/2026-09-14-gasclaw-design.md`
  ("1 pump + 1 heartbeat + 1 jobs + 1 inbox"), anterior à ADR-027.
