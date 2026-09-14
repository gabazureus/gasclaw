// Uso: node poc/p10-editor/summary-cli.mjs <obs.json>  → imprime o resumo; exit 0 só se passar. (Node ≥ 22.18: lê o .ts direto)
import { readFileSync } from 'node:fs';
import { summarizeP10 } from './summary.ts';

const summary = summarizeP10(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.pass ? 0 : 1);
