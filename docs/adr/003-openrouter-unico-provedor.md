# ADR-003 — OpenRouter como único provedor de LLM

- **Status:** Aceito · 2026-09-14

## Contexto
Planejados inicialmente Gemini, Anthropic, OpenAI e OpenRouter. O usuário decidiu usar só
OpenRouter por enquanto. OpenRouter expõe API compatível com OpenAI e acessa modelos de todos
esses fornecedores.

## Decisão
`llm.ts` implementa um único adaptador no formato OpenAI Chat Completions apontando para
OpenRouter. Sem interface de provedor abstrata (uma implementação só — minimal code).
Chave `OPENROUTER_API_KEY` em Script Properties.

## Consequências
- Troca de modelo = trocar `model` no frontmatter do agente.
- Sem Vertex AI → não precisa de billing no GCP.
- Se outro provedor direto for necessário, extrair a interface nesse momento (novo ADR).
