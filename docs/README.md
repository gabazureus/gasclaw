# gasclaw — documentação

Comece por aqui. Tudo que existe no projeto está indexado nesta página.

| Preciso de… | Vá para |
|---|---|
| Entender o que é e como funciona | [specs/2026-09-14-gasclaw-design.md](specs/2026-09-14-gasclaw-design.md) |
| Retomar numa nova conversa | [plans/2026-09-14-handoff.md](plans/2026-09-14-handoff.md) |
| Implementar (passo a passo, com código) | [plans/2026-09-14-gasclaw-f0-plano-implementacao.md](plans/2026-09-14-gasclaw-f0-plano-implementacao.md) |
| Saber por que decidimos algo | [adr/](adr/README.md) |
| Fazer o setup inicial (uma vez) | [runbooks/setup-inicial.md](runbooks/setup-inicial.md) |
| Atualizar o devmode sem quebrar o hub | [runbooks/devmode-update.md](runbooks/devmode-update.md) |
| Ver fases e andamento | [../conductor/tracks.md](../conductor/tracks.md) |
| Produto e stack | [../conductor/product.md](../conductor/product.md) · [../conductor/tech-stack.md](../conductor/tech-stack.md) |
| Vocabulário e mapa de módulos | [../UBIQUITOUS_LANGUAGE.md](../UBIQUITOUS_LANGUAGE.md) |
| Base de conhecimento (pesquisa, conceitos) | [wiki/index.md](wiki/index.md) · fontes brutas em [raw/sources/](raw/sources/) |
| Como usar o wiki | [wiki-howto.md](wiki-howto.md) · schema em [../KARPATHY.md](../KARPATHY.md) |

## Estrutura

```
docs/
├── README.md        este índice
├── specs/           design aprovado (1 arquivo por tema)
├── plans/           planos de implementação passo a passo
├── adr/             decisões numeradas (nunca editar aceitas; substituir)
├── runbooks/        procedimentos operacionais
├── wiki/            conhecimento curado pelo LLM (KARPATHY.md)
├── raw/             fontes brutas imutáveis (pesquisas, artigos)
└── wiki-howto.md    guia do wiki
```
