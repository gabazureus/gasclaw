// Contatos (E6): People API por REST. searchContacts (contacts.readonly) + otherContacts.search (contacts.other.readonly).
// A doc pede um "aquecimento" com query vazia antes de buscar, nos dois endpoints.
import { asData, gcall, qs, type Google } from './google';
import type { Tool, ToolCtx } from './registry';

const PEOPLE = 'https://people.googleapis.com/v1';
const MASK = 'names,emailAddresses';

const api = (ctx: ToolCtx): Google => {
  if (!ctx.google) throw new Error('ferramentas do Google indisponíveis neste canal');
  return ctx.google;
};
type Person = { names?: { displayName?: string }[]; emailAddresses?: { value?: string }[] };

function search(g: Google, endpoint: string, query: string): Person[] {
  // query vai sempre na URL, mesmo vazia (o qs omite vazios): é o aquecimento pedido pela doc.
  const url = (q: string) => `${PEOPLE}/${endpoint}?query=${encodeURIComponent(q)}&${qs({ readMask: MASK, pageSize: 10 })}`;
  gcall(g, { method: 'get', url: url('') }, 'aquecer a busca de contatos');
  return ((gcall(g, { method: 'get', url: url(query) }, 'buscar contatos').results ?? []) as { person?: Person }[]).map((r) => r.person ?? {});
}

export const CONTACTS_TOOLS: Tool[] = [
  {
    name: 'contacts.find',
    description: 'Acha o e-mail de uma pessoa pelo nome nos contatos do dono (e em "outros contatos", com quem ele já trocou e-mail).',
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'nome ou parte do nome', maxLength: 100 } }, required: ['name'], additionalProperties: false },
    approval: 'never',
    run: (a, ctx) => {
      const name = String(a.name ?? '').trim();
      if (!name || name.length > 100) throw new Error('"name" precisa ter de 1 a 100 caracteres');
      const g = api(ctx);
      const seen = new Set<string>();
      const lines: string[] = [];
      const add = (people: Person[], origin: string) => {
        for (const p of people) {
          const emails = (p.emailAddresses ?? []).map((e) => String(e.value ?? '').trim()).filter((e) => e && !seen.has(e.toLowerCase()));
          if (!emails.length) continue;
          emails.forEach((e) => seen.add(e.toLowerCase()));
          lines.push(`${String(p.names?.[0]?.displayName ?? '(sem nome)').slice(0, 100)} | ${emails.join(', ')} | ${origin}`);
        }
      };
      add(search(g, 'people:searchContacts', name), 'contatos');
      try {
        add(search(g, 'otherContacts:search', name), 'outros contatos');
      } catch (err) {
        lines.push(`(outros contatos indisponíveis: ${(err as Error).message.slice(0, 120)})`);
      }
      return asData('contatos', lines.join('\n'));
    },
  },
];
