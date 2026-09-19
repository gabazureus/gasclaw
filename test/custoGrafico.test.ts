// O gráfico de custo: ver QUANTO cada modelo custou, e ver isso por dia, por mês e em 30 dias.
//
// O empilhado sempre soube o valor por modelo — mas só mostrava o dia inteiro de uma vez, num `<title>` que
// o navegador só abre depois de ~1 s parado. Quem queria saber "quanto o modelo X me custou" tinha que abrir
// a tabela. Estes testes prendem as duas coisas que consertam isso: o balão por segmento e a pizza da faixa.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas } from './gasEnv';

const html = readFileSync('src/settings.html', 'utf8');

describe('a tela pede a faixa e a tela mostra a pizza', () => {
  test('os três botões de faixa existem e trocam o estado pressionado', () => {
    for (const r of ['7d', '30d', 'months']) expect(html).toContain("id=\"range-" + r + "\"");
    expect(html).toContain("$('range-' + x).setAttribute('aria-pressed', String(x === r))");
  });

  test('a faixa escolhida chega ao servidor (sem isto o botão só muda de cor)', () => {
    expect(html).toContain("quiet('usageChart', chartDay || '', chartRange)");
  });

  // Trocar de faixa com um dia aberto mostraria 24 horas sob o título "12 meses".
  test('trocar de faixa fecha o zoom do dia', () => {
    expect(html).toMatch(/chartRange = r;\s*\n\s*chartDay = null;/);
  });

  test('a pizza é desenhada a partir dos mesmos totais e das mesmas cores da legenda', () => {
    expect(html).toContain('function drawPie(totals, series)');
    expect(html).toContain('drawPie(totais, series)');
    expect(html).toContain("cor(s, k)"); // a mesma função de cor do empilhado
  });

  // Um modelo sozinho ocupa 360°: o arco de A a A não desenha nada e a pizza sai vazia.
  test('a fatia de 100% vira um círculo, não um arco de zero grau', () => {
    expect(html).toContain('if (v >= total)');
    expect(html).toContain("svgEl('circle'");
  });

  test('sem gasto na faixa, a pizza diz isso em vez de sumir', () => {
    expect(html).toContain('No paid usage in this period.');
  });
});

describe('o balão: o valor do modelo sob o ponteiro', () => {
  test('cada segmento da barra tem o seu próprio balão, com modelo, valor e percentual', () => {
    expect(html).toMatch(/hoverable\(r, b\.key \+ ' · ' \+ s \+ ' — ' \+ money\(v\) \+ ' · ' \+ pct\(v, b\.total\)/);
  });

  test('cada fatia da pizza também, e ela é alcançável pelo teclado', () => {
    expect(html).toContain("const texto = s + ' — ' + money(v) + ' · ' + pct(v, total);");
    expect(html).toContain('hoverable(arco, texto, true)');
    expect(html).toContain("node.setAttribute('tabindex', '0')");
  });

  // O `<title>` continua lá: o balão é para o ponteiro, o `<title>` é para quem lê com leitor de tela.
  test('o balão não substitui o título acessível do SVG', () => {
    expect(html).toMatch(/const t = document\.createElementNS\([^)]*, 'title'\);\s*\n\s*t\.textContent = texto;/);
    expect(html).toContain("node.setAttribute('aria-label', texto)");
  });

  // Sem isto o balão entra debaixo do ponteiro, dispara o próprio `mouseout`, some e volta: pisca sem parar.
  test('o balão não captura o ponteiro', () => {
    expect(html).toMatch(/#tip \{[^}]*pointer-events: none/);
  });

  test('a tela continua sem innerHTML: o nome do modelo vem do servidor', () => {
    expect(html).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/);
  });
});

// Um valor de US$ 0,00004 arredondado a 4 casas vira "US$ 0" — e é justamente esse número que o balão existe
// para mostrar. O arredondamento não pode apagar o dado que a tela promete.
describe('o valor pequeno não pode virar zero', () => {
  test('a tela usa mais casas quando o gasto é menor que um milésimo', () => {
    expect(html).toContain('Math.abs(v) < 0.001 ? 7 : 4');
  });
});

describe('usageView: a faixa vem do cliente, então é validada', () => {
  beforeEach(() => {
    vi.resetModules();
    stubGas();
  });
  afterEach(() => vi.unstubAllGlobals());

  test('30d e months passam; qualquer outra coisa volta para 7 dias em vez de derrubar a tela', async () => {
    const { usageView } = await import('../src/observe');
    expect(usageView(null, undefined, '30d').chart.bars).toHaveLength(30);
    expect(usageView(null, undefined, 'months').chart.bars).toHaveLength(12);
    for (const ruim of ['', 'ontem', '../etc', '7D']) expect(usageView(null, undefined, ruim).chart.bars).toHaveLength(7);
  });

  test('dia inválido continua sendo recusado, faixa ou não', async () => {
    const { usageView } = await import('../src/observe');
    expect(() => usageView(null, '15/09/2026', '30d')).toThrow(/AAAA-MM-DD/);
  });
});

// A geometria da pizza é a única parte que erra em SILÊNCIO: um arco mal calculado desenha uma figura
// plausível com as proporções erradas. Então aqui o `drawPie` do arquivo é executado de verdade, contra um
// DOM mínimo — mesma ideia do `test/chatMarkdown.test.ts`.
describe('a pizza desenha a proporção certa', () => {
  const fonte = html.slice(html.indexOf('function drawPie('), html.indexOf('function drawChart('));

  /** Roda o `drawPie` do arquivo e devolve as fatias que ele criou. */
  function pizza(totals: Record<string, number>, series: string[]) {
    const fatias: { tag: string; attrs: Record<string, string>; titulo: string }[] = [];
    const svgEl = (tag: string, attrs: Record<string, unknown>) => {
      const no = { tag, attrs: Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, String(v)])), titulo: '', append: () => {} };
      if (tag !== 'svg') fatias.push(no);
      return no;
    };
    const ctx = {
      svgEl,
      el: (_t: string, p: Record<string, unknown>) => ({ tag: 'p', attrs: {}, titulo: String(p.textContent ?? '') }),
      money: (x: number) => 'US$ ' + x,
      pct: (v: number, t: number) => Math.round((v / t) * 1000) / 10 + '%',
      cor: (_s: string, k: number) => 'c' + k,
      hoverable: (no: { titulo: string }, texto: string) => { no.titulo = texto; return no; },
      $: () => ({ replaceChildren: () => {} }),
    };
    const chaves = Object.keys(ctx);
    new Function(...chaves, fonte + '; return drawPie(arguments[' + chaves.length + '], arguments[' + (chaves.length + 1) + ']);')(
      ...chaves.map((k) => (ctx as Record<string, unknown>)[k]), totals, series,
    );
    return fatias;
  }

  test('duas metades: cada arco é meia volta, e o balão diz 50%', () => {
    const f = pizza({ a: 1, b: 1 }, ['a', 'b']);
    expect(f).toHaveLength(2);
    expect(f.map((x) => x.titulo)).toEqual(['a — US$ 1 · 50%', 'b — US$ 1 · 50%']);
    // Começa no topo (−90°) e desce pela direita: a primeira metade vai de (80,10) a (80,150). O cosseno de
    // π/2 não dá zero exato em ponto flutuante, então a asserção é sobre os NÚMEROS, com folga.
    const fim = (d: string) => (d.match(/A 70 70 0 \d 1 (-?[\d.]+) (-?[\d.]+)/) ?? []).slice(1).map(Number);
    expect(f[0].attrs.d).toContain('M 80 80 L 80 10');
    expect(fim(f[0].attrs.d)[0]).toBeCloseTo(80);
    expect(fim(f[0].attrs.d)[1]).toBeCloseTo(150);
    expect(fim(f[1].attrs.d)[1]).toBeCloseTo(10);
  });

  // O sinalizador de arco grande é o erro clássico: sem ele, 90% do gasto vira uma fatia de 10%.
  test('fatia maior que meia volta liga o large-arc-flag', () => {
    const f = pizza({ a: 9, b: 1 }, ['a', 'b']);
    expect(f[0].attrs.d).toMatch(/A 70 70 0 1 1/); // a de 90%
    expect(f[1].attrs.d).toMatch(/A 70 70 0 0 1/); // a de 10%
  });

  test('um modelo só vira círculo cheio, com o valor no balão', () => {
    const f = pizza({ a: 2 }, ['a']);
    expect(f).toHaveLength(1);
    expect(f[0].tag).toBe('circle');
    expect(f[0].titulo).toBe('a — US$ 2 · 100%');
  });

  test('modelo sem gasto na faixa não vira fatia invisível', () => {
    expect(pizza({ a: 1, b: 0 }, ['a', 'b'])).toHaveLength(1);
  });

  test('faixa sem gasto nenhum não desenha pizza: diz que não houve gasto', () => {
    expect(pizza({}, ['a'])).toHaveLength(0);
  });
});
