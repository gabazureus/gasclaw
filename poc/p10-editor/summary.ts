// POC P10: junta as observações do PC (clasp) e do runtime (web app) e decide pass/fail por critério. Puro, sem imports.

export const C3_MS = 3000;
export const SOUL = 'agentes/p10/SOUL.md';
export const EXPECTED_ORIGEM = { AGENTS: 'editor', SOUL: 'editor', IDENTITY: 'doc', USER: 'md' };
const VARIANTS = ['htmlOutput', 'template', 'driveExport'] as const;

type FileObs = { sha?: string; bytes?: number; hasMark?: boolean | null; error?: string };
type Variant = { maxMs: number; files: Record<string, FileObs> };
export type ReadObs = {
  listed: string[];
  listMs: number;
  variants: Record<(typeof VARIANTS)[number], Variant>;
  projectsApi: { status: number };
  htmlOutputDiff?: Record<string, unknown>;
  origem: Record<string, string>;
  project: { name: string; type: string; head: string | null }[];
};
export type P10Obs = {
  c1: { local: Record<string, string>; pulled: Record<string, string> };
  setup: { idempotent: boolean };
  read: ReadObs;
  c4: { editS: number; exec: ReadObs; execVisibleS: number | null; headTries?: number; head: ReadObs; publishS: number; afterPublish: ReadObs };
  c5: { upS: number; pulledHasMark: boolean; read: ReadObs };
};

/** `agentes/p10/SOUL.md.html` (arquivo local) → `agentes/p10/SOUL.md` (nome no projeto). */
export const remoteName = (local: string) => local.replace(/\.html$/, '');
const marked = (r: ReadObs, v: (typeof VARIANTS)[number]) => r.variants[v]?.files?.[SOUL]?.hasMark === true;

export function summarizeP10(o: P10Obs) {
  const expected = Object.fromEntries(Object.entries(o.c1.local).map(([p, s]) => [remoteName(p), s]));
  const names = Object.keys(expected);

  const exported = new Map(o.read.project.map((f) => [f.name, f.type]));
  const c1 = {
    pass: names.length > 0 && Object.entries(o.c1.local).every(([p, s]) => o.c1.pulled[p] === s) && names.every((n) => exported.get(n) === 'html'),
    arquivos: Object.keys(o.c1.local),
    nomesNoProjeto: names,
  };

  const fidelity = Object.fromEntries(
    VARIANTS.map((v) => {
      const r = o.read.variants[v];
      const files = r?.files ?? {};
      const error = Object.values(files).find((f) => f.error)?.error ?? null;
      return [v, { fiel: names.every((n) => files[n]?.sha === expected[n]), maxMs: r?.maxMs ?? null, error }];
    }),
  );
  const listed = names.every((n) => o.read.listed.includes(n));
  const origemOk = Object.entries(EXPECTED_ORIGEM).every(([k, v]) => o.read.origem[k] === v);
  const c3 = {
    pass: VARIANTS.some((v) => fidelity[v].fiel && (fidelity[v].maxMs ?? Infinity) < C3_MS) && listed && origemOk && o.setup.idempotent,
    fidelidade: fidelity,
    diferencaHtmlOutput: o.read.htmlOutputDiff ?? null,
    listagemSemHardcode: listed,
    listMs: o.read.listMs,
    projectsApiStatus: o.read.projectsApi.status,
    precedencia: o.read.origem,
    pastaDriveIdempotente: o.setup.idempotent,
  };

  const c4 = {
    versaoFixaNaoVe: !marked(o.c4.exec, 'htmlOutput'),
    exportDoHead: { ve: marked(o.c4.exec, 'driveExport'), segundos: o.c4.execVisibleS, leituraMs: o.c4.exec.variants.driveExport?.maxMs ?? null },
    implantacaoHead: { ve: marked(o.c4.head, 'htmlOutput'), leituraMs: o.c4.head.variants.htmlOutput?.maxMs ?? null, tentativas: o.c4.headTries ?? 1 },
    publicarVersao: { ve: marked(o.c4.afterPublish, 'htmlOutput'), segundos: o.c4.publishS },
    edicaoSimuladaS: o.c4.editS,
    pass: false,
  };
  c4.pass = c4.exportDoHead.ve || c4.implantacaoHead.ve || c4.publicarVersao.ve;

  const c5 = {
    pass: o.c5.pulledHasMark && marked(o.c5.read, 'driveExport') && marked(o.c5.read, 'htmlOutput'),
    editorDepoisDoUp: o.c5.pulledHasMark,
    runtimeDepoisDoUp: marked(o.c5.read, 'htmlOutput'),
    upS: o.c5.upS,
  };

  const code = o.c5.read.project.filter((f) => !f.name.startsWith('agentes/') && f.name !== 'appsscript' && f.name !== 'settings');
  const c6 = {
    pass: code.length === 1 && code[0].name === '_motor' && code[0].type === 'server_js' && /NÃO EDITE/.test(code[0].head ?? ''),
    arquivosDoProjeto: o.c5.read.project.map((f) => `${f.name} (${f.type})`),
    cabecalho: code[0]?.head ?? null,
  };

  return { poc: 'P10', pass: c1.pass && c3.pass && c4.pass && c5.pass && c6.pass, c1, c3, c4, c5, c6 };
}
