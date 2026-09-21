# ADR-046 — Depois da coroa, vale o painel do sucessor

- **Data:** 2026-09-21
- **Status:** aceita (decisão do dono, opção A da F9)
- **Relaciona:** [ADR-043](043-sucessor-e-um-agente.md), [ADR-044](044-chat-segue-o-coroado.md), [P36](../../poc/p36-capacidades-no-real/README.md), [spec F9](../specs/2026-09-21-fechamento-da-branch.md)

## Contexto

A F8 criou a 10ª checagem do health: num sucessor **coroado**, as permissões (`ACCESS:`, `CAP:`, `STATUS:`)
tinham de ser iguais às do pai, e a saída mandava rodar `./gasclaw succession inherit` quando diferiam.

Na F9 (P36, dev v173, sucessor v20) o dono tinha ligado as quatro capacidades no painel do **sucessor**, que
é o motor que responde. O pai, parado, só tinha Succeed. A checagem reprovava, e o conserto que ela sugeria
copiaria as permissões do pai por cima: apagaria três das quatro capacidades que o dono acabara de ligar.

## Decisão

1. Depois da coroa, o painel do sucessor é a fonte da verdade das permissões. O pai está parado e não
   serve o agente.
2. A 10ª checagem, num coroado, só exige que o sucessor **devolva** as permissões (a `readiness` responde).
   Ela informa quais chaves diferem do pai e, para `CAP:`, os nomes das capacidades dos dois lados, nunca o
   valor de `ACCESS:` (e-mails). Ela não reprova por diferença e não manda rodar `inherit`.
3. Antes da coroa nada muda: a coroa entrega as permissões do pai (`handover`) antes de ligar o sucessor.
4. `succession inherit` continua existindo, mas é o dono quem decide rodá-lo, lendo a 10ª antes: ele copia
   as permissões do pai por cima das do sucessor.

## Consequências

- Health do coroado 10/10 no real com capacidades diferentes do pai (PROGRESS, F9, A3/A4).
- Uma permissão mudada no pai depois da coroa não chega mais sozinha ao sucessor: ela é mudada no painel do
  sucessor.
- Implementação: `crownReadiness` e `capsLado` em `src/succession.ts`; teste em `test/sucessao.test.ts`.
