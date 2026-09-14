// POC P10 (descartável): arquivos do agente no editor do Apps Script (`agentes/<nome>/<PAPEL>.md.html`, markdown puro).
// Lado do runtime. O lado do PC (clasp, edição simulada, up) está em pc.sh; o veredito, em summary.ts.
import { DOC_MIME, editorEntries, ensureFolderPath, parseProjectExport, resolveRoles, ROLES, type ProjectFile } from '../../src/workspace';
import { listV2, upsert } from '../p6-docs-nativos/harness';

const AGENT = 'p10';
const RUNS = 5;
const DRIVE_PATH = ['gasclaw-poc', 'p10', 'agentes', AGENT];

const auth = () => ({ Authorization: `Bearer ${ScriptApp.getOAuthToken()}` });

function sha256(s: string): string {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map((b) => ((b + 256) % 256).toString(16).padStart(2, '0'))
    .join('');
}

/** Conteúdo do HEAD do próprio projeto pela Drive API (escopo `drive`, já no manifesto). */
export function exportProject(): ProjectFile[] {
  const url = `https://www.googleapis.com/drive/v3/files/${ScriptApp.getScriptId()}/export?mimeType=${encodeURIComponent('application/vnd.google-apps.script+json')}`;
  const res = UrlFetchApp.fetch(url, { headers: auth(), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error(`export do projeto ${res.getResponseCode()}: ${res.getContentText().slice(0, 200)}`);
  return parseProjectExport(res.getContentText('UTF-8'));
}

/** Primeira diferença entre dois textos (null se iguais), com 20 caracteres antes e 40 depois. */
export function firstDiff(a: string, b: string) {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (i === a.length && i === b.length) return null;
  const cut = (s: string) => s.slice(Math.max(0, i - 20), i + 40);
  return { at: i, a: cut(a), b: cut(b), lenA: a.length, lenB: b.length };
}

type Load = () => (name: string) => string;

/** Lê cada arquivo `runs` vezes com a variante; guarda sha256, bytes e se contém a marca da edição. */
function measure(names: string[], runs: number, mark: string | undefined, load: Load) {
  const runsMs: number[] = [];
  let files: Record<string, { sha: string; bytes: number; hasMark: boolean | null } | { error: string }> = {};
  for (let i = 0; i < runs; i++) {
    const t0 = Date.now();
    try {
      const read = load();
      files = Object.fromEntries(
        names.map((n) => {
          try {
            const s = read(n);
            return [n, { sha: sha256(s), bytes: Utilities.newBlob(s).getBytes().length, hasMark: mark ? s.includes(mark) : null }];
          } catch (err) {
            return [n, { error: (err as Error).message.slice(0, 200) }];
          }
        }),
      );
    } catch (err) {
      files = Object.fromEntries(names.map((n) => [n, { error: (err as Error).message.slice(0, 200) }]));
    }
    runsMs.push(Date.now() - t0);
  }
  return { maxMs: Math.max(...runsMs), runsMs, files };
}

function setup() {
  const a = ensureFolderPath(DRIVE_PATH).getId();
  const b = ensureFolderPath(DRIVE_PATH).getId();
  const ls = listV2(a);
  // Drive: AGENTS.md (perde para o editor), SOUL Doc (perde para o editor), IDENTITY Doc + IDENTITY.md (Doc vence), USER.md.
  upsert(a, ls, 'AGENTS.md', '# Regras do Drive\n', 'text/markdown', 'text/markdown');
  upsert(a, ls, 'SOUL', '# Alma do Drive\n', 'text/markdown', DOC_MIME);
  upsert(a, ls, 'IDENTITY', '# Identidade (Doc)\n', 'text/markdown', DOC_MIME);
  upsert(a, ls, 'IDENTITY.md', '# Identidade (md)\n', 'text/markdown', 'text/markdown');
  upsert(a, ls, 'USER.md', '# Usuario (md)\n', 'text/markdown', 'text/markdown');
  return { poc: 'P10', step: 'setup', pass: a === b, folderId: a, idempotent: a === b, files: listV2(a).length };
}

function read(mark: string | undefined, runs: number) {
  const t0 = Date.now();
  const project = exportProject();
  const listMs = Date.now() - t0;
  const entries = editorEntries(project, AGENT, 0);
  const names = entries.map((e) => e.id); // sem hardcode: vem da listagem do HEAD
  const variants = {
    htmlOutput: measure(names, runs, mark, () => (n) => HtmlService.createHtmlOutputFromFile(n).getContent()),
    template: measure(names, runs, mark, () => (n) => HtmlService.createTemplateFromFile(n).getRawContent()),
    driveExport: measure(names, runs, mark, () => {
      const files = exportProject();
      return (n) => files.find((f) => f.name === n)?.source ?? '(ausente)';
    }),
  };
  const htmlOutputDiff = Object.fromEntries(
    names.map((n) => {
      try {
        return [n, firstDiff(HtmlService.createHtmlOutputFromFile(n).getContent(), HtmlService.createTemplateFromFile(n).getRawContent())];
      } catch (err) {
        return [n, { error: (err as Error).message.slice(0, 200) }];
      }
    }),
  );
  const api = UrlFetchApp.fetch(`https://script.googleapis.com/v1/projects/${ScriptApp.getScriptId()}/content`, { headers: auth(), muteHttpExceptions: true });
  const apiBody = api.getResponseCode() === 200 ? '' : api.getContentText().slice(0, 160);
  const folderId = ensureFolderPath(DRIVE_PATH).getId();
  const sources = resolveRoles([...entries, ...listV2(folderId)]);
  const origem = Object.fromEntries(ROLES.map((r) => [r, sources[r]?.kind ?? 'missing']));
  return {
    poc: 'P10',
    step: 'read',
    pass: Object.values(variants).some((v) => Object.values(v.files).every((f) => 'sha' in f)),
    listed: names,
    listMs,
    variants,
    htmlOutputDiff, // a = getContent(), b = getRawContent() (texto do editor)
    projectsApi: { status: api.getResponseCode(), body: apiBody },
    origem,
    project: project.map((f) => ({ name: f.name, type: f.type, head: f.name.startsWith('agentes/') ? null : f.source.split('\n')[0].slice(0, 120) })),
  };
}

/** `./gasclaw poc p10` chama setup e read; `mark` e `runs` vêm da querystring. */
export function pocP10(step: string | undefined, p: Record<string, string> = {}) {
  if (step === 'setup') return setup();
  if (step === 'read' || !step) return read(p.mark || undefined, Math.min(Number(p.runs) || RUNS, RUNS));
  throw new Error(`etapa desconhecida: ${step} (use setup ou read)`);
}
