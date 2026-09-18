// O renderizador de markdown da tela de conversa (`src/chat.html`).
//
// Ele recebe o texto do MODELO, e o modelo lê conteúdo de terceiros: e-mail, evento, documento. Ou seja, a
// entrada aqui é hostil por construção. O ADR-002 exige que nada vindo de fora seja interpretado como
// HTML — por isso o renderizador constrói nós com textContent e NUNCA usa innerHTML, e por isso ele precisa
// de teste: sem isto, "deixar o negrito bonito" seria um caminho novo de injeção.
//
// A tela é HTML servido pelo Apps Script, não um módulo. O teste extrai o `<script>` do arquivo e o executa
// contra um DOM mínimo — mesma ideia do `test/gasEnv.ts`, que finge o Apps Script para rodar o gatilho real.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

type No = { tag: string; text: string; attrs: Record<string, string>; filhos: No[] };

function domFalso() {
  const cria = (tag: string): No & Record<string, unknown> => {
    const no: No & Record<string, unknown> = {
      tag: tag.toUpperCase(),
      text: '',
      attrs: {},
      filhos: [],
      get tagName() {
        return no.tag;
      },
      get textContent() {
        return no.filhos.map((f) => f.text ?? '').join('') + (no.text ?? '');
      },
      set textContent(v: string) {
        no.filhos = [];
        no.text = String(v);
      },
      set className(v: string) {
        no.attrs.class = v;
      },
      set href(v: string) {
        no.attrs.href = v;
      },
      set target(v: string) {
        no.attrs.target = v;
      },
      set rel(v: string) {
        no.attrs.rel = v;
      },
      append: (...xs: unknown[]) => xs.forEach((x) => no.filhos.push(x as No)),
      prepend: (...xs: unknown[]) => xs.forEach((x) => no.filhos.unshift(x as No)),
      replaceChildren: (...xs: unknown[]) => {
        no.filhos = xs as No[];
        no.text = '';
      },
      querySelector: () => null,
      get childNodes() {
        return no.filhos;
      },
    };
      return no;
  };
  return {
    createElement: cria,
    createTextNode: (t: string) => ({ tag: '#text', text: String(t), attrs: {}, filhos: [] }),
  };
}

// Extrai só as duas funções do renderizador e as avalia com o DOM falso.
const HTML = readFileSync('src/chat.html', 'utf8');
const SCRIPT = HTML.slice(HTML.indexOf('function inline('), HTML.indexOf('function add('));
const montar = () => {
  const document = domFalso();
  const fn = new Function('document', `${SCRIPT}; return { inline, markdown };`) as (
    d: unknown,
  ) => { inline: (el: unknown, t: string) => void; markdown: (el: unknown, t: string) => void };
  return { ...fn(document), document };
};

/** Percorre a árvore devolvendo `TAG[attr=valor]:texto`, para a asserção falar de estrutura. */
function achatar(no: No): string[] {
  const meu = no.tag === '#text' ? [`#text:${no.text}`] : [`${no.tag}${no.attrs.href ? `[href=${no.attrs.href}]` : ''}:${no.text ?? ''}`];
  return [...meu, ...no.filhos.flatMap(achatar)];
}
const render = (texto: string) => {
  const { markdown, document } = montar();
  const el = document.createElement('div');
  markdown(el, texto);
  return achatar(el as unknown as No);
};

describe('formatação: o que o modelo escreve aparece formatado, não com asterisco cru', () => {
  test('**negrito** vira STRONG', () => {
    expect(render('diga **isto** agora')).toContain('STRONG:isto');
  });
  test('*itálico* e _itálico_ viram EM', () => {
    expect(render('um *pouco* e _outro_')).toEqual(expect.arrayContaining(['EM:pouco', 'EM:outro']));
  });
  test('`código` vira CODE', () => {
    expect(render('rode `npm test` aí')).toContain('CODE:npm test');
  });
  test('bloco ``` vira PRE > CODE preservando as linhas', () => {
    const out = render('antes\n```\nlinha 1\nlinha 2\n```');
    expect(out).toContain('PRE:');
    expect(out).toContain('CODE:linha 1\nlinha 2');
  });
  test('lista com - vira UL > LI, e com 1. vira OL > LI', () => {
    // `inline()` escreve o texto num nó filho, então o LI aparece vazio e o conteúdo vem logo depois.
    expect(render('- um\n- dois')).toEqual(expect.arrayContaining(['UL:', 'LI:', '#text:um', '#text:dois']));
    expect(render('1. um\n2. dois')).toEqual(expect.arrayContaining(['OL:', 'LI:', '#text:um', '#text:dois']));
  });
  test('# título vira H3 (não H1: o H1 da página já existe)', () => {
    expect(render('# Resumo')).toContain('H3:');
  });
  test('código tem precedência sobre negrito: ** dentro de `` fica literal', () => {
    expect(render('use `a ** b` aqui')).toContain('CODE:a ** b');
  });
});

// A parte que não é estética.
describe('segurança: a entrada é hostil por construção', () => {
  test('HTML na resposta do modelo continua TEXTO, não vira elemento', () => {
    const out = render('olhe <img src=x onerror=alert(1)> isso');
    expect(out.some((n) => n.startsWith('IMG'))).toBe(false);
    expect(out.join('')).toContain('<img src=x onerror=alert(1)>');
  });

  test('link javascript: NÃO vira âncora e não ganha href', () => {
    const out = render('clique [aqui](javascript:alert(1))');
    expect(out.some((n) => n.startsWith('A['))).toBe(false);
    expect(out).toContain('SPAN:aqui'); // o texto aparece; o destino, não
  });

  test('link data: também é recusado', () => {
    expect(render('[x](data:text/html,<script>alert(1)</script>)').some((n) => n.startsWith('A['))).toBe(false);
  });

  test('link http(s) legítimo vira âncora com o destino', () => {
    const out = render('veja [o painel](https://script.google.com/macros/s/x/exec)');
    expect(out).toContain('A[href=https://script.google.com/macros/s/x/exec]:o painel');
  });
});

describe('robustez: nada aqui pode derrubar a tela', () => {
  test('texto vazio, nulo e indefinido não lançam', () => {
    for (const v of ['', null, undefined]) expect(() => render(v as unknown as string)).not.toThrow();
  });
  test('marcador sem fechamento fica literal em vez de comer o resto', () => {
    expect(render('isto **não fecha').join('')).toContain('**não fecha');
  });
  test('bloco de código sem fechamento não trava o laço', () => {
    expect(() => render('```\nsem fim')).not.toThrow();
  });
});
