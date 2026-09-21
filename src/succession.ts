// O agente SUCESSOR por patch (F7, Fase 2, ADR-043). NÚCLEO PURO.
//
// A casca (`writeSuccessor` no main) lê o próprio código pela API, manda ao Opus, e implanta o que sair
// daqui. Tudo o que DECIDE mora neste arquivo: o que vai no pedido, se o patch vira código, e se o dono
// pode coroar. A casca só faz I/O.
import { beatsIncumbent } from './dream';
import { guardsWeakened } from './guards';
import { applyPatch, parsePatch, type Change, type PatchFile } from './patch';

/**
 * Arquivos que o patch NÃO toca, e por quê:
 * - `appsscript`: os escopos do sucessor são os do pai (decisão 2). Um patch no manifesto seria o Opus
 *   pedindo poder novo por baixo da porta.
 * - `successor_seed`: é o que faz o sucessor nascer PARADO e saber qual agente servir. O pai escreve a
 *   semente dele depois do patch — um patch nela seria sobrescrito, ou pior, obedecido.
 */
const INTOCAVEIS: Record<string, string> = {
  appsscript: 'the patch touches the manifest: the successor keeps the parent scopes, and new power does not come in through a patch',
  successor_seed: 'the patch touches the seed: it is what makes the successor born paused, and only the parent writes it',
};

const SYSTEM =
  'You improve a Google Apps Script agent by returning a SMALL patch, never the whole program. ' +
  'Answer with JSON only: {"explanation": "<what you improved and why, at most 5 sentences>", "changes": [{"file": "<file name>", "find": "<an exact excerpt of that file>", "replace": "<its replacement>"}]}. ' +
  'Rules: at most 3 changes; each "find" must be copied EXACTLY from the file and must appear EXACTLY ONCE in it, at most 300 characters; ' +
  'fix ONE real defect or risk you can point to in the code. ' +
  'Never remove or weaken assertOwner, NEVER_AUTO, mayWriteProject, mayAct, isRunnable, isEnabled, the closed tool registry, or any permission or approval check. ' +
  'Never change the files appsscript (the manifest) or successor_seed.';

/** O pedido ao Opus: o código INTEIRO, e o objetivo do dono quando ele declarou um. */
export function patchMessages(files: readonly PatchFile[], goal: string): { role: 'system' | 'user'; content: string }[] {
  const codigo = files.map((f) => `=== FILE: ${f.name} ===\n${f.source}`).join('\n\n');
  const pedido = String(goal ?? '').trim();
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: pedido ? `${codigo}\n\nThe owner's goal for this improvement:\n${pedido}` : codigo },
  ];
}

export type Prepared = { ok: true; files: PatchFile[]; explanation: string; changes: Change[] } | { ok: false; reason: string };

/**
 * O texto do Opus vira o código do sucessor — ou uma recusa com motivo. Fail-closed em cada passo:
 * parse, arquivos intocáveis, troca que não muda nada, aplicação (cada trecho casa UMA vez), e o crivo
 * de guardas em CADA arquivo trocado.
 */
export function prepareSuccessor(files: readonly PatchFile[], raw: string): Prepared {
  const p = parsePatch(raw);
  if (!p.ok) return p;
  for (const c of p.changes) {
    if (INTOCAVEIS[c.file]) return { ok: false, reason: INTOCAVEIS[c.file] };
    if (c.find === c.replace) return { ok: false, reason: `a change in ${c.file} changes nothing: find and replace are the same text` };
  }
  const a = applyPatch(files, p.changes);
  if (!a.ok) return a;
  const motivos: string[] = [];
  for (const nome of new Set(p.changes.map((c) => c.file))) {
    const antes = files.find((f) => f.name === nome)?.source ?? '';
    const depois = a.files.find((f) => f.name === nome)?.source ?? '';
    for (const m of guardsWeakened(antes, depois)) motivos.push(`${nome}: ${m}`);
  }
  if (motivos.length) return { ok: false, reason: `the patch weakens a guard — ${motivos.join('; ')}` };
  return { ok: true, files: a.files, explanation: p.explanation, changes: p.changes };
}

/** O que o pai mediu ao avaliar o sucessor de fora (P34): o juiz é o do pai, para os dois lados. */
export type Evaluation = { successorPasses: number; incumbentPasses: number; k: number; complete: boolean; verdictLeaked: boolean };

export type CrownVerdict = { ok: true; standing: 'wins' | 'ties' } | { ok: false; reason: string };

/**
 * O portão ANTES do clique do dono. Recusa o que não foi medido direito e o que mede PIOR que o titular.
 *
 * O empate libera o clique, e isso é decisão tomada com o número da P34: os dois motores empataram
 * 5×5 em 6 cenários porque a bateria não toca o que um patch de código conserta. Exigir vitória faria
 * todo sucessor por patch ficar preso. A vitória é dita quando existe; a decisão é do dono (decisão 2).
 */
export function crownVerdict(ev: Evaluation | null): CrownVerdict {
  if (!ev) return { ok: false, reason: 'evaluate the successor first: the parent must judge it from outside before the crown' };
  if (!(ev.k > 0)) return { ok: false, reason: 'the evaluation measured no scenario' };
  if (!ev.complete) return { ok: false, reason: 'the evaluation is incomplete: a scenario without an answer is not a passed scenario' };
  if (ev.verdictLeaked) return { ok: false, reason: 'the successor returned a verdict: the evaluated never judges itself' };
  if (ev.successorPasses < ev.incumbentPasses) return { ok: false, reason: `the successor scores worse than the incumbent: ${ev.successorPasses} vs ${ev.incumbentPasses} of ${ev.k}` };
  return { ok: true, standing: beatsIncumbent(ev.successorPasses, ev.incumbentPasses, ev.k) ? 'wins' : 'ties' };
}
