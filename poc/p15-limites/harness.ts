// POC P15 (descartável): painel de limites (ADR-016). Etapas chamadas pelo pc.sh com trace=0.
import * as observe from '../../src/observe';
import { ensureRunStore } from '../../src/runlog';

const REAUTH = ['processes', 'mail', 'monitoring', 'triggers'];

export function pocP15(step: string | undefined, _p: Record<string, string>, d: { apiKey: () => string | null; owner: () => string }) {
  const key = d.apiKey();
  if (step === 'read') {
    const t0 = Date.now();
    const l = observe.limitsNow(key, true);
    const freshMs = Date.now() - t0;
    const cached = Array.from({ length: 5 }, () => {
      const t = Date.now();
      observe.limitsNow(key);
      return Date.now() - t;
    });
    return {
      poc: 'P15', step, pass: true, freshMs, cachedMaxMs: Math.max(...cached), trigger: l.trigger,
      itens: l.items.map((i) => ({ id: i.id, status: i.status, source: i.source, level: i.level, used: i.used, total: i.total, note: i.note ?? null })),
      erros: l.items.filter((i) => i.status === 'error').map((i) => i.id),
      pendentesForaDaReautorizacao: l.items.filter((i) => i.status === 'pending' && !REAUTH.includes(i.id)).map((i) => i.id),
    };
  }
  if (step === 'dailyrow') {
    PropertiesService.getScriptProperties().deleteProperty('LIMITS_ROW_DAY'); // força a linha de hoje no próximo drain
    const drained = observe.drain();
    const { sheetId } = ensureRunStore();
    const res = UrlFetchApp.fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent('limites!A:A')}`, { headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` }, muteHttpExceptions: true });
    const rows: string[][] = res.getResponseCode() === 200 ? (JSON.parse(res.getContentText()).values ?? []) : [];
    const today = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
    return { poc: 'P15', step, pass: true, drained: drained.drained, skipped: drained.skipped ?? null, linhasHoje: rows.filter((r) => r[0] === today).length, http: res.getResponseCode() };
  }
  if (step === 'whose') {
    // web app "executar como: eu" (USER_DEPLOYING): quem executa é o dono, então as cotas do Apps Script são as do dono.
    let triggerOwners: string[] = [];
    try {
      triggerOwners = ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction());
    } catch (err) {
      triggerOwners = [`indisponível: ${(err as Error).message.slice(0, 80)}`];
    }
    return { poc: 'P15', step, pass: true, efetivo: Session.getEffectiveUser().getEmail(), ativo: Session.getActiveUser().getEmail(), dono: d.owner(), gatilhos: triggerOwners };
  }
  throw new Error(`etapa desconhecida: ${step} (use read, dailyrow ou whose)`);
}
