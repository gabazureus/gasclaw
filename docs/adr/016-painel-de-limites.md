# ADR-016 — Painel de limites na tela, no terminal e na planilha (POC P15)

- **Status:** Aceito no código (commit `ae22cd0`) · 2026-09-15 · **medição no dev pendente**: gcloud expirado e reautorização (ADR-015) ainda não feita · prod não recebeu

## Contexto
O usuário quer acompanhar, num lugar só, o total disponível e o usado de cada limite do Apps
Script, do Workspace, do Google Cloud e do OpenRouter. Decisões dele (2026-09-15): fontes =
todas; exibição na tela, no terminal e na planilha; cache de 10 min.

## Fonte da verdade
- Cotas do Apps Script para contas Workspace (guia oficial *Quotas for Google Services*):
  UrlFetch 100.000/dia, destinatários de e-mail 1.500/dia, tempo total de gatilhos 6 h/dia,
  6 min por execução, 30 execuções simultâneas, 20 gatilhos por script, Properties com 9 KB por
  valor e 500 KB no total. O guia **não diz** de quem é a cota quando o web app roda como quem o publicou.
- OpenRouter `/api/v1/key`: `limit`, `limit_remaining`, `usage`, `usage_daily` (dia UTC),
  `is_free_tier`. Modelos `:free`: 20 req/min; 50/dia com menos de US$ 10 em créditos, 1.000/dia com mais.
- Drive `about.get?fields=storageQuota`; Apps Script API `processes:listScriptProcesses`
  (`script.processes`); `MailApp.getRemainingDailyQuota` (`script.send_mail`); Monitoring
  `timeSeries.list` com `serviceruntime.googleapis.com/api/request_count` (`monitoring.read`).

## Decisão
1. **Núcleo puro** `src/limits.ts`: cada leitura vira um item com usado/total, barra verde (< 70%),
   amarela (< 90%) ou vermelha, data do reset e **selo**: "informado pelo Google/OpenRouter" ×
   "medido pelo gasclaw".
2. **Borda** `observe.limitsNow`: 11 fontes, cada uma isolada (uma falha não derruba as outras),
   com cache de 10 min.
   - **Funcionam já:** Drive, OpenRouter `/key`, requisições `:free` por dia e por minuto,
     UrlFetch estimado, maior execução do dia, tamanho das Properties.
   - **Aparecem como "aguardando autorização" até a reautorização:** execuções dos gatilhos,
     e-mails restantes, Monitoring e contagem de gatilhos.
3. **Medido pelo gasclaw** vem do lote do trace (ADR-014): contadores por hora e modelo nas
   Properties (`usage.ts`), sem ler a planilha.
4. **Exibição:** aba "Limites" na tela, `./gasclaw limits [--fresh]` e uma linha por item por dia
   na aba `limites` da planilha `gasclaw — execuções`, gravada pelo lote.
5. **Monitoring:** o número do projeto GCP é embutido no build a partir do `gasclaw.env`. Dev e
   prod já são projetos padrão (ADR-015).

## Critérios da POC P15 (`./gasclaw poc p15`)
C1 as 11 fontes com status `ok` ou `pendente` (pendente só nas 4 que dependem da reautorização)
· C2 leitura com cache < 1 s · C3 todo item com selo · C4 linha diária na aba `limites` · C5
`./gasclaw limits` funciona · C6 de quem é a cota: o web app executa como o dono (medido só com a
conta do dono; outra conta precisa de uma 2ª pessoa no domínio).

## Consequências
- O UrlFetch é **estimado**: 1 chamada por requisição ao modelo, mais 2 por run. As chamadas das
  ferramentas e da tela ficam de fora até o trace contá-las.
- Com a reautorização, o painel passa a mostrar o tempo real de gatilhos, que é o limite que o
  lote de 1 min consome (ver o C12 da P14).
