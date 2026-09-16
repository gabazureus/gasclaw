# Plan: P20 — aprovação durável

## Phase 1: Núcleo e contrato

- [x] Testar e implementar emissão, vínculo, validade, rotação e uso único
  <!-- core --> <!-- critical --> <!-- files: src/approval.ts, src/run.ts, test/approval.test.ts, test/run.test.ts -->
- [x] Tornar o parser de runs compatível com aprovação durável
  <!-- core --> <!-- critical -->

## Phase 2: Persistência atômica
<!-- depends: phase1 -->

- [x] Testar e implementar decisão autoritativa no Drive sob trava
  <!-- shell --> <!-- critical --> <!-- files: src/runStore.ts, test/runStore.test.ts -->
- [x] Provar que cache ausente ou velho não decide a aprovação
  <!-- shell --> <!-- critical -->

## Phase 3: Chat e tela
<!-- depends: phase2 -->

- [x] Migrar callbacks para referência mínima ao run durável
  <!-- shell --> <!-- critical --> <!-- files: src/chat.ts, src/main.ts, src/approvalStore.ts -->
- [x] Testar contrato único, identidade da borda e ausência de snapshot no cache
  <!-- critical -->
- [x] Retomar exatamente o run decidido via `claimById`
  <!-- core --> <!-- critical --> <!-- files: src/runner.ts, test/runner.test.ts -->

## Phase 4: POC real e documentação
<!-- depends: phase3 -->

- [x] Criar `poc/p20-approval/` e comando idempotente no CLI
  <!-- shell --> <!-- critical -->
- [x] Publicar somente em dev e medir C1–C5
- [x] Atualizar ADR, CHANGELOG, PROGRESS, glossary, track e Beads

## Phase 5: Revisão e consolidação
<!-- depends: phase4 -->

- [x] Revisão completa de segurança, concorrência, código e testes
  <!-- critical -->
- [x] Corrigir achados e repetir suíte, tipos, build, diff e POC real
- [x] Consolidar evidência antes de qualquer commit final

## Definition of done

Todos os critérios da spec passam com evidência real no dev; nenhuma publicação em prod/push; nenhum commit final antes da consolidação.

<!-- beads_tasks mapping: gasclaw-7yt -->
