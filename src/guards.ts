// O CRIVO DE GUARDAS do agente sucessor (F7, ADR-043). NÚCLEO PURO.
//
// O crivo das automações recusa `getOAuthToken` e `script.googleapis.com` — e recusaria o PRÓPRIO motor,
// que usa os dois (16× e 8× no bundle). Para um sucessor a pergunta é outra: **o patch enfraquece alguma
// guarda?** Compara ANTES × DEPOIS e recusa se qualquer uma diminuir. Acrescentar guarda é fortalecer, e
// o crivo nunca recusa isso.
//
// O que conta como guarda, e por quê:
// - `assertOwner()` — quem não é o dono não muda nada;
// - `mayWriteProject(` — o motor nunca escreve em si mesmo (senão um patch apagaria o `assertOwner` dele);
// - `mayAct(` e `isRunnable(` — o portão único do que age sozinho, e o de arquivado;
// - `isEnabled()` — a chave de parada: o D6 provou que, sem ela em `mayAct`, `down` para o que fala e
//   deixa correr o que paga;
// - `NEVER_AUTO` — as ferramentas que nunca se auto-aprovam;
// - o registro FECHADO de tools, com o nível de aprovação de cada uma — ferramenta nova é poder novo, e
//   descer uma aprovação ("always" → "never") enfraquece sem apagar linha nenhuma.

export type Approval = 'always' | 'once' | 'never';
export type Guards = { counts: Record<string, number>; neverAuto: string[] | null; tools: Record<string, Approval> };

/** Força de cada nível: descer na escada é enfraquecer. */
const FORCA: Record<Approval, number> = { always: 2, once: 1, never: 0 };

const CHAMADAS: Record<string, string> = {
  assertOwner: 'assertOwner()',
  mayWriteProject: 'mayWriteProject(',
  mayAct: 'mayAct(',
  isRunnable: 'isRunnable(',
  isEnabled: 'isEnabled()',
};

const conta = (src: string, s: string) => src.split(s).length - 1;

/** Tira comentários de linha — o bundle tem comentários DENTRO da lista `NEVER_AUTO`, com aspas. */
const semComentarios = (src: string) => src.replace(/\/\/[^\n]*/g, '');

export function guardsOf(source: string): Guards {
  const src = String(source ?? '');
  const counts: Record<string, number> = {};
  for (const [k, s] of Object.entries(CHAMADAS)) counts[k] = conta(src, s);

  // `NEVER_AUTO = [ ... ]` — `null` quando a lista SUMIU, que é diferente de lista vazia.
  let neverAuto: string[] | null = null;
  const m = /NEVER_AUTO\s*=\s*\[([\s\S]*?)\]/.exec(src);
  if (m) neverAuto = [...semComentarios(m[1]).matchAll(/["']([a-z]+\.[a-z_.]+)["']/g)].map((x) => x[1]).sort();

  // O registro: cada `name: "x.y"` e a `approval` que vem depois dele, antes do próximo `name:`.
  const tools: Record<string, Approval> = {};
  const nomes = [...src.matchAll(/name:\s*"([a-z]+\.[a-z_.]+)"/g)];
  nomes.forEach((n, i) => {
    const fim = i + 1 < nomes.length ? (nomes[i + 1].index as number) : src.length;
    const a = /approval:\s*"(always|once|never)"/.exec(src.slice(n.index as number, fim));
    if (a) tools[n[1]] = a[1] as Approval;
  });
  return { counts, neverAuto, tools };
}

/**
 * O patch enfraquece alguma guarda? Devolve o motivo de CADA enfraquecimento — vazio quer dizer que
 * nada diminuiu. O motivo diz qual guarda e quanto, para o dono ler antes de coroar.
 */
export function guardsWeakened(before: string, after: string): string[] {
  const a = guardsOf(before);
  const d = guardsOf(after);
  const motivos: string[] = [];
  for (const k of Object.keys(CHAMADAS)) {
    if (d.counts[k] < a.counts[k]) motivos.push(`\`${CHAMADAS[k]}\` appears ${d.counts[k]} times, it was ${a.counts[k]}`);
  }
  if (a.neverAuto && !d.neverAuto) motivos.push('the NEVER_AUTO list is gone');
  else if (a.neverAuto && d.neverAuto) {
    for (const t of a.neverAuto) if (!d.neverAuto.includes(t)) motivos.push(`${t} left NEVER_AUTO`);
  }
  for (const [t, nivel] of Object.entries(d.tools)) {
    const antes = a.tools[t];
    if (antes === undefined) motivos.push(`new tool registered: ${t} — the tool registry is closed, and new power does not come in through a patch`);
    else if (FORCA[nivel] < FORCA[antes]) motivos.push(`${t} approval went from "${antes}" to "${nivel}"`);
  }
  for (const t of Object.keys(a.tools)) if (!(t in d.tools)) motivos.push(`tool ${t} disappeared from the registry`);
  return motivos;
}
