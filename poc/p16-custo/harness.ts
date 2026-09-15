// POC P16 (descartável): custo por modelo e escolha de modelo por agente (ADR-018). Etapas chamadas pelo pc.sh com trace=0.
import { getOverride, keyCallsLast30min, listModels, setOverride, validateChoice } from '../../src/models';
import * as observe from '../../src/observe';
import { dayKey, dayTotals, fold, hourKey, prune, totalCost, totalReq, type Bucket } from '../../src/usage';

export type P16Deps = {
  apiKey: () => string | null;
  agent: () => { folderId: string; tools: string[] } | null;
  testAgent: (folderId: string, q: string) => { runId: string; model: string };
};

const H = 3_600_000;
const D = 24 * H;
const usageNow = () => observe.loadUsage(PropertiesService.getScriptProperties().getProperties());
const time = <T>(fn: () => T) => {
  const t0 = Date.now();
  const v = fn();
  return { ms: Date.now() - t0, v };
};
const sumHours = (h: Record<string, Bucket>, start: number) => {
  let cost = 0;
  let req = 0;
  for (let i = 0; i < 24; i++) {
    const b = h[hourKey(start + i * H)] ?? {};
    cost += totalCost(b);
    req += totalReq(b);
  }
  return { cost: Math.round(cost * 1e8) / 1e8, req };
};
const PREFERRED = ['openai/gpt-4o-mini', 'google/gemini-2.0-flash-001', 'mistralai/mistral-small-3.1-24b-instruct'];

export function pocP16(step: string | undefined, p: Record<string, string>, d: P16Deps) {
  const key = d.apiKey();
  if (step === 'check') {
    const drained = observe.drain();
    const v = observe.usageView(key);
    return { poc: 'P16', step, pass: true, drained: drained.drained, ...v.check };
  }
  if (step === 'speed') {
    observe.usageView(key);
    observe.limitsNow(key);
    const runs = Array.from({ length: 5 }, () => time(() => (observe.usageView(key), observe.limitsNow(key))).ms);
    return { poc: 'P16', step, pass: true, maxMs: Math.max(...runs), runsMs: runs };
  }
  if (step === 'sum') {
    const now = Date.now();
    const u = usageNow();
    const utc = dayKey(now, 'utc');
    const sp = dayKey(now, 'sp');
    const hUtc = sumHours(u.h, Date.parse(`${utc}T00:00:00Z`));
    const hSp = sumHours(u.h, Date.parse(`${sp}T00:00:00Z`) + 3 * H);
    const dUtc = dayTotals(u, utc, 'utc');
    const dSp = dayTotals(u, sp, 'sp');
    return {
      poc: 'P16', step, pass: true,
      utc: { day: utc, dia: { cost: totalCost(dUtc), req: totalReq(dUtc) }, horas: hUtc, igual: totalCost(dUtc) === hUtc.cost && totalReq(dUtc) === hUtc.req },
      sp: { day: sp, dia: { cost: totalCost(dSp), req: totalReq(dSp) }, horas: hSp, igual: totalCost(dSp) === hSp.cost && totalReq(dSp) === hSp.req, janelaUtc: `${sp}T03:00Z → +24 h` },
    };
  }
  if (step === 'setmodel') {
    const a = d.agent();
    if (!a) throw new Error('P16: cadastre um agente na tela');
    const list = listModels();
    const pick = p.model || PREFERRED.find((id) => list.some((m) => m.id === id && m.tools)) || list.filter((m) => m.tools && m.inM > 0).sort((x, y) => x.inM - y.inM)[0].id;
    const before = getOverride(a.folderId);
    const t0 = Date.now();
    try {
      setOverride(a.folderId, pick);
      const r = d.testAgent(a.folderId, 'Responda apenas: ok');
      const seconds = (Date.now() - t0) / 1000;
      return { poc: 'P16', step, pass: true, picked: pick, runModel: r.model, runId: r.runId, seconds, usouOEscolhido: r.model.startsWith(pick.replace(/:free$/, '')) };
    } finally {
      setOverride(a.folderId, before);
    }
  }
  if (step === 'refuse') {
    const list = listModels();
    const a = d.agent();
    const tools = a?.tools.length ? a.tools : ['now'];
    const noTools = list.find((m) => !m.tools);
    const withTools = list.find((m) => m.tools);
    return {
      poc: 'P16', step, pass: true, agentTools: tools,
      semTools: { id: noTools?.id ?? null, erro: noTools ? validateChoice(list, noTools.id, tools) : null },
      comTools: { id: withTools?.id ?? null, erro: withTools ? validateChoice(list, withTools.id, tools) : null },
    };
  }
  if (step === 'prune') {
    const now = Date.now();
    const u = fold(usageNow(), [
      { at: now - 8 * D, model: 'poc/antigo-8d', tokens: 1, cost: 0 },
      { at: now - 91 * D, model: 'poc/antigo-91d', tokens: 1, cost: 0 },
    ]);
    const pr = prune(u, now);
    const oldHours = Object.keys(pr.h).filter((k) => Date.parse(`${k}:00:00Z`) < now - 7 * D).length;
    const oldDays = Object.keys(pr.d).filter((k) => Date.parse(`${k}T00:00:00Z`) < now - 90 * D).length;
    return { poc: 'P16', step, pass: true, horasAntigas: oldHours, diasAntigos: oldDays, dobrouEmDia: !!pr.d[dayKey(now - 8 * D)]?.['poc/antigo-8d'], sumiu91d: !Object.values(pr.d).some((b) => b['poc/antigo-91d']), gravado: false };
  }
  if (step === 'keycalls') {
    const before = keyCallsLast30min();
    for (let i = 0; i < 10; i++) observe.usageView(key);
    return { poc: 'P16', step, pass: true, antes: before, depois: keyCallsLast30min(), leituras: 10 };
  }
  throw new Error(`etapa desconhecida: ${step} (use check, speed, sum, setmodel, refuse, prune ou keycalls)`);
}
