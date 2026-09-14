# gasclaw — Plano de Implementação (F0 + primeira fatia utilizável)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar `./gasclaw up`, que cria/publica o gasclaw num projeto Apps Script do Workspace e permite, no mesmo dia, conversar com um agente-pasta do Drive pela tela gasclaw e pelo Google Chat usando OpenRouter.

**Architecture:** TypeScript compilado localmente por esbuild para um único `dist/Code.js` (IIFE `gasclaw` + stubs globais gerados), mais `settings.html` e `appsscript.json`, publicado com clasp 3.4.1. Núcleo puro (parser da pasta, montagem do prompt, request/response do OpenRouter, lógica do Chat) testado com Vitest; casca fina chama DriveApp/UrlFetchApp/PropertiesService/CacheService. Um único script bash `gasclaw` orquestra setup, deploy, health, logs e rollback de forma idempotente, guardando IDs públicos em `gasclaw.env`.

**Tech Stack:** Google Apps Script (V8), TypeScript, esbuild 0.28.2, Vitest 5.0.0, @types/google-apps-script 2.0.13, @google/clasp 3.4.1, gcloud CLI, gh CLI, bash (compatível com bash 3.2 do macOS), OpenRouter (API compatível com OpenAI).

**Documentos de referência (ler antes de começar):**
- Spec: `docs/specs/2026-09-14-gasclaw-design.md`
- ADRs: `docs/adr/README.md` (001–008)
- Pesquisa: `docs/raw/sources/2026-09-14-pesquisa-referencias.md`
- Glossário e mapa de módulos: `UBIQUITOUS_LANGUAGE.md`
- Regras do projeto: `CLAUDE.md` (topo)

---

## Parte A — Registro de tudo que foi decidido (contexto completo)

### A.1 Origem e objetivo
O usuário quer rodar agentes estilo **Eve** (vercel/eve) **100% dentro do Google Apps Script**, sem pagar hospedagem, no próprio Google Workspace (é Super Admin). A pesquisa mostrou que portar o Eve literalmente é inviável (Node, Workflow SDK, sandbox), e que o **GASADK** (tanaikech/adk-gas) já resolve parte do problema em GAS. A experiência final pedida: **"um agente é uma pasta no meu Google Drive; eu defino a pasta na tela de configuração do gasclaw; converso pelo Google Chat; o resto roda sozinho"**, com a sensação de um OpenClaw ("claw").

### A.2 Entrevista — respostas do usuário (em ordem)
| # | Pergunta | Resposta |
|---|---|---|
| 1 | O que analisar ("Analise cada arquivo, cada…") | Cada repositório de referência |
| 2 | Base do runtime | GASADK vendorizado (depois condicionado a POC — ADR-004) |
| 3 | Nome | Inicialmente workspace-agents → depois **"tudo se chama gasclaw"** |
| 4 | LLMs | Inicialmente Gemini/Anthropic/OpenAI/OpenRouter → final: **só OpenRouter** (ADR-003) |
| 5 | docs/ | **docs/ como hub**; conductor/ na raiz (ADR-007) |
| 6 | Beads | **Beads stealth** |
| 7 | Excel | Pasta local do repo **e** upload numa pasta do Drive |
| 8 | Deploy | Local + GitHub Actions |
| 9 | Papel no Workspace | Super Admin |
| 10 | Linguagem | Runtime 100% GAS, deploy do PC com `npm run X`/`npx gasclaw`; **TS com build local** |
| 11 | Referências extras | google/clasp e leonhartX/gas-github (analisados) |
| 12 | GitHub | Repo **pessoal privado** |
| 13 | Agentes de exemplo | Os dois (executive-assistant e sheets-analyst) — F3 |
| 14 | Canais | Web, Google Chat, Gmail, HTTP → priorizado **Google Chat** (F1), Gmail/HTTP (F4) |
| 15 | Fases | Fatias verticais |
| 16 | Projeto GCP padrão | Sim, via gcloud |
| 17 | Ambientes | dev + prod |
| 18 | start/stop | Controle do runtime remoto → virou `./gasclaw up/down/restart/…` |
| 19 | Abordagem do núcleo | A (vendorizar/assumir GASADK) **+ melhorias nossas comprovadas por POC e auditoria** |
| 20 | Comandos | **"Preciso apenas chamar e PRONTO"** → comando único `./gasclaw up` |
| 21 | Operação | **"Não quero ter que fazer nada; só configurações iniciais"** |
| 22 | Segredos | `.env.local` |
| 23 | Revisão final | Auditoria completa, toda infra Google, Chat, **minimal code (devmode lean)**, prever obstáculos sem overengineering, agente = pasta do Drive definida na tela, absorver OpenClaw |
| 24 | Prod | Automático após dev verde |
| 25 | Dono do script/triggers | **Conta do próprio usuário** |
| 26 | Gemini | **Não usar agora; só OpenRouter** |
| 27 | Instalar gcloud+clasp | Sim (instalação disparada; ver A.5) |

### A.3 Pesquisa — aprendizados que moldam o código (resumo; detalhes em `docs/raw/sources/`)
- **GASADK:** único ponto de chamada ao modelo em `LlmAgent._generateContent`; estado HITL em Property (estoura 9 KB); timeout aborta em vez de retomar; só Gemini. → Não entra na F0. Loop simples primeiro (ADR-004).
- **Eve:** aprovação por tool (`never|once|always|policy`), durabilidade por step, skills progressivas. → F2.
- **OpenClaw (MIT):** arquivos AGENTS/SOUL/IDENTITY/USER/MEMORY/HEARTBEAT/BOOTSTRAP, limites 20k/60k caracteres, marcador "missing", verificação com chamada real ao LLM, cards de aprovação no Chat, `NO_REPLY`. → F0 usa AGENTS/SOUL/IDENTITY/USER + limites + "missing" + verificação real.
- **clasp 3.4.1:** não é biblioteca (chamar via CLI); `push` substitui o projeto remoto inteiro (`--force` em automação); `create-deployment -i <id>` mantém a URL; `rootDir` precisa estar dentro da raiz do projeto; `clasp run` exige OAuth client próprio (evitado na F0); `tail-logs` exige `projectId`.
- **labnol/apps-script-starter (MIT):** bundle IIFE + stubs `function f(...a){return app.f(...a)}` para GAS enxergar funções globais. → `build.mjs`.
- **gas-github (MIT):** detecção de divergência remoto × git. → F1 (Task F1-2).
- **Auditoria de limites:** evento do Chat 30 s; resposta assíncrona com card exige autenticação de app; 6 h/dia de runtime de trigger; 20 triggers; 9 KB/Property; 200 versões; `eval` funciona mas é proibido (ADR-002); UrlFetch documenta `timeoutSeconds` (POC P1); session control do Workspace derruba tokens.
- **devmode lean (`skills/minimal-code`):** escada (precisa existir? → já existe? → stdlib → nativo → dependência existente → uma linha → mínimo); nunca cortar validação/erros/segurança; atalhos com `// minimal:`.

### A.4 O que já foi feito (estado em 2026-09-14)
- [x] Pasta `~/Projects/gasclaw` com `git init -b main` (sem commits).
- [x] devmode adopt (`integrations/conductor-beads/install.sh --beads-stealth --with-guardrails`), Beads doctor: MEMORY IS LIVE.
- [x] devmode wiki adopt; `wiki/` e `raw/` movidos para `docs/`; caminhos corrigidos em `KARPATHY.md` e `.llm-wiki/managed-files`.
- [x] `docs/README.md`, spec, ADR 001–008, runbooks (`setup-inicial.md`, `devmode-update.md`), pesquisa em `docs/raw/sources/`, página de fonte e log no wiki.
- [x] `conductor/product.md`, `conductor/tech-stack.md`, `UBIQUITOUS_LANGUAGE.md`, `CLAUDE.md` (regras), `README.md`, `.gitignore`.
- [x] Memória do Claude: `gasclaw-project`, `gasclaw-user-prefs`.
- [ ] `brew install --cask google-cloud-sdk` — **em andamento/verificar** (`gcloud --version`).
- [ ] `npm install -g @google/clasp@3.4.1` — **não concluído** (o plano usa clasp local via `npx`, então o global é opcional).
- [ ] `gh` não instalado.

### A.5 Ajustes da F0 em relação à spec (minimal code — registrar no ADR-009, Task 11)
1. **Chave do OpenRouter vai para Script Properties pela tela gasclaw** (campo "Chave OpenRouter"). `.env.local` continua sendo a fonte local: `./gasclaw up` copia a chave para a área de transferência (`pbcopy`) antes de abrir a tela. Motivo: gravar Properties remotamente exigiria `clasp run` + OAuth client próprio (mais um passo manual).
2. **Chat app clássico** (não add-on), resposta **síncrona** apenas (máx. 1.000 tokens, modelo rápido recomendado). Resposta assíncrona com card = F2 (POC P2).
3. **Histórico da conversa em CacheService** (últimas 20 mensagens, 6 h). Sessões no Drive = F1.
4. **Um projeto GCP por ambiente** (`GCP_PROJECT_DEV`, `GCP_PROJECT_PROD`), porque cada projeto GCP tem uma única configuração de Chat app.
5. **Vínculo GCP↔script e configuração do Chat app são pausas guiadas** (Enter para continuar) — não há API.
6. **Agente padrão = primeiro da lista**; múltiplos agentes por espaço = F1.
7. **`users` só aceita e-mails** (grupos = F1). Dono sempre tem acesso; lista vazia = só o dono.
8. **Health check** via `curl` com `gcloud auth print-access-token` (login com `--enable-gdrive-access`); se falhar, apenas avisa.
9. Sem pump/triggers/heartbeat/jobs/Excel/aprovações na F0 (F2–F3).
10. **Web app com `access: MYSELF`** (a tela é só do dono; impede que outra pessoa do domínio chame `onMessage` forjado via `google.script.run`). `assertOwner` fica como defesa extra. Fallback para `DOMAIN` se o Chat exigir (Task 9, Step 6).
11. **CI publica dev e prod sem health/rollback automático** na F0; rollback manual com `./gasclaw rollback --prod`. Automático na F1.

### A.6 Ações manuais únicas do usuário (o `up` pausa e abre a página certa)
1. Clicar em Permitir: `gcloud auth login --enable-gdrive-access`, `clasp login` (e `gh auth login` na Task 11).
2. Ligar **Google Apps Script API** em https://script.google.com/home/usersettings.
3. Tela de consentimento OAuth **Interna** no projeto GCP (nome gasclaw, e-mail de suporte = sua conta).
4. Vincular o número do projeto GCP no script (Configurações do projeto → Alterar projeto).
5. Autorizar o web app na primeira abertura.
6. Configurar o Chat app (nome, desmarcar "complemento do Workspace", conexão Apps Script com o ID de implantação, visibilidade do domínio).
7. Colar a chave OpenRouter e a URL da pasta do agente na tela gasclaw.
8. (Admin, recomendado) marcar clasp/gcloud como Confiáveis e ligar "Exempt trusted apps"; liberar `openrouter.ai` se houver allowlist de URL Fetch.

---

## Parte B — Mapa de arquivos

| Arquivo | Responsabilidade | Tipo |
|---|---|---|
| `package.json` | scripts `build`, `test`, `typecheck`; devDependencies pinadas | config |
| `tsconfig.json` | TS strict, tipos GAS, sem emissão | config |
| `vitest.config.ts` | ambiente node, `test/**/*.test.ts` | config |
| `build.mjs` | esbuild → `dist/Code.js` + stubs globais + copia manifest/html | build |
| `appsscript.json` | manifest: V8, escopos, webapp DOMAIN, `chat: {}` | GAS |
| `src/main.ts` | **único** entrypoint: `doGet`, `onMessage`, `onAddToSpace`, funções da tela | casca |
| `src/workspace.ts` | `extractFolderId`, `parseFrontmatter`, `buildSpec`, `canUse` (puros) + `loadAgent`, `seedAgent` (Drive) | núcleo+casca |
| `src/templates.ts` | textos iniciais de AGENTS/SOUL/IDENTITY/USER (base OpenClaw MIT) | dados |
| `src/llm.ts` | `buildRequest`, `parseResponse` (puros) + `complete` (UrlFetch) | núcleo+casca |
| `src/agent.ts` | `trimHistory`, `reply` (puros) | núcleo |
| `src/chat.ts` | `handleChat(event, deps)` (puro com deps injetadas) | núcleo |
| `src/store.ts` | Properties (agentes, chave, kill switch) + Cache (histórico) | casca |
| `src/settings.html` | tela gasclaw | UI |
| `test/*.test.ts` | testes do núcleo | teste |
| `gasclaw` | CLI bash: `up`, `down`, `restart`, `ship`, `ci`, `logs`, `status`, `doctor`, `rollback`, `open` | automação |
| `gasclaw.env` | IDs públicos (scripts, deployments, projetos, domínio) — **commitado, sem segredos** | estado |
| `.env.local` | `OPENROUTER_API_KEY` — **gitignored** | segredo |
| `.github/workflows/deploy.yml` | CI: testes → dev → prod | CI |
| `docs/adr/009-ajustes-f0.md` | registra A.5 | doc |

---

## Parte C — Tarefas

### Task 0: Pré-condições da máquina

**Files:** nenhum

- [ ] **Step 1: Verificar ferramentas**

Run: `node -v && git --version && python3 --version && (gcloud --version | head -1 || echo "gcloud ausente") && (gh --version | head -1 || echo "gh ausente")`
Expected: Node ≥ 20 (máquina atual: v24.1.0). gcloud/gh ausentes são instalados pelo `./gasclaw up` (Task 8), não bloqueiam as Tasks 1–8.

- [ ] **Step 2: Confirmar que o repo está limpo de artefatos antigos**

Run: `cd ~/Projects/gasclaw && git status --short | head -20`
Expected: apenas arquivos não rastreados do devmode/docs (nenhum commit ainda).

- [ ] **Step 3: Commit inicial da fundação (docs + devmode)**

```bash
cd ~/Projects/gasclaw
git add -A
git commit -m "chore: fundação gasclaw (devmode adopt + wiki, docs hub, spec, ADRs 001-008)"
```

---

### Task 1: Scaffold de build e testes

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `build.mjs`, `appsscript.json`, `src/main.ts` (provisório)
- Modify: `.gitignore`
- Test: `test/build.test.ts`

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "gasclaw",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc --noEmit && node build.mjs",
    "test": "vitest run",
    "up": "./gasclaw up",
    "ship": "./gasclaw ship"
  }
}
```

- [ ] **Step 2: Instalar dependências pinadas**

Run: `cd ~/Projects/gasclaw && npm install -D esbuild@0.28.2 vitest@5.0.0 @types/google-apps-script@2.0.13 @google/clasp@3.4.1 typescript`
Expected: `package-lock.json` criado; `npx clasp --version` imprime `3.4.1`.

- [ ] **Step 3: Criar `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["google-apps-script"]
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

- [ ] **Step 4: Criar `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['test/**/*.test.ts'], environment: 'node' } });
```

- [ ] **Step 5: Criar `appsscript.json`**

```json
{
  "timeZone": "America/Sao_Paulo",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/userinfo.email"
  ],
  "webapp": { "access": "MYSELF", "executeAs": "USER_DEPLOYING" },
  "chat": {}
}
```

- [ ] **Step 6: Criar `build.mjs`**

```js
// Bundle IIFE + stubs globais (padrão labnol/apps-script-starter, MIT) para o GAS enxergar as funções.
import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'gasclaw',
  target: 'es2020',
  outfile: 'dist/Code.js',
  minify: false,
});
const names = [...readFileSync('src/main.ts', 'utf8').matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
if (names.length === 0) throw new Error('build: nenhum "export function" em src/main.ts');
appendFileSync('dist/Code.js', '\n' + names.map((n) => `function ${n}(...a) { return gasclaw.${n}(...a); }`).join('\n') + '\n');
copyFileSync('appsscript.json', 'dist/appsscript.json');
copyFileSync('src/settings.html', 'dist/settings.html');
console.log(`build: dist/Code.js com ${names.length} funções globais: ${names.join(', ')}`);
```

- [ ] **Step 7: Criar `src/main.ts` e `src/settings.html` provisórios**

`src/main.ts`:
```ts
export function doGet(): GoogleAppsScript.HTML.HtmlOutput {
  return HtmlService.createHtmlOutput('gasclaw');
}
```

`src/settings.html`:
```html
<!doctype html><p>gasclaw</p>
```

- [ ] **Step 8: Escrever o teste do build**

`test/build.test.ts`:
```ts
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('build gera Code.js com stub global para cada export de main.ts', () => {
  execSync('node build.mjs', { stdio: 'pipe' });
  const code = readFileSync('dist/Code.js', 'utf8');
  expect(code).toContain('var gasclaw');
  expect(code).toMatch(/function doGet\(\.\.\.a\) \{ return gasclaw\.doGet\(\.\.\.a\); \}/);
  expect(readFileSync('dist/appsscript.json', 'utf8')).toContain('"chat"');
});
```

- [ ] **Step 9: Rodar**

Run: `npm run build && npm test`
Expected: `build: dist/Code.js com 1 funções globais: doGet` e `1 passed`.

- [ ] **Step 10: Atualizar `.gitignore`**

```
node_modules/
dist/
.env.local
.clasprc.json
.clasp.json
*.log
.DS_Store
```

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts build.mjs appsscript.json src test .gitignore
git commit -m "build: esbuild IIFE com stubs globais para Apps Script + vitest"
```

---

### Task 2: Leitura da pasta do agente (núcleo puro)

**Files:**
- Create: `src/workspace.ts`
- Test: `test/workspace.test.ts`

- [ ] **Step 1: Escrever os testes**

`test/workspace.test.ts`:
```ts
import { describe, expect, test } from 'vitest';
import { buildSpec, canUse, DEFAULT_MODEL, extractFolderId, parseFrontmatter } from '../src/workspace';

describe('extractFolderId', () => {
  test('aceita URL do Drive', () => {
    expect(extractFolderId('https://drive.google.com/drive/folders/1AbC_def-GHIjklmnop?usp=sharing')).toBe('1AbC_def-GHIjklmnop');
  });
  test('aceita ID puro', () => {
    expect(extractFolderId('  1AbC_def-GHIjklmnop ')).toBe('1AbC_def-GHIjklmnop');
  });
  test('rejeita lixo', () => {
    expect(extractFolderId('https://example.com')).toBeNull();
  });
});

describe('parseFrontmatter', () => {
  test('lê chaves simples e listas, ignora comentários', () => {
    const { data, body } = parseFrontmatter('---\nmodel: openai/gpt-5-mini  # rápido\nusers: [a@x.com, B@x.com]\n---\n# Regras\nSeja breve.');
    expect(data).toEqual({ model: 'openai/gpt-5-mini', users: ['a@x.com', 'B@x.com'] });
    expect(body).toBe('# Regras\nSeja breve.');
  });
  test('sem frontmatter devolve corpo inteiro', () => {
    expect(parseFrontmatter('# oi')).toEqual({ data: {}, body: '# oi' });
  });
});

describe('buildSpec', () => {
  test('monta prompt com arquivos e marca ausentes', () => {
    const spec = buildSpec('id1', 'Assistente', { 'AGENTS.md': '---\nmodel: x/y\n---\nRegras', 'SOUL.md': 'Calmo' });
    expect(spec.config.model).toBe('x/y');
    expect(spec.system).toContain('## AGENTS.md\nRegras');
    expect(spec.system).toContain('## SOUL.md\nCalmo');
    expect(spec.system).toContain('## IDENTITY.md\n(missing)');
  });
  test('usa modelo padrão e trunca em 20.000 caracteres por arquivo', () => {
    const spec = buildSpec('id1', 'A', { 'SOUL.md': 'x'.repeat(25_000) });
    expect(spec.config.model).toBe(DEFAULT_MODEL);
    expect(spec.system).not.toContain('x'.repeat(20_001));
    expect(spec.system).toContain('x'.repeat(20_000));
  });
});

describe('canUse', () => {
  const config = { model: 'm', users: ['ana@x.com'] };
  test('dono sempre pode', () => expect(canUse(config, 'Dono@x.com', 'dono@x.com')).toBe(true));
  test('usuário listado pode (case-insensitive)', () => expect(canUse(config, 'ANA@x.com', 'dono@x.com')).toBe(true));
  test('outros não podem', () => expect(canUse(config, 'bob@x.com', 'dono@x.com')).toBe(false));
  test('lista vazia = só o dono', () => expect(canUse({ model: 'm', users: [] }, 'ana@x.com', 'dono@x.com')).toBe(false));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/workspace.test.ts`
Expected: FAIL — `Cannot find module '../src/workspace'`.

- [ ] **Step 3: Implementar `src/workspace.ts`**

```ts
import { TEMPLATES } from './templates';

export type AgentConfig = { model: string; users: string[] };
export type AgentSpec = { folderId: string; name: string; config: AgentConfig; system: string };

export const FILES = ['AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'USER.md'] as const;
export const DEFAULT_MODEL = 'openrouter/auto';
const MAX_FILE = 20_000;
const MAX_TOTAL = 60_000;

export function extractFolderId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/folders\/([\w-]{10,})/) ?? s.match(/^([\w-]{10,})$/);
  return m ? m[1] : null;
}

// minimal: subconjunto de YAML plano (chave: valor | chave: [a, b]); chaves aninhadas entram quando F2 precisar.
export function parseFrontmatter(md: string): { data: Record<string, string | string[]>; body: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { data: {}, body: md };
  const data: Record<string, string | string[]> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    const v = kv[2].replace(/\s+#.*$/, '').trim();
    data[kv[1]] = v.startsWith('[') ? v.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean) : v;
  }
  return { data, body: md.slice(m[0].length) };
}

export function buildSpec(folderId: string, name: string, files: Partial<Record<string, string>>): AgentSpec {
  const { data, body } = parseFrontmatter(files['AGENTS.md'] ?? '');
  let total = 0;
  const parts = FILES.map((f) => {
    const text = f === 'AGENTS.md' ? (files[f] === undefined ? undefined : body) : files[f];
    if (text === undefined) return `## ${f}\n(missing)`;
    const cut = text.slice(0, Math.max(0, Math.min(MAX_FILE, MAX_TOTAL - total)));
    total += cut.length;
    return `## ${f}\n${cut}`;
  });
  const model = typeof data.model === 'string' && data.model ? data.model : DEFAULT_MODEL;
  const users = Array.isArray(data.users) ? data.users.map((u) => u.toLowerCase()) : [];
  return { folderId, name, config: { model, users }, system: parts.join('\n\n') };
}

export function canUse(config: AgentConfig, email: string, owner: string): boolean {
  const e = email.toLowerCase();
  return e === owner.toLowerCase() || config.users.includes(e);
}

export function loadAgent(folderId: string): AgentSpec {
  const folder = DriveApp.getFolderById(folderId);
  const files: Record<string, string> = {};
  for (const f of FILES) {
    const it = folder.getFilesByName(f);
    if (it.hasNext()) files[f] = it.next().getBlob().getDataAsString();
  }
  return buildSpec(folderId, folder.getName(), files);
}

/** Cria apenas os arquivos que faltam; nunca sobrescreve. Retorna os nomes criados. */
export function seedAgent(folderId: string, ownerEmail: string): string[] {
  const folder = DriveApp.getFolderById(folderId);
  const created: string[] = [];
  for (const f of FILES) {
    if (folder.getFilesByName(f).hasNext()) continue;
    folder.createFile(f, TEMPLATES[f].replace('{{OWNER}}', ownerEmail), 'text/markdown');
    created.push(f);
  }
  return created;
}
```

- [ ] **Step 4: Criar `src/templates.ts`**

```ts
// Templates inspirados em openclaw/openclaw docs/reference/templates (MIT, © 2026 OpenClaw Foundation).
export const TEMPLATES: Record<string, string> = {
  'AGENTS.md': `---
model: openrouter/auto   # troque por qualquer id do OpenRouter, ex.: anthropic/claude-sonnet-5
users: [{{OWNER}}]       # e-mails que podem falar com este agente
---
# Regras

- Responda em português do Brasil, de forma curta e direta.
- Se não souber, diga que não sabe. Nunca invente dados.
- Você ainda não tem ferramentas: não diga que enviou e-mails, criou arquivos ou agendou nada.
`,
  'SOUL.md': `# Personalidade

Prestativo, calmo e objetivo. Trata o usuário pelo nome quando souber.
`,
  'IDENTITY.md': `# Identidade

- Name: gasclaw
- Emoji: 🦀
`,
  'USER.md': `# Sobre o usuário

<!-- Diretivas curtas sobre quem você atende. Ex.: "Prefere respostas em tópicos." -->
`,
};
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run test/workspace.test.ts && npm run typecheck`
Expected: todos os testes PASS; typecheck sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/workspace.ts src/templates.ts test/workspace.test.ts
git commit -m "feat(workspace): pasta do agente → AgentSpec com limites, missing e acesso"
```

---

### Task 3: Cliente OpenRouter

**Files:**
- Create: `src/llm.ts`
- Test: `test/llm.test.ts`

- [ ] **Step 1: Escrever os testes**

`test/llm.test.ts`:
```ts
import { describe, expect, test } from 'vitest';
import { buildRequest, complete, OPENROUTER_URL, parseResponse, type Http } from '../src/llm';

const msgs = [{ role: 'user' as const, content: 'oi' }];

describe('buildRequest', () => {
  test('monta POST OpenAI-compatível com auth e limite de tokens', () => {
    const r = buildRequest('sk-1', 'x/y', msgs, 500);
    expect(r.url).toBe(OPENROUTER_URL);
    expect(r.init.method).toBe('post');
    expect(r.init.headers.Authorization).toBe('Bearer sk-1');
    expect(r.init.muteHttpExceptions).toBe(true);
    expect(JSON.parse(r.init.payload)).toEqual({ model: 'x/y', messages: msgs, max_tokens: 500 });
  });
});

describe('parseResponse', () => {
  test('extrai texto e uso', () => {
    const body = JSON.stringify({ choices: [{ message: { content: 'olá' } }], usage: { prompt_tokens: 3, completion_tokens: 1 } });
    expect(parseResponse(200, body)).toEqual({ text: 'olá', usage: { prompt_tokens: 3, completion_tokens: 1 } });
  });
  test('erro HTTP vira exceção legível sem vazar a chave', () => {
    expect(() => parseResponse(401, '{"error":{"message":"No auth"}}')).toThrow('OpenRouter 401: {"error":{"message":"No auth"}}');
  });
  test('resposta sem conteúdo vira exceção', () => {
    expect(() => parseResponse(200, '{"choices":[]}')).toThrow('OpenRouter: resposta sem conteúdo');
  });
});

describe('complete', () => {
  test('usa o http injetado', () => {
    let seen = '';
    const http: Http = (url) => {
      seen = url;
      return { code: 200, body: '{"choices":[{"message":{"content":"ok"}}]}' };
    };
    expect(complete('k', 'm', msgs, 100, http).text).toBe('ok');
    expect(seen).toBe(OPENROUTER_URL);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/llm.test.ts`
Expected: FAIL — `Cannot find module '../src/llm'`.

- [ ] **Step 3: Implementar `src/llm.ts`**

```ts
export type Message = { role: 'system' | 'user' | 'assistant'; content: string };
export type Completion = { text: string; usage?: { prompt_tokens: number; completion_tokens: number } };
type Init = { method: 'post'; contentType: string; headers: Record<string, string>; payload: string; muteHttpExceptions: true };
export type Http = (url: string, init: Init) => { code: number; body: string };

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export function buildRequest(apiKey: string, model: string, messages: Message[], maxTokens: number): { url: string; init: Init } {
  return {
    url: OPENROUTER_URL,
    init: {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: `Bearer ${apiKey}`, 'X-Title': 'gasclaw' },
      payload: JSON.stringify({ model, messages, max_tokens: maxTokens }),
      muteHttpExceptions: true,
    },
  };
}

export function parseResponse(code: number, body: string): Completion {
  if (code !== 200) throw new Error(`OpenRouter ${code}: ${body.slice(0, 300)}`);
  const json = JSON.parse(body);
  const text = json.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('OpenRouter: resposta sem conteúdo');
  return { text, usage: json.usage };
}

// minimal: sem retry/backoff para 429/5xx; entra na F2 junto com a fila durável.
const gasHttp: Http = (url, init) => {
  const res = UrlFetchApp.fetch(url, { ...init, timeoutSeconds: 240 } as GoogleAppsScript.URL_Fetch.URLFetchRequestOptions);
  return { code: res.getResponseCode(), body: res.getContentText() };
};

export function complete(apiKey: string, model: string, messages: Message[], maxTokens: number, http: Http = gasHttp): Completion {
  const { url, init } = buildRequest(apiKey, model, messages, maxTokens);
  const res = http(url, init);
  return parseResponse(res.code, res.body);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/llm.test.ts && npm run typecheck`
Expected: PASS; typecheck sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/llm.ts test/llm.test.ts
git commit -m "feat(llm): cliente OpenRouter com request/response puros e http injetável"
```

---

### Task 4: Turno do agente

**Files:**
- Create: `src/agent.ts`
- Test: `test/agent.test.ts`

- [ ] **Step 1: Escrever os testes**

`test/agent.test.ts`:
```ts
import { expect, test } from 'vitest';
import { reply, trimHistory } from '../src/agent';
import type { Message } from '../src/llm';
import { buildSpec } from '../src/workspace';

const spec = buildSpec('id', 'A', { 'AGENTS.md': 'Regras' });

test('trimHistory mantém as últimas N mensagens', () => {
  const h: Message[] = Array.from({ length: 25 }, (_, i) => ({ role: 'user', content: String(i) }));
  const t = trimHistory(h, 20);
  expect(t).toHaveLength(20);
  expect(t[0].content).toBe('5');
});

test('reply envia system + histórico + mensagem e devolve histórico novo', () => {
  let sent: Message[] = [];
  const out = reply(spec, [{ role: 'assistant', content: 'antes' }], 'oi', (m) => {
    sent = m;
    return { text: '  olá  ' };
  });
  expect(sent[0]).toEqual({ role: 'system', content: spec.system });
  expect(sent.slice(1)).toEqual([{ role: 'assistant', content: 'antes' }, { role: 'user', content: 'oi' }]);
  expect(out.text).toBe('olá');
  expect(out.history.slice(-2)).toEqual([{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'olá' }]);
});

test('reply com texto vazio do modelo devolve aviso', () => {
  expect(reply(spec, [], 'oi', () => ({ text: '   ' })).text).toBe('(sem resposta do modelo)');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/agent.test.ts`
Expected: FAIL — `Cannot find module '../src/agent'`.

- [ ] **Step 3: Implementar `src/agent.ts`**

```ts
import type { Completion, Message } from './llm';
import type { AgentSpec } from './workspace';

export const MAX_HISTORY = 20;

export function trimHistory(history: Message[], max = MAX_HISTORY): Message[] {
  return history.slice(-max);
}

// minimal: 1 chamada ao LLM, sem tools; o loop de steps com checkpoint entra na F2.
export function reply(
  spec: AgentSpec,
  history: Message[],
  text: string,
  llm: (messages: Message[]) => Completion,
): { text: string; history: Message[] } {
  const past = trimHistory(history);
  const answer = llm([{ role: 'system', content: spec.system }, ...past, { role: 'user', content: text }]).text.trim() || '(sem resposta do modelo)';
  return { text: answer, history: trimHistory([...past, { role: 'user', content: text }, { role: 'assistant', content: answer }]) };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/agent.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent.ts test/agent.test.ts
git commit -m "feat(agent): turno único com histórico limitado"
```

---

### Task 5: Handler do Google Chat (núcleo com dependências injetadas)

**Files:**
- Create: `src/chat.ts`
- Test: `test/chat.test.ts`

Formato do evento do Chat app clássico (campos usados): `{ type: 'MESSAGE' | 'ADDED_TO_SPACE' | 'REMOVED_FROM_SPACE', message?: { text?: string, argumentText?: string }, user: { email: string }, space: { name: string } }`. A resposta síncrona é o objeto retornado `{ text }` (limite 30 s).

- [ ] **Step 1: Escrever os testes**

`test/chat.test.ts`:
```ts
import { describe, expect, test } from 'vitest';
import { handleChat, type ChatDeps, type ChatEvent } from '../src/chat';
import type { Message } from '../src/llm';
import { buildSpec } from '../src/workspace';

function deps(over: Partial<ChatDeps> = {}): ChatDeps & { saved: Record<string, Message[]> } {
  const saved: Record<string, Message[]> = {};
  return {
    saved,
    enabled: () => true,
    owner: () => 'dono@x.com',
    apiKey: () => 'sk',
    defaultAgent: () => ({ folderId: 'f1', name: 'A' }),
    load: () => buildSpec('f1', 'A', { 'AGENTS.md': '---\nusers: [ana@x.com]\n---\nRegras' }),
    history: () => [],
    saveHistory: (k, h) => {
      saved[k] = h;
    },
    llm: () => ({ text: 'olá' }),
    ...over,
  };
}
const msg = (email: string, text = 'oi'): ChatEvent => ({ type: 'MESSAGE', message: { text, argumentText: ` ${text}` }, user: { email }, space: { name: 'spaces/S1' } });

describe('handleChat', () => {
  test('boas-vindas ao ser adicionado', () => {
    expect(handleChat({ type: 'ADDED_TO_SPACE', user: { email: 'a@x.com' }, space: { name: 'spaces/S1' } }, deps()).text).toContain('gasclaw');
  });
  test('usuário autorizado recebe resposta e histórico é salvo por agente+espaço', () => {
    const d = deps();
    expect(handleChat(msg('ana@x.com'), d)).toEqual({ text: 'olá' });
    expect(d.saved['f1:spaces/S1']).toHaveLength(2);
  });
  test('usa argumentText (sem a menção) quando existe', () => {
    let last = '';
    const d = deps({ llm: (_k, _m, ms) => ((last = ms[ms.length - 1].content), { text: 'ok' }) });
    handleChat(msg('ana@x.com', 'resuma'), d);
    expect(last).toBe('resuma');
  });
  test('usuário não autorizado é recusado sem chamar o LLM', () => {
    let called = false;
    const r = handleChat(msg('bob@x.com'), deps({ llm: () => ((called = true), { text: 'x' }) }));
    expect(r.text).toContain('não tem acesso');
    expect(called).toBe(false);
  });
  test('kill switch desligado', () => expect(handleChat(msg('ana@x.com'), deps({ enabled: () => false })).text).toContain('pausado'));
  test('sem agente configurado', () => expect(handleChat(msg('dono@x.com'), deps({ defaultAgent: () => null })).text).toContain('Nenhum agente'));
  test('sem chave', () => expect(handleChat(msg('dono@x.com'), deps({ apiKey: () => null })).text).toContain('chave do OpenRouter'));
  test('erro do LLM vira mensagem amigável', () => {
    const r = handleChat(msg('dono@x.com'), deps({ llm: () => { throw new Error('OpenRouter 500: boom'); } }));
    expect(r.text).toContain('OpenRouter 500');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/chat.test.ts`
Expected: FAIL — `Cannot find module '../src/chat'`.

- [ ] **Step 3: Implementar `src/chat.ts`**

```ts
import { reply } from './agent';
import type { Completion, Message } from './llm';
import { canUse, type AgentSpec } from './workspace';

export type ChatEvent = {
  type: string;
  message?: { text?: string; argumentText?: string };
  user: { email: string };
  space: { name: string };
};
export type AgentEntry = { folderId: string; name: string };
export type ChatDeps = {
  enabled: () => boolean;
  owner: () => string;
  apiKey: () => string | null;
  defaultAgent: () => AgentEntry | null;
  load: (folderId: string) => AgentSpec;
  history: (key: string) => Message[];
  saveHistory: (key: string, history: Message[]) => void;
  llm: (apiKey: string, model: string, messages: Message[]) => Completion;
};

export function handleChat(e: ChatEvent, d: ChatDeps): { text?: string } {
  if (e.type === 'ADDED_TO_SPACE') return { text: 'Olá! Sou o gasclaw 🦀. Me mande uma mensagem para falar com seu agente.' };
  if (e.type !== 'MESSAGE') return {};
  if (!d.enabled()) return { text: 'O gasclaw está pausado pelo administrador.' };
  const entry = d.defaultAgent();
  if (!entry) return { text: 'Nenhum agente configurado. Abra a tela gasclaw e cole a URL de uma pasta do Drive.' };
  const key = d.apiKey();
  if (!key) return { text: 'Falta a chave do OpenRouter. Cole-a na tela gasclaw.' };
  try {
    const spec = d.load(entry.folderId);
    if (!canUse(spec.config, e.user.email, d.owner())) return { text: `Você (${e.user.email}) não tem acesso ao agente ${spec.name}.` };
    const text = (e.message?.argumentText ?? e.message?.text ?? '').trim();
    if (!text) return { text: 'Mande um texto para eu responder.' };
    const hk = `${entry.folderId}:${e.space.name}`;
    const out = reply(spec, d.history(hk), text, (m) => d.llm(key, spec.config.model, m));
    d.saveHistory(hk, out.history);
    return { text: out.text };
  } catch (err) {
    console.error('chat', err);
    return { text: `Não consegui responder agora: ${(err as Error).message}` };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test && npm run typecheck`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add src/chat.ts test/chat.test.ts
git commit -m "feat(chat): handler síncrono com kill switch, acesso por agente e erros amigáveis"
```

---

### Task 6: Armazenamento (Properties + Cache)

**Files:**
- Create: `src/store.ts`

Casca fina sem lógica de decisão; coberta pelos testes do Chat via deps e pela verificação real na Task 9.

- [ ] **Step 1: Implementar `src/store.ts`**

```ts
import type { AgentEntry } from './chat';
import type { Message } from './llm';

const props = () => PropertiesService.getScriptProperties();
const cache = () => CacheService.getScriptCache();
const SIX_HOURS = 21_600;
const CACHE_MAX = 90_000; // limite do CacheService é 100 KB por chave

export const getApiKey = (): string | null => props().getProperty('OPENROUTER_API_KEY');
export const setApiKey = (key: string): void => props().setProperty('OPENROUTER_API_KEY', key.trim());

export const getOwner = (): string | null => props().getProperty('OWNER');
export const setOwner = (email: string): void => props().setProperty('OWNER', email.toLowerCase());

export const listAgents = (): AgentEntry[] => JSON.parse(props().getProperty('AGENTS') ?? '[]');
export const saveAgents = (agents: AgentEntry[]): void => props().setProperty('AGENTS', JSON.stringify(agents));

export const isEnabled = (): boolean => props().getProperty('RUNTIME_ENABLED') !== 'false';
export const setEnabled = (on: boolean): void => props().setProperty('RUNTIME_ENABLED', String(on));

export function getHistory(key: string): Message[] {
  const raw = cache().get(`h:${key}`);
  return raw ? JSON.parse(raw) : [];
}

// minimal: histórico volátil (6 h) no Cache; sessões persistentes no Drive entram na F1.
export function saveHistory(key: string, history: Message[]): void {
  const h = [...history];
  let raw = JSON.stringify(h);
  while (raw.length > CACHE_MAX && h.length > 2) {
    h.shift();
    raw = JSON.stringify(h);
  }
  if (raw.length <= CACHE_MAX) cache().put(`h:${key}`, raw, SIX_HOURS);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/store.ts
git commit -m "feat(store): chave, dono, agentes, kill switch e histórico em cache"
```

---

### Task 7: Entrypoint GAS e tela gasclaw

**Files:**
- Modify: `src/main.ts` (substitui o provisório)
- Modify: `src/settings.html` (substitui o provisório)
- Modify: `test/build.test.ts`

Segurança: toda função chamável pela tela verifica o dono (`assertOwner`). O web app usa `access: "MYSELF"` (ADR-009, ajuste 10 — Task 11) para que só o dono abra a tela e chame `google.script.run`; `assertOwner` fica como defesa em profundidade.

- [ ] **Step 1: Atualizar o teste do build com as funções globais esperadas**

`test/build.test.ts`:
```ts
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const GLOBALS = ['doGet', 'onMessage', 'onAddToSpace', 'onRemoveFromSpace', 'settingsState', 'saveKey', 'addAgent', 'removeAgent', 'makeDefault', 'testAgent', 'setRuntimeEnabled', 'pocUrlFetchTimeout'];

test('build gera Code.js com stubs globais para triggers do Chat, web app e tela', () => {
  execSync('node build.mjs', { stdio: 'pipe' });
  const code = readFileSync('dist/Code.js', 'utf8');
  expect(code).toContain('var gasclaw');
  for (const n of GLOBALS) expect(code).toContain(`function ${n}(...a) { return gasclaw.${n}(...a); }`);
  expect(readFileSync('dist/settings.html', 'utf8')).toContain('google.script.run');
  expect(readFileSync('dist/appsscript.json', 'utf8')).toContain('"chat"');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/build.test.ts`
Expected: FAIL — falta `function onMessage(...a)`.

- [ ] **Step 3: Implementar `src/main.ts`**

```ts
import { reply } from './agent';
import { handleChat, type ChatDeps, type ChatEvent } from './chat';
import { complete } from './llm';
import * as store from './store';
import { extractFolderId, loadAgent, seedAgent } from './workspace';

const CHAT_MAX_TOKENS = 1000; // resposta síncrona precisa caber em 30 s

function ownerEmail(): string {
  const saved = store.getOwner();
  if (saved) return saved;
  const effective = Session.getEffectiveUser().getEmail(); // no web app (USER_DEPLOYING) = dono
  if (effective) store.setOwner(effective);
  return effective.toLowerCase();
}

function assertOwner(): string {
  const me = Session.getActiveUser().getEmail().toLowerCase();
  if (!me || me !== ownerEmail()) throw new Error('Apenas o dono do gasclaw pode fazer isso.');
  return me;
}

function json(o: unknown): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Web app ----------
export function doGet(e: GoogleAppsScript.Events.DoGet) {
  const action = e?.parameter?.action;
  if (!action) {
    ownerEmail();
    return HtmlService.createHtmlOutputFromFile('settings').setTitle('gasclaw').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  try {
    assertOwner();
    if (action === 'health') return json({ ok: true, enabled: store.isEnabled(), agents: store.listAgents().length, hasKey: !!store.getApiKey() });
    if (action === 'disable' || action === 'enable') {
      store.setEnabled(action === 'enable');
      return json({ ok: true, enabled: store.isEnabled() });
    }
    return json({ ok: false, error: `ação desconhecida: ${action}` });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message });
  }
}

// ---------- Google Chat (app clássico) ----------
function chatDeps(): ChatDeps {
  return {
    enabled: store.isEnabled,
    owner: ownerEmail,
    apiKey: store.getApiKey,
    defaultAgent: () => store.listAgents()[0] ?? null,
    load: loadAgent,
    history: store.getHistory,
    saveHistory: store.saveHistory,
    llm: (key, model, messages) => complete(key, model, messages, CHAT_MAX_TOKENS),
  };
}

export function onMessage(e: ChatEvent) {
  return handleChat(e, chatDeps());
}

export function onAddToSpace(e: ChatEvent) {
  return handleChat({ ...e, type: 'ADDED_TO_SPACE' }, chatDeps());
}

export function onRemoveFromSpace() {
  // nada a limpar na F0 (histórico expira sozinho no cache)
}

// ---------- Tela gasclaw (google.script.run) ----------
export function settingsState() {
  const me = assertOwner();
  return { me, enabled: store.isEnabled(), hasKey: !!store.getApiKey(), agents: store.listAgents() };
}

export function saveKey(key: string) {
  assertOwner();
  if (!/^sk-or-[\w-]{10,}$/.test(key.trim())) throw new Error('Chave inválida: a chave do OpenRouter começa com sk-or-');
  store.setApiKey(key);
  return settingsState();
}

export function addAgent(url: string) {
  const me = assertOwner();
  const id = extractFolderId(url);
  if (!id) throw new Error('URL de pasta inválida. Copie a URL da pasta no Google Drive.');
  const created = seedAgent(id, me);
  const spec = loadAgent(id);
  store.saveAgents([...store.listAgents().filter((a) => a.folderId !== id), { folderId: id, name: spec.name }]);
  return { state: settingsState(), created };
}

export function removeAgent(folderId: string) {
  assertOwner();
  store.saveAgents(store.listAgents().filter((a) => a.folderId !== folderId));
  return settingsState();
}

export function makeDefault(folderId: string) {
  assertOwner();
  const agents = store.listAgents();
  store.saveAgents([...agents.filter((a) => a.folderId === folderId), ...agents.filter((a) => a.folderId !== folderId)]);
  return settingsState();
}

export function testAgent(folderId: string, text: string) {
  assertOwner();
  const key = store.getApiKey();
  if (!key) throw new Error('Salve a chave do OpenRouter primeiro.');
  const spec = loadAgent(folderId);
  const t0 = Date.now();
  const out = reply(spec, [], text, (m) => complete(key, spec.config.model, m, CHAT_MAX_TOKENS));
  return { text: out.text, model: spec.config.model, ms: Date.now() - t0 };
}

export function setRuntimeEnabled(on: boolean) {
  assertOwner();
  store.setEnabled(on);
  return settingsState();
}

// ---------- POC P1: UrlFetch com resposta longa ----------
export function pocUrlFetchTimeout() {
  assertOwner();
  const key = store.getApiKey();
  if (!key) throw new Error('Salve a chave do OpenRouter primeiro.');
  const first = store.listAgents()[0];
  const model = first ? loadAgent(first.folderId).config.model : 'openrouter/auto';
  const prompt = 'Escreva um ensaio de 6000 palavras, muito detalhado, sobre a história da computação, capítulo por capítulo.';
  const t0 = Date.now();
  try {
    const r = complete(key, model, [{ role: 'user', content: prompt }], 12_000);
    const seconds = (Date.now() - t0) / 1000;
    console.log(JSON.stringify({ poc: 'P1', seconds, chars: r.text.length, model }));
    return { pass: seconds > 60, seconds, chars: r.text.length, model, usage: r.usage };
  } catch (err) {
    return { pass: false, seconds: (Date.now() - t0) / 1000, model, error: (err as Error).message };
  }
}
```

- [ ] **Step 4: Implementar `src/settings.html`**

```html
<!doctype html>
<html>
<head>
  <base target="_top">
  <meta charset="utf-8">
  <title>gasclaw</title>
  <style>
    body { font: 15px/1.45 system-ui, sans-serif; margin: 0; background: #f6f5f2; color: #1d1d1b; }
    main { max-width: 720px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 0 0 8px; }
    section { background: #fff; border: 1px solid #e3e1db; border-radius: 10px; padding: 16px; margin: 12px 0; }
    input, textarea { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #ccc; border-radius: 6px; font: inherit; }
    button { padding: 8px 12px; border: 0; border-radius: 6px; background: #1d1d1b; color: #fff; cursor: pointer; margin-top: 8px; font: inherit; }
    button.sec { background: #e3e1db; color: #1d1d1b; }
    .row { display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 4px 0; }
    .err { color: #b3261e; }
    pre { white-space: pre-wrap; background: #f6f5f2; padding: 8px; border-radius: 6px; }
  </style>
</head>
<body>
<main>
  <h1>🦀 gasclaw</h1>
  <p id="msg">Carregando…</p>

  <section>
    <h2>Status</h2>
    <div class="row"><span id="status"></span><button class="sec" id="toggle">…</button></div>
  </section>

  <section>
    <h2>Chave OpenRouter</h2>
    <input id="key" type="password" placeholder="sk-or-v1-…" autocomplete="off">
    <button id="saveKey">Salvar chave</button>
  </section>

  <section>
    <h2>Agentes</h2>
    <p>Cole a URL de uma pasta do Google Drive. O agente com ⭐ responde no Google Chat.</p>
    <input id="url" placeholder="https://drive.google.com/drive/folders/…">
    <button id="add">Adicionar e verificar</button>
    <div id="agents"></div>
  </section>

  <section>
    <h2>Testar</h2>
    <textarea id="prompt" rows="2">Quem é você?</textarea>
    <button id="test">Enviar ao agente ⭐</button>
    <pre id="answer" hidden></pre>
  </section>

  <section>
    <h2>POC P1 — UrlFetch longo</h2>
    <p>Pede uma resposta longa ao OpenRouter e mede o tempo. Aceite: mais de 60 s sem erro.</p>
    <button class="sec" id="poc">Rodar POC P1</button>
    <pre id="pocOut" hidden></pre>
  </section>
</main>
<script>
  const $ = (id) => document.getElementById(id);
  let state = null;

  function call(fn, ...args) {
    $('msg').className = '';
    $('msg').textContent = 'Trabalhando…';
    return new Promise((ok, fail) =>
      google.script.run
        .withSuccessHandler(ok)
        .withFailureHandler((e) => { $('msg').className = 'err'; $('msg').textContent = e.message; fail(e); })[fn](...args));
  }

  function button(label, onClick) {
    const b = document.createElement('button');
    b.className = 'sec';
    b.textContent = label;
    b.onclick = onClick;
    return b;
  }

  function render(s) {
    state = s;
    $('msg').textContent = 'Conectado como ' + s.me;
    $('status').textContent = (s.enabled ? '🟢 Ativo' : '⏸ Pausado') + ' · chave ' + (s.hasKey ? 'salva' : 'faltando') + ' · ' + s.agents.length + ' agente(s)';
    $('toggle').textContent = s.enabled ? 'Pausar' : 'Ativar';
    $('agents').replaceChildren(...s.agents.map((a, i) => {
      const row = document.createElement('div');
      row.className = 'row';
      const link = document.createElement('a');
      link.href = 'https://drive.google.com/drive/folders/' + a.folderId;
      link.textContent = (i === 0 ? '⭐ ' : '') + a.name;
      const actions = document.createElement('span');
      if (i > 0) actions.append(button('Tornar padrão', () => call('makeDefault', a.folderId).then(render)), ' ');
      actions.append(button('Remover', () => call('removeAgent', a.folderId).then(render)));
      row.append(link, actions);
      return row;
    }));
  }

  $('toggle').onclick = () => call('setRuntimeEnabled', !state.enabled).then(render);
  $('saveKey').onclick = () => call('saveKey', $('key').value).then((s) => { $('key').value = ''; render(s); });
  $('add').onclick = () => call('addAgent', $('url').value).then((r) => {
    $('url').value = '';
    render(r.state);
    $('msg').textContent = r.created.length ? 'Pasta verificada. Criados: ' + r.created.join(', ') : 'Pasta verificada.';
  });
  $('test').onclick = () => {
    if (!state.agents.length) { $('msg').textContent = 'Adicione um agente primeiro.'; return; }
    call('testAgent', state.agents[0].folderId, $('prompt').value).then((r) => {
      $('answer').hidden = false;
      $('answer').textContent = r.text + '\n\n— ' + r.model + ' · ' + r.ms + ' ms';
      $('msg').textContent = 'Resposta recebida.';
    });
  };
  $('poc').onclick = () => call('pocUrlFetchTimeout').then((r) => {
    $('pocOut').hidden = false;
    $('pocOut').textContent = JSON.stringify(r, null, 2);
    $('msg').textContent = r.pass ? 'POC P1 aprovada ✅' : 'POC P1 não atingiu o critério';
  });

  call('settingsState').then(render);
</script>
</body>
</html>
```

- [ ] **Step 5: Rodar tudo**

Run: `npm run build && npm test`
Expected: `build: dist/Code.js com 12 funções globais: doGet, onMessage, onAddToSpace, onRemoveFromSpace, settingsState, saveKey, addAgent, removeAgent, makeDefault, testAgent, setRuntimeEnabled, pocUrlFetchTimeout` e todos os testes PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/settings.html test/build.test.ts
git commit -m "feat: entrypoint GAS (web app, Chat, tela gasclaw) e POC P1"
```

---

### Task 8: CLI `gasclaw` (setup, deploy, operação)

**Files:**
- Create: `gasclaw` (executável), `gasclaw.env` (vazio), `scripts/{up,down,restart,ship,logs,status,doctor,rollback}.sh`

Regras do script: idempotente; compatível com bash 3.2 (macOS: sem `${x^^}`, sem arrays associativos); cada passo manual é uma `pause` com chave gravada em `gasclaw.env` (nunca pergunta de novo); IDs públicos em `gasclaw.env` (commitado); segredos só em `.env.local`. Em CI (`CI=true`) uma pausa pendente aborta com a instrução.

- [ ] **Step 1: Criar `gasclaw`**

```bash
#!/usr/bin/env bash
# gasclaw — ponto de entrada único e idempotente.  Uso: ./gasclaw <comando> [--prod]
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$PATH:/usr/local/share/google-cloud-sdk/bin:/opt/homebrew/share/google-cloud-sdk/bin"

ENV_FILE=gasclaw.env
touch "$ENV_FILE"
set -a
. "./$ENV_FILE"
[ -f .env.local ] && . ./.env.local
set +a

CMD="${1:-help}"
[ $# -gt 0 ] && shift
TARGET=dev
for a in "$@"; do [ "$a" = "--prod" ] && TARGET=prod; done
UP=$(printf '%s' "$TARGET" | tr '[:lower:]' '[:upper:]')

say()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
var()  { eval "printf '%s' \"\${$1:-}\""; }
setvar() {
  grep -v "^$1=" "$ENV_FILE" > "$ENV_FILE.tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
  eval "export $1=\"\$2\""
}
pause() { # $1 chave de concluído · $2 URL a abrir (ou vazio) · $3 instrução
  [ -n "$(var "$1")" ] && return 0
  [ -n "${CI:-}" ] && die "passo manual pendente: $3"
  printf '\n\033[33m⏸  %s\033[0m\n' "$3"
  [ -n "$2" ] && open "$2"
  printf '   Pressione Enter quando terminar… '
  read -r _
  setvar "$1" 1
}
clasp_() {
  printf '{"scriptId":"%s","rootDir":"dist","projectId":"%s"}\n' "$(var "SCRIPT_ID_$UP")" "$(var "GCP_PROJECT_$UP")" > .clasp.json
  npx --no-install clasp "$@"
}
url() { printf 'https://script.google.com/a/macros/%s/s/%s/exec' "${DOMAIN:-}" "$(var "DEPLOY_ID_$UP")"; }
remote() {
  local t
  t=$(gcloud auth print-access-token 2>/dev/null) || return 1
  curl -fsSL -H "Authorization: Bearer $t" "$(url)?action=$1"
}

ensure_tools() {
  command -v brew >/dev/null || die "Homebrew não encontrado: instale em https://brew.sh e rode de novo"
  command -v node >/dev/null || brew install node
  command -v gcloud >/dev/null || brew install --cask google-cloud-sdk
  command -v gh >/dev/null || brew install gh
  [ -x node_modules/.bin/clasp ] || npm ci
  ok "ferramentas"
}

ensure_auth() {
  local acct
  acct=$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1)
  if [ -z "$acct" ]; then
    say "login no Google Cloud (abre o navegador)"
    gcloud auth login --enable-gdrive-access
    acct=$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -1)
  fi
  setvar ACCOUNT "$acct"
  setvar DOMAIN "${acct#*@}"
  if [ ! -f "$HOME/.clasprc.json" ]; then
    say "login no clasp (abre o navegador)"
    npx --no-install clasp login
  fi
  pause APPS_SCRIPT_API_OK "https://script.google.com/home/usersettings" "Ligue 'Google Apps Script API' (On)."
  ok "autenticado como $ACCOUNT"
}

ensure_gcp() {
  local p
  p=$(var "GCP_PROJECT_$UP")
  if [ -z "$p" ]; then
    p="gasclaw-$TARGET-$(openssl rand -hex 3)"
    say "criando projeto GCP $p"
    gcloud projects create "$p" --name="gasclaw $TARGET"
    setvar "GCP_PROJECT_$UP" "$p"
  fi
  gcloud services enable script.googleapis.com chat.googleapis.com drive.googleapis.com logging.googleapis.com --project "$p" >/dev/null
  setvar "GCP_NUMBER_$UP" "$(gcloud projects describe "$p" --format='value(projectNumber)')"
  pause "CONSENT_OK_$UP" "https://console.cloud.google.com/auth/branding?project=$p" \
    "Tela de consentimento OAuth: público INTERNO, nome 'gasclaw', e-mail de suporte $ACCOUNT. Salve."
  ok "projeto GCP $p"
}

ensure_script() {
  if [ -z "$(var "SCRIPT_ID_$UP")" ]; then
    rm -f .clasp.json
    mkdir -p dist
    npx --no-install clasp create-script --type standalone --title "gasclaw-$TARGET" --rootDir dist
    setvar "SCRIPT_ID_$UP" "$(node -p 'require("./.clasp.json").scriptId')"
  fi
  pause "GCP_LINKED_$UP" "https://script.google.com/home/projects/$(var "SCRIPT_ID_$UP")/settings" \
    "Configurações do projeto → Projeto do Google Cloud → Alterar projeto → cole o número $(var "GCP_NUMBER_$UP") → Definir projeto."
  ok "script $(var "SCRIPT_ID_$UP")"
}

deploy() {
  local out v d
  say "build + testes"
  npm run build >/dev/null
  npm test >/dev/null
  say "push ($TARGET)"
  clasp_ push --force >/dev/null
  out=$(clasp_ create-version "gasclaw $(git rev-parse --short HEAD 2>/dev/null || echo local)")
  v=$(printf '%s' "$out" | grep -oE 'ersion [0-9]+' | grep -oE '[0-9]+' | head -1)
  [ -n "$v" ] || die "não consegui ler o número da versão: $out"
  d=$(var "DEPLOY_ID_$UP")
  if [ -z "$d" ]; then
    out=$(clasp_ create-deployment -V "$v" -d "gasclaw $TARGET")
    d=$(printf '%s' "$out" | grep -oE 'AKfy[A-Za-z0-9_-]+' | head -1)
    [ -n "$d" ] || die "não consegui ler o ID da implantação: $out"
    setvar "DEPLOY_ID_$UP" "$d"
  else
    clasp_ create-deployment -i "$d" -V "$v" -d "gasclaw $TARGET" >/dev/null
  fi
  ok "$TARGET na versão $v → $(url)"
}

authorize() {
  local label="gasclaw"
  [ "$TARGET" = dev ] && label="gasclaw dev"
  pause "WEBAPP_AUTH_$UP" "$(url)" "Na aba aberta, escolha sua conta e clique em Permitir (primeira autorização)."
  pause "CHAT_OK_$UP" "https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat?project=$(var "GCP_PROJECT_$UP")" \
    "Chat API → Configuração: nome '$label'; avatar https://fonts.gstatic.com/s/e/notoemoji/latest/1f980/512.png; descrição 'Agentes do Drive'; DESMARQUE 'Criar como complemento do Google Workspace'; Funcionalidade: receber mensagens 1:1 e participar de espaços; Conexão: Projeto do Apps Script → ID de implantação $(var "DEPLOY_ID_$UP"); Visibilidade: pessoas específicas do domínio $DOMAIN (ou o domínio todo); Salvar."
}

health() {
  local r
  r=$(remote health 2>/dev/null || true)
  case "$r" in
    *'"ok":true'*) ok "health: $r" ;;
    *) warn "health não confirmado automaticamente (abra $(url)). Resposta: ${r:0:160}" ;;
  esac
}

cmd_up() {
  ensure_tools
  ensure_auth
  ensure_gcp
  ensure_script
  deploy
  authorize
  remote enable >/dev/null 2>&1 || true
  health
  if [ -n "${OPENROUTER_API_KEY:-}" ]; then
    printf '%s' "$OPENROUTER_API_KEY" | pbcopy
    say "chave OpenRouter copiada — cole em 'Chave OpenRouter' na tela (só na primeira vez)"
  else
    warn "sem OPENROUTER_API_KEY no .env.local — cole a chave direto na tela"
  fi
  open "$(url)"
  ok "pronto ($TARGET): $(url)"
}

cmd_down()    { remote disable && echo && ok "agentes pausados ($TARGET)"; }
cmd_restart() { cmd_down || true; cmd_up; }
cmd_open()    { open "$(url)"; }

cmd_ship() {
  TARGET=prod; UP=PROD
  [ -n "$(var SCRIPT_ID_PROD)" ] || die "prod ainda não existe: rode ./gasclaw up --prod uma vez"
  deploy
  health
}

cmd_ci() { # usado pelo GitHub Actions: sem pausas, sem gcloud
  [ -x node_modules/.bin/clasp ] || npm ci
  TARGET=dev; UP=DEV; deploy
  TARGET=prod; UP=PROD; deploy
}

cmd_logs() { clasp_ tail-logs --watch | grep -v '^PAST'; }

cmd_status() {
  printf 'ambiente:     %s\nconta:        %s\nprojeto GCP:  %s\neditor:       https://script.google.com/home/projects/%s/edit\nweb app:      %s\n\n' \
    "$TARGET" "${ACCOUNT:-?}" "$(var "GCP_PROJECT_$UP")" "$(var "SCRIPT_ID_$UP")" "$(url)"
  clasp_ list-deployments || true
  remote health && echo || warn "health indisponível"
}

check() { # $1 descrição · $2 comando · $3 correção
  if eval "$2" >/dev/null 2>&1; then ok "$1"; else warn "$1 → $3"; fi
}
cmd_doctor() {
  check "Node ≥ 20" 'node -e "process.exit(Number(process.versions.node.split(\".\")[0]) < 20 ? 1 : 0)"' "brew install node"
  check "gcloud instalado" 'command -v gcloud' "brew install --cask google-cloud-sdk"
  check "login gcloud" 'gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q @' "gcloud auth login --enable-gdrive-access"
  check "login clasp" '[ -f "$HOME/.clasprc.json" ]' "npx clasp login"
  check "dependências npm" '[ -x node_modules/.bin/clasp ]' "npm ci"
  check "build e testes" 'npm run build && npm test' "rode 'npm test' para ver o erro"
  check "script $TARGET criado" '[ -n "$(var "SCRIPT_ID_$UP")" ]' "./gasclaw up"
  check "web app $TARGET publicado" '[ -n "$(var "DEPLOY_ID_$UP")" ]' "./gasclaw up"
  check "OPENROUTER_API_KEY no .env.local" '[ -n "${OPENROUTER_API_KEY:-}" ]' "crie .env.local com OPENROUTER_API_KEY=sk-or-…"
  check "health remoto" 'remote health | grep -q "\"ok\":true"' "abra a tela e autorize, ou: gcloud auth login --enable-gdrive-access"
}

cmd_rollback() {
  local d cur
  d=$(var "DEPLOY_ID_$UP")
  [ -n "$d" ] || die "sem implantação em $TARGET"
  cur=$(clasp_ list-deployments | grep "$d" | grep -oE '@[0-9]+' | tr -d @ | head -1)
  { [ -n "$cur" ] && [ "$cur" -gt 1 ]; } || die "sem versão anterior (atual: ${cur:-?})"
  clasp_ create-deployment -i "$d" -V "$((cur - 1))" -d "rollback" >/dev/null
  ok "$TARGET voltou para a versão $((cur - 1))"
}

case "$CMD" in
  up|down|restart|ship|ci|logs|status|doctor|rollback|open) "cmd_$CMD" ;;
  *) cat <<'TXT'
gasclaw — agentes do Drive rodando no Google Apps Script

  ./gasclaw up [--prod]       configura (1ª vez), publica e abre a tela
  ./gasclaw down [--prod]     pausa todos os agentes
  ./gasclaw restart [--prod]  down + up
  ./gasclaw ship              publica em prod (mesma URL)
  ./gasclaw logs [--prod]     logs ao vivo
  ./gasclaw status [--prod]   IDs, URLs, implantações e health
  ./gasclaw doctor [--prod]   diagnostica e diz como corrigir
  ./gasclaw rollback [--prod] volta para a versão anterior
  ./gasclaw open [--prod]     abre a tela gasclaw
TXT
  ;;
esac
```

- [ ] **Step 2: Criar aliases e arquivo de estado**

```bash
cd ~/Projects/gasclaw
chmod +x gasclaw
touch gasclaw.env
mkdir -p scripts
for c in up down restart ship logs status doctor rollback; do
  printf '#!/usr/bin/env bash\nexec "$(dirname "$0")/../gasclaw" %s "$@"\n' "$c" > "scripts/$c.sh"
  chmod +x "scripts/$c.sh"
done
```

- [ ] **Step 3: Validar sintaxe e ajuda**

Run: `bash -n gasclaw && ./gasclaw help | head -3 && ./scripts/doctor.sh`
Expected: sem erro de sintaxe; ajuda impressa; doctor lista ✓/! para cada item (gcloud/login/script ainda como "!" é esperado antes do primeiro `up`).

- [ ] **Step 4: Conferir flags do clasp 3.4.1 usadas pelo script**

Run: `npx clasp create-version --help; npx clasp create-deployment --help; npx clasp list-deployments --help; npx clasp tail-logs --help; npx clasp create-script --help`
Expected: `create-deployment` aceita `-i/--deploymentId`, `-V/--versionNumber`, `-d/--description`; `create-script` aceita `--type`, `--title`, `--rootDir`; `tail-logs` aceita `--watch`. **Se algum nome diferir, corrigir o `gasclaw` antes de seguir** e anotar em `docs/wiki/log.md`.

- [ ] **Step 5: Commit**

```bash
git add gasclaw gasclaw.env scripts
git commit -m "feat(cli): ./gasclaw up/down/restart/ship/ci/logs/status/doctor/rollback"
```

---

### Task 9: Primeiro `up` real (dev) e verificação ponta a ponta

**Files:**
- Create: `.env.local` (não commitado)
- Modify: `gasclaw.env` (preenchido pelo script), `docs/wiki/log.md`

Esta task exige o usuário no teclado (pausas da seção A.6). Quem executa conduz e registra os resultados.

- [ ] **Step 1: Criar `.env.local`**

```bash
cd ~/Projects/gasclaw
printf 'OPENROUTER_API_KEY=\n' > .env.local
```
O usuário cola a chave (`sk-or-v1-…`) depois do `=`. Nunca digitar a chave por ele.

- [ ] **Step 2: Rodar**

Run: `./gasclaw up`
Expected, em ordem: `✓ ferramentas` → login gcloud (navegador) → login clasp (navegador) → pausa Apps Script API → `criando projeto GCP gasclaw-dev-xxxxxx` → pausa consentimento INTERNO → script criado → pausa vincular número GCP → `build + testes` → `push (dev)` → `✓ dev na versão 1 → https://script.google.com/a/macros/<domínio>/s/AKfy…/exec` → pausa autorizar web app → pausa configurar Chat app → health → chave copiada → tela aberta → `✓ pronto (dev)`.

Se `gcloud projects create` falhar com permissão de organização: no Admin/Cloud Console dar a si mesmo o papel **Project Creator** na organização e rodar `./gasclaw up` de novo (é idempotente).

- [ ] **Step 3: Configurar na tela gasclaw**
1. Colar a chave em **Chave OpenRouter** → Salvar → status mostra "chave salva".
2. Criar no Drive a pasta "Assistente"; copiar a URL; colar em **Agentes** → Adicionar e verificar.
Expected: mensagem `Pasta verificada. Criados: AGENTS.md, SOUL.md, IDENTITY.md, USER.md`; os 4 arquivos aparecem na pasta; o agente aparece com ⭐.

- [ ] **Step 4: Testar pela tela**

Clicar **Enviar ao agente ⭐** com "Quem é você?".
Expected: resposta em português citando o nome gasclaw/🦀, seguida de `— openrouter/auto · NNNN ms`.

- [ ] **Step 5: Testar a pasta como fonte da verdade**

Editar `SOUL.md` no Drive para "Responda sempre em forma de haicai." → testar de novo.
Expected: resposta em haicai **sem novo deploy**.

- [ ] **Step 6: Testar pelo Google Chat**

No Google Chat: Novo chat → procurar "gasclaw dev" → mandar "oi".
Expected: resposta do agente em ≤ 30 s. Mandar "o que eu disse antes?" → responde usando o histórico.

Verificações de risco (registrar resultado em `docs/wiki/log.md`):
- **Web app `MYSELF` + Chat:** se o Chat não responder e o log mostrar erro de acesso, trocar em `appsscript.json` `"access": "MYSELF"` por `"DOMAIN"`, rodar `./gasclaw up` e registrar no ADR-009 (a tela continua protegida por `assertOwner`).
- **Identidade no Chat:** confirmar que `loadAgent` funciona quando outra pessoa do domínio conversa (se falhar com "Acesso negado" ao Drive, o handler roda como quem fala → compartilhar a pasta com a pessoa como leitora; solução definitiva na F1/F2).
- **Tempo:** anotar o tempo típico de resposta; se passar de 25 s, trocar `model` para um modelo mais rápido no frontmatter.

- [ ] **Step 7: Rodar a POC P1**

Clicar **Rodar POC P1**.
Expected (critério): `"pass": true` com `seconds > 60`. Se `pass: false` por resposta rápida, repetir com `model:` de um modelo de raciocínio mais lento no `AGENTS.md`. Se der erro de timeout do UrlFetch, registrar o limite real observado. Resultado → `docs/adr/010-poc-p1-urlfetch.md` (contexto, medição, decisão sobre `timeoutSeconds` e `max_tokens`).

- [ ] **Step 8: Operação**

Run: `./gasclaw status && ./gasclaw down && ./gasclaw doctor`
Expected: status mostra IDs/URLs/implantações; `down` → Chat responde "O gasclaw está pausado…"; depois `./gasclaw up` reativa (sem pausas, já concluídas) e o Chat volta a responder.

- [ ] **Step 9: Rollback**

Run: fazer uma alteração trivial (ex.: texto de boas-vindas), `./gasclaw up`, depois `./gasclaw rollback`.
Expected: `✓ dev voltou para a versão N-1`; `./gasclaw status` mostra a implantação em `@N-1`.

- [ ] **Step 10: Commit do estado**

```bash
git add gasclaw.env docs/wiki/log.md docs/adr/010-poc-p1-urlfetch.md
git commit -m "chore: primeiro deploy dev do gasclaw + resultado da POC P1"
```

---

### Task 10: Repositório GitHub privado e CI (dev → prod)

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Criar prod uma vez (interativo)**

Run: `./gasclaw up --prod`
Expected: mesmas pausas da Task 9 para prod (projeto GCP `gasclaw-prod-…`, script `gasclaw-prod`, Chat app "gasclaw"). Configurar chave e agente na tela de prod.

- [ ] **Step 2: Criar `.github/workflows/deploy.yml`**

```yaml
name: deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
concurrency: deploy
jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      CI: "true"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Credenciais do clasp
        run: printf '%s' "$CLASPRC_JSON" > ~/.clasprc.json
        env:
          CLASPRC_JSON: ${{ secrets.CLASPRC_JSON }}
      - run: ./gasclaw ci
```

- [ ] **Step 3: Criar o repo privado e o secret (pedir confirmação ao usuário antes — publica código no GitHub)**

```bash
cd ~/Projects/gasclaw
gh auth status || gh auth login
gh repo create gasclaw --private --source . --remote origin
gh secret set CLASPRC_JSON < ~/.clasprc.json
git add .github/workflows/deploy.yml
git commit -m "ci: deploy automático dev → prod no push da main"
git push -u origin main
```

- [ ] **Step 4: Verificar o CI**

Run: `gh run watch --exit-status`
Expected: job `deploy` verde; `./gasclaw status --prod` mostra nova versão em prod com a **mesma URL**.

- [ ] **Step 5: Iniciar a POC P7 (token do CI)**

Anotar a data do `clasp login` em `docs/wiki/log.md`. Critério: um `workflow_dispatch` executado ≥ 8 dias depois fica verde. Se falhar com `invalid_grant`: Admin → Controles de API → marcar o client do clasp como Confiável + "Exempt trusted apps" no controle de sessão; refazer `clasp login` e `gh secret set CLASPRC_JSON < ~/.clasprc.json`.

---

### Task 11: ADR-009, índices e tracks do conductor

**Files:**
- Create: `docs/adr/009-ajustes-f0.md`
- Modify: `docs/adr/README.md`, `conductor/tracks.md`, `docs/wiki/log.md`

- [ ] **Step 1: Criar `docs/adr/009-ajustes-f0.md`**

```markdown
# ADR-009 — Ajustes de minimal code na F0

- **Status:** Aceito · 2026-09-14

## Contexto
A F0 precisa rodar no mesmo dia com o menor código possível, respeitando os limites auditados.

## Decisão
1. Chave do OpenRouter salva em Script Properties pela tela gasclaw; `.env.local` é a fonte local e o `up` copia a chave para a área de transferência.
2. Chat app clássico, resposta síncrona (máx. 1.000 tokens).
3. Histórico em CacheService (20 mensagens, 6 h).
4. Um projeto GCP por ambiente (uma configuração de Chat app por projeto).
5. Vínculo GCP↔script e configuração do Chat app como pausas guiadas.
6. Agente padrão = primeiro da lista (⭐).
7. `users` aceita só e-mails; lista vazia = só o dono.
8. Health via `gcloud auth print-access-token` (login com `--enable-gdrive-access`).
9. Sem pump, triggers, heartbeat, jobs, Excel e aprovações na F0.
10. Web app com `access: MYSELF` (tela só do dono; `assertOwner` como defesa extra). Fallback `DOMAIN` se o Chat exigir.
11. CI publica dev e prod sem health/rollback automático; rollback manual por `./gasclaw rollback --prod` até a F1.

## Correções feitas durante a execução (Tasks 1–8)
12. **Task 1:** `npm install` do plano não trazia `@types/node` (peer opcional do vitest 5) e deixava `typescript` sem versão; `tsc --noEmit` cobre `test/`, que importa `node:*`. Adicionados `@types/node@24` (24.13.4) e `typescript@7.0.2`; todas as devDependencies ficaram com versão exata no `package.json`.
13. **Task 6:** `(): void => props().setProperty(...)` falha no TS 7 (TS2322: `Properties` não é `void`). Setters do `store.ts` passaram a usar corpo em bloco.
14. **Task 7:** `settings.html` ganhou acessibilidade mínima: `lang="pt-BR"`, `<label for>` nos campos, `role="status"`/`aria-live` nas mensagens e na resposta.

## Consequências
Cada item tem substituição planejada na seção "Parte D" do plano `docs/plans/2026-09-14-gasclaw-f0-plano-implementacao.md`.
```

- [ ] **Step 2: Atualizar `docs/adr/README.md`** — acrescentar as linhas:

```markdown
| [009](009-ajustes-f0.md) | Ajustes de minimal code na F0 | Aceito |
| [010](010-poc-p1-urlfetch.md) | Resultado da POC P1 (UrlFetch longo) | após Task 9 |
```

- [ ] **Step 3: Registrar tracks em `conductor/tracks.md`** — acrescentar ao final:

```markdown
## gasclaw

| Track | Status | Plano |
|---|---|---|
| F0 — fundação + primeira fatia (tela, Chat síncrono, OpenRouter, CLI, CI) | em andamento | docs/plans/2026-09-14-gasclaw-f0-plano-implementacao.md |
| F1 — agente-pasta completo | planejado | Parte D do plano F0 |
| F2 — execução durável + aprovação | planejado | Parte D do plano F0 |
| F3 — proatividade + dados | planejado | Parte D do plano F0 |
| F4 — canais extras + npx gasclaw | planejado | Parte D do plano F0 |
```

- [ ] **Step 4: Commit**

```bash
git add docs/adr conductor/tracks.md docs/wiki/log.md
git commit -m "docs: ADR-009 (ajustes F0) e tracks F0–F4"
```

---

## Parte D — Próximas fases (cada uma ganha seu próprio plano detalhado antes de começar)

### F1 — Agente-pasta completo
1. **Sessões no Drive:** `.gasclaw/sessions/<spaceId>.jsonl` substitui o Cache; compactação ao passar de N caracteres com turno silencioso de "flush de memória".
2. **Memória:** tool `remember` → `memory/YYYY-MM-DD.md`; hoje+ontem no prompt; `MEMORY.md` só na DM do dono.
3. **Ritual `BOOTSTRAP.md`:** criado no seed; o agente segue após atender o pedido; apagado quando IDENTITY/SOUL mudarem.
4. **Skills:** índice `<available_skills>` (nome+descrição) + tool `read_skill`.
5. **Vários agentes:** vincular espaço do Chat → agente na tela; DM usa o ⭐.
6. **Grupos em `users`:** checar via `GroupsApp.getGroupByEmail(g).hasUser(email)`.
7. **Deploy seguro:** detecção de divergência (conteúdo remoto × `dist/`), poda de versões (manter 5), health + rollback automático no CI (autenticação do health no CI a definir por POC).
8. **Doctor na tela:** pasta legível, arquivos, chamada real, Chat configurado.

### F2 — Execução durável + aprovação
1. **POC P2:** mensagem assíncrona com card como app via IAM `generateAccessToken` (sem chave).
2. **POC P3:** pump (1 min) → `doPost(action=step)` sem consumir runtime de trigger.
3. **POC P4:** run atravessando ≥ 3 execuções.
4. **POC P5:** GASADK via seam OpenRouter + checkpoint por step (ADR-004).
5. Checkpoint `.gasclaw/runs/<id>.json`, lease, fila, estados, idempotência, limites (`steps`, `usd_per_run`).
6. Tools da whitelist (Gmail, Drive, Sheets, Docs, Calendar, http com `http_allow`) com `approval` e cards Aprovar/Negar.
7. Retry com backoff para 429/5xx no `llm.ts`.

### F3 — Proatividade + dados
1. `HEARTBEAT.md` (30 min, horário ativo, `NO_REPLY`).
2. `jobs.md` (cron) avaliado por trigger horário; tool `schedule`.
3. Inbox Excel: varredura a cada 10 min, `Drive.Files.copy` para Sheets, originais em `inbox/processed/` (**POC P6**); `data/xlsx/` do repo enviado no deploy.
4. Templates dos agentes `executive-assistant` e `sheets-analyst`.

### F4 — Canais extras
1. Gmail (label `gasclaw` → run; resposta na thread; aprovação por link assinado).
2. HTTP `doPost` com token; MCP/A2A via GASADK se P5 aprovou.
3. `npx gasclaw` publicável (`create-gasclaw`).

---

## Parte E — Checklist final da F0

- [ ] `npm run build && npm test` verdes.
- [ ] `./gasclaw up` completo em dev; segunda execução sem pausas.
- [ ] Tela: chave salva, agente adicionado com seed, teste respondendo.
- [ ] Editar `SOUL.md` muda a resposta sem deploy.
- [ ] Google Chat responde e lembra o contexto.
- [ ] `down`/`up`, `status`, `doctor`, `rollback` funcionando.
- [ ] POC P1 medida e ADR-010 escrito.
- [ ] Repo privado + CI verde publicando dev e prod na mesma URL.
- [ ] ADR-009 e tracks registrados; `docs/wiki/log.md` com os resultados.

## Riscos conhecidos e o que fazer

| Risco | Sinal | Ação |
|---|---|---|
| Criação de projeto GCP bloqueada pela organização | erro de permissão no `gcloud projects create` | papel Project Creator; rodar `up` de novo |
| Chat não aciona o script com web app `MYSELF` | Chat mostra "não está respondendo" e não há execução no log | trocar para `DOMAIN` (Task 9, Step 6) |
| Resposta do Chat > 30 s | "não está respondendo" com execução longa no log | modelo mais rápido; assíncrono na F2 |
| Flags do clasp diferentes | erro "unknown option" | Task 8, Step 4 |
| Allowlist de URL Fetch no Admin | erro de URL bloqueada | liberar `openrouter.ai` |
| Token do CI expira | `invalid_grant` no Actions | Task 10, Step 5 |
| Conta do dono suspensa | tudo para | migrar para conta dedicada (runbook futuro) |
