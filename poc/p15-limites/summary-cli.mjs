// Uso: node poc/p15-limites/summary-cli.mjs <obs.json> → imprime o veredito; exit 0 só se passar.
import { readFileSync } from 'node:fs';
import { summarizeP15 } from './summary.ts';

const s = summarizeP15(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify(s, null, 2));
process.exit(s.pass ? 0 : 1);
