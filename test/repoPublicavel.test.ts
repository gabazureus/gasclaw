// O REPOSITÓRIO É PUBLICÁVEL (MIT, ADR-030) — e o id do projeto e a URL de implantação são do DONO.
//
// O `.gitignore` já exclui `gasclaw.env` por esse motivo, e `docs/plans/*` já carregam a convenção
// `*_REDACTED`. Mesmo assim, a auditoria de 2026-09-23 achou o id real do Apps Script e a URL `/exec`
// completa (com o domínio da empresa) em dois arquivos: `succession/`, resíduo da sucessão removida
// nesta branch, e o README da P33. Nenhum teste olhava — a convenção existia só na cabeça de quem
// redigiu os handoffs. Agora ela tem catraca.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Ids do Apps Script e de implantação têm ~57 caracteres. O teto alto é de propósito: prefixos curtos
// (`1w3Pju8v`, o que a própria tela mostra) são fixture legítima e continuam passando.
const ID_LONGO = /\b(?:AKfycb[\w-]{50,}|1[\w-]{56,})\b/;

describe('nada no repositório revela o projeto Apps Script do dono', () => {
  const rastreados = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(ts|js|mjs|json|md|html|sh|yml|yaml)$/.test(f) && f !== 'package-lock.json');

  test('nenhum arquivo rastreado traz scriptId ou deployment id inteiro', () => {
    expect(rastreados.length).toBeGreaterThan(100); // controle positivo: a lista foi mesmo lida
    const vazando = rastreados.filter((f) => ID_LONGO.test(readFileSync(f, 'utf8')));
    expect(vazando).toEqual([]);
  });

  test('o padrão pega um id de verdade (senão a catraca seria decoração)', () => {
    expect(ID_LONGO.test('1w3Pju8vyj9y1ZgBIZZDDtgRAXuBOljQ8ZyOPU-kOOUFcwtVlwB7MHb0W')).toBe(true);
    expect(ID_LONGO.test('1w3Pju8v')).toBe(false); // o prefixo curto da tela continua valendo
  });
});
