# Plano — F5: o sonho

> Ordem: **critério medido → juiz → gerador**. Nenhuma linha de produção antes da
> P23 passar. Fases por fatia: núcleo funcional → casca imperativa → caminho crítico.
> Verificação de cada fase: `npx tsc --noEmit` e `npx vitest run`.

## Fase 0 — gate de desenho  ⟵ **onde a track está agora**

Quatro decisões em aberto (A1–A4 em `decisions.md`) que mudam o conceito:
onde mora a capacidade, se os poderes são separados, replicação e "novo script".
**Nada é escrito enquanto elas não fecharem.**

## Fase 1 — POC P23: cabe na cota?  ⟵ gate de viabilidade

1. `poc/p23-sonho/` na forma das POCs anteriores (README ✅, harness, veredito JSON),
   cronômetros **dentro** do gatilho (ADR-027 §3).
2. Medir C1–C6. Requer autorização do usuário para publicar o dev.
3. ADR com o número medido — **inclusive se reprovar**, como a ADR-026 fez com a P3.

**Gate:** P23 verde ⇒ Fase 2. Vermelha ⇒ voltar ao desenho do ciclo antes de
escrever qualquer linha dele.

## Fase 2 — o conjunto-juiz (antes do gerador, de propósito)

4. `evals/dream-*.md`: ≥ 6 cenários de **qualidade**, dos quais o papel vigente
   não gabarita, mais 2 adversariais de segurança marcados como portão.
5. Rodar contra o papel vigente e registrar a linha de base. Sem linha de base não
   existe delta, e sem delta o placar não significa nada.

## Fase 3 — o ciclo  ⟵ crítico, revisão por inteiro

6. Núcleo puro: colheita do material, montagem do placar, regra de admissibilidade.
   Teste primeiro, por tabela, com os adversariais da spec.
7. Casca: o ciclo como `DurableRun`, um passo por par (candidato, cenário).
8. Promoção por card durável (ADR-028), com diff e delta.
9. Revisão por inteiro com `security-hardening` + painel. Nada de gray-box: o
   caminho promove texto vindo de pasta não confiável para papel vigente.

**Gate:** critérios da spec, todos verificáveis localmente.
