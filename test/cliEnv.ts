// Ambiente HERMÉTICO para os testes que executam o `gasclaw` de verdade.
//
// Fica FORA de um arquivo `.test.ts` de propósito: importar um helper de dentro de um arquivo de teste faz o
// vitest carregar aquele arquivo de novo e rodar a suíte dele duas vezes.
//
// Por que existe: o `gasclaw` carrega o `gasclaw.env` com `set -a`, então `ACCOUNT`, `DOMAIN` e
// `ACCOUNT_KIND` viram variáveis EXPORTADAS. Quando a suíte roda de dentro do `./gasclaw up` — o portão de
// testes que existe justamente para impedir um deploy quebrado — esses valores da máquina real chegavam ao
// bash de cada teste e venciam o fixture, porque `var ACCOUNT_KIND` lê o ambiente primeiro.
//
// Consequência medida numa instalação real: depois do passo 2 numa conta Gmail, seis testes falhavam e o
// `up` abortava ANTES de publicar, em qualquer sistema operacional. Passavam num shell limpo e falhavam
// exatamente onde importava. Um teste que depende do estado da máquina não descreve o código.
const GASCLAW_STATE =
  /^(ACCOUNT|DOMAIN|ACCOUNT_KIND|APPS_SCRIPT_API_OK|OPENROUTER_API_KEY|CLI_SECRET|CHAT_SA_EMAIL|SIBLING_URL|GASCLAW_.*|(GCP_PROJECT|GCP_NUMBER|GCP_LINKED|SCRIPT_ID|DEPLOY_ID|CONSENT_OK|CHAT_OK|AGENT_OK|WEBAPP_AUTH)_(DEV|PROD))$/;

export const baseEnv = (): NodeJS.ProcessEnv =>
  Object.fromEntries(Object.entries(process.env).filter(([k]) => !GASCLAW_STATE.test(k)));
