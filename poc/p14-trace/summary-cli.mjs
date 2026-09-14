// Uso: node poc/p14-trace/summary-cli.mjs <obs.json> → imprime o veredito; exit 0 só se passar.
import { readFileSync } from 'node:fs';
import { summarizeP14 } from './summary.ts';

const s = summarizeP14(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify(s, null, 2));
process.exit(s.pass ? 0 : 1);
