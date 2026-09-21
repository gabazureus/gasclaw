// O patch com que o Opus melhora o agente (F7, ADR-043). NÚCLEO PURO.
//
// O sucessor não é o motor reescrito: é o motor antigo mais um conjunto de TROCAS. O agente tem
// ~563 KB e uma execução do Apps Script morre em 6 min — reescrever tudo não cabe no tempo nem numa
// revisão humana (decisão 1 do dono). Uma troca diz: "este trecho exato vira este outro".
//
// A REGRA QUE ORGANIZA O ARQUIVO: cada trecho aparece EXATAMENTE UMA VEZ no arquivo ORIGINAL.
// - Zero vezes: o Opus inventou código que não existe no agente.
// - Duas ou mais: a troca é ambígua, e aplicar na primeira mudaria um lugar que ninguém escolheu.
// Nos dois casos adivinhar seria escrever num agente um código que ninguém revisou naquele lugar.
// E é tudo ou nada: meio patch aplicado é um agente que ninguém pediu.

/** Um arquivo do projeto Apps Script, como `GET projects/{id}/content` devolve (sem o `type`). */
export type PatchFile = { name: string; source: string };

/** Uma troca: no arquivo `file`, o trecho `find` (que aparece uma vez) vira `replace`. */
export type Change = { file: string; find: string; replace: string };

export type ParsedPatch = { ok: true; explanation: string; changes: Change[] } | { ok: false; reason: string };

/**
 * O que o Opus devolveu vira patch, ou não vira nada. Fail-closed.
 *
 * **Sem explicação, recusa.** O dono pediu duas coisas: o agente melhorado E saber o que melhorou. Um
 * patch mudo cumpre metade do pedido, e a metade que falta é a que permite a ele decidir se coroa.
 *
 * `replace` pode ser vazio — apagar código é uma melhoria legítima. `find` vazio, não: casaria em todo
 * lugar.
 */
export function parsePatch(raw: string | null | undefined): ParsedPatch {
  const t = String(raw ?? '').trim();
  const cerca = /```[a-z]*\s*\n?([\s\S]*?)```/i.exec(t);
  const corpo = cerca ? cerca[1] : t;
  const i = corpo.indexOf('{');
  const j = corpo.lastIndexOf('}');
  if (i < 0 || j <= i) return { ok: false, reason: 'the generator did not return a JSON patch' };
  let o: { explanation?: unknown; changes?: unknown };
  try {
    o = JSON.parse(corpo.slice(i, j + 1));
  } catch {
    return { ok: false, reason: 'the patch is not valid JSON' };
  }
  const explanation = typeof o.explanation === 'string' ? o.explanation.trim() : '';
  if (!explanation) return { ok: false, reason: 'the patch does not say what it improves: the owner asked to know that, not only to receive the code' };
  if (!Array.isArray(o.changes) || o.changes.length === 0) return { ok: false, reason: 'the patch has no change: an empty patch improves nothing' };
  const changes: Change[] = [];
  for (const c of o.changes) {
    const x = c as Record<string, unknown>;
    if (!x || typeof x.file !== 'string' || !x.file.trim()) return { ok: false, reason: 'a change does not name its file' };
    if (typeof x.find !== 'string' || !x.find) return { ok: false, reason: 'a change has an empty `find`: it would match everywhere' };
    if (typeof x.replace !== 'string') return { ok: false, reason: 'a change has no `replace`' };
    changes.push({ file: x.file.trim(), find: x.find, replace: x.replace });
  }
  return { ok: true, explanation, changes };
}

/** Quantas vezes `find` aparece em `src`, contando SOBREPOSIÇÕES: `aa` em `aaa` é ambíguo, são 2. */
function occurrences(src: string, find: string): number[] {
  const at: number[] = [];
  for (let k = src.indexOf(find); k >= 0; k = src.indexOf(find, k + 1)) at.push(k);
  return at;
}

export type Applied = { ok: true; files: PatchFile[] } | { ok: false; reason: string };

/**
 * Aplica as trocas — tudo ou nada.
 *
 * **Tudo é avaliado contra o ORIGINAL, não em cadeia.** Em cadeia, a ordem das trocas mudaria o
 * resultado, e uma troca poderia CRIAR o trecho que a seguinte procura — o Opus estaria escrevendo
 * contra um arquivo que não existe em lugar nenhum. Duas trocas cujos trechos se sobrepõem no original
 * também são recusadas: a segunda desfaria ou mexeria na primeira.
 */
export function applyPatch(files: readonly PatchFile[], changes: readonly Change[]): Applied {
  const alvos: { file: string; at: number; len: number; replace: string }[] = [];
  for (const c of changes) {
    const f = files.find((x) => x.name === c.file);
    if (!f) return { ok: false, reason: `the patch names a file that does not exist: ${c.file}` };
    const at = occurrences(f.source, c.find);
    if (at.length !== 1) return { ok: false, reason: `a \`find\` in ${c.file} appears ${at.length} times, it must appear exactly once: ${JSON.stringify(c.find.slice(0, 60))}` };
    alvos.push({ file: c.file, at: at[0], len: c.find.length, replace: c.replace });
  }
  for (const a of alvos) {
    for (const b of alvos) {
      if (a !== b && a.file === b.file && a.at < b.at + b.len && b.at < a.at + a.len) return { ok: false, reason: `two changes overlap in ${a.file}: the second would undo or alter the first` };
    }
  }
  return {
    ok: true,
    files: files.map((f) => {
      // Do FIM para o começo: aplicar assim mantém válidos os índices das trocas que ainda faltam.
      const meus = alvos.filter((a) => a.file === f.name).sort((a, b) => b.at - a.at);
      let s = f.source;
      for (const a of meus) s = s.slice(0, a.at) + a.replace + s.slice(a.at + a.len);
      return { name: f.name, source: s };
    }),
  };
}
