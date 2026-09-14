# Runbook — atualizar o devmode

O hub `docs/` (ADR-007) move `wiki/` e `raw/` para dentro de `docs/`. Os instaladores do
devmode escrevem na raiz, então após qualquer update refaça a troca de caminhos.

```bash
cd ~/Projects/devmode && git pull
```
```bash
cd ~/Projects/devmode && integrations/conductor-beads/update.sh ~/Projects/gasclaw
```
```bash
cd ~/Projects/devmode && integrations/llm-wiki/update.sh ~/Projects/gasclaw
```
```bash
cd ~/Projects/gasclaw && test -f README.md && git diff --quiet README.md 2>/dev/null; sed -i '' -E 's#(^|[^/a-z_.])(wiki|raw)/#\1docs/\2/#g' KARPATHY.md && grep -c 'docs/wiki/' KARPATHY.md
```

Confira: `git status` não deve mostrar `wiki/` ou `raw/` na raiz; se o update recriou
`README.md` com o how-to do wiki, restaure o README do projeto com `git checkout README.md`.
