# gasclaw 🦀

Agentes de IA rodando **100% dentro do Google Apps Script** — sem servidor, sem hospedagem.
Um agente é **uma pasta no Google Drive**; você conversa com ele pelo **Google Chat**.

> Status: design aprovado (F0 em andamento). Nada executável ainda.

## Uso

```bash
./gasclaw up
```

Na primeira vez guia o setup inicial; depois disso tudo roda sozinho. Outros comandos:
`down` · `restart` · `ship` · `logs` · `status` · `doctor` · `rollback`.

## Documentação

Tudo em [docs/README.md](docs/README.md) — design, decisões (ADRs), runbooks e wiki.

## Inspirações

[vercel/eve](https://github.com/vercel/eve) (Apache-2.0) · [openclaw/openclaw](https://github.com/openclaw/openclaw) (MIT) ·
[tanaikech/adk-gas](https://github.com/tanaikech/adk-gas) (MIT) · [google/clasp](https://github.com/google/clasp) (Apache-2.0).
Construído com [devmode](https://github.com/fluencer-ai/devmode).
