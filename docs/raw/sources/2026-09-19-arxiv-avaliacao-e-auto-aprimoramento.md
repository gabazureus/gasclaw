# Colheita arXiv — avaliação estatística e auto-aprimoramento de LLMs

> **Material bruto.** Colhido da API oficial do arXiv (`export.arxiv.org/api/query`) em 2026-09-19,
> durante a pesquisa sobre o sinal fraco do ciclo de sonho do gasclaw. Resumos reproduzidos em trecho,
> para citação. Ninguém edita este arquivo.
>
> Contexto da colheita: o SearXNG local (`llmwiki-searxng`, porta 8585) foi iniciado, mas seus motores
> estavam bloqueados (duckduckgo CAPTCHA, brave "too many requests", startpage CAPTCHA, arxiv HTTP error).
> A colheita foi feita direto na API do arXiv, que é a fonte primária.

## Estatística de avaliação

**arXiv:2411.00640 — Adding Error Bars to Evals: A Statistical Approach to Language Model Evaluations**
(2024-11-01). "Evaluations are critical for understanding the capabilities of large language models.
Fundamentally, evaluations are experiments; but the literature on evaluations has largely ignored the
literature from other sciences on experiment analysis and planning. (...) we present formulas for
analyzing evaluation data, measuring differences between two models, and planning an evaluation
experiment."

**arXiv:2607.04429 — evalci: A Python Library for Statistically Rigorous Comparison of Language Model
Evaluations** (2026-07-05). "The dominant practice in language model evaluation is to report a single
accuracy number per model and declare the higher one better, without testing whether the gap could
plausibly be sampling noise. On benchmarks of a few thousand items, and under temperature sampling where
a model can differ from itself run to run by more than the reported gap between models, this practice
routinely overstates confidence in headline claims. (...) we re-analyze a public comparison of nine
language models' MMLU accuracy and find that 3 of the 8 adjacent leaderboard-rank gaps are not
statistically significant after correcting for the 36 pairwise comparisons the ranking implies."

**arXiv:2402.14992 — tinyBenchmarks: evaluating LLMs with fewer examples** (2024-02-22). "to accurately
estimate the performance of an LLM on MMLU, a popular multiple-choice QA benchmark consisting of 14K
examples, it is sufficient to evaluate this LLM on 100 curated examples."

**arXiv:2605.28533 — Semi-Supervised Hypothesis Testing by Betting on Predictions** (2026-05-27).
Arcabouço de teste sequencial por apostas ("testing-by-betting"), que acumula evidência ao longo de
observações em vez de decidir num único lote.

## Limites da auto-correção e da auto-recompensa

**arXiv:2310.01798 — Large Language Models Cannot Self-Correct Reasoning Yet** (2023-10-03). "our
research indicates that LLMs struggle to self-correct their responses without external feedback, and at
times, their performance even degrades after self-correction."

**arXiv:2401.10020 — Self-Rewarding Language Models** (2024-01-18). Laço em que o próprio modelo gera
respostas e as avalia como juiz, melhorando por DPO iterativo.

**arXiv:2410.12735 — CREAM: Consistency Regularized Self-Rewarding Language Models** (2024-10-16).
"These methods commonly utilize the same LLM to act as both the policy model (which generates responses)
and the reward model (which scores)" — e o artigo trata do problema que isso cria.

**arXiv:2411.00750 — Mitigating Tail Narrowing in LLM Self-Improvement via Socratic-Guided Sampling**
(2024-11-01). "This process proves effective and reduces the reliance on human supervision (...) but the
performance soon plateaus."

**arXiv:2507.00075 — Theoretical Modeling of LLM Self-Improvement Training Dynamics Through
Solver-Verifier Gap** (2025-06-29). Modelagem teórica de como o desempenho evolui ao longo do
auto-aprimoramento.

**arXiv:2603.25681 — Self-Improvement of Large Language Models: A Technical Overview and Future Outlook**
(2026-03-26). "As models approach human-level capabilities in certain domains, human feedback may no
longer provide sufficiently informative signals for further improvement."

## Viés do juiz

**arXiv:2410.21819 — Self-Preference Bias in LLM-as-a-Judge** (2024-10-29). "the self-preference bias in
LLMs has posed significant risks, including promoting specific styles or policies intrinsic to the LLM."

**arXiv:2604.06996 — Self-Preference Bias in Rubric-Based Evaluation of Large Language Models**
(2026-04-08). "judges are known to exhibit self-preference bias: they tend to favor outputs produced by
themselves or by models from their own family. This skews evaluations and, thus, hinders model
development, especially in settings of recursive self-improvement."

**arXiv:2604.22891 — Quantifying and Mitigating Self-Preference Bias of LLM Judges** (2026-04-24).

**arXiv:2608.18091 — Self- and Other-Labels Induce Bidirectional Bias in LLM Judges** (2026-06-06).

## Evolução de artefatos com verificador

**arXiv:2309.16797 — Promptbreeder: Self-Referential Self-Improvement Via Prompt Evolution**
(2023-09-28). Mecanismo auto-referencial de evolução de prompts.

**arXiv:2310.02304 — Self-Taught Optimizer (STOP): Recursively Self-Improving Code Generation**
(2023-10-03). "we use a language-model-infused scaffolding program to improve itself."

**FunSearch** (Romera-Paredes et al., *Nature*, 2023) — citado em **arXiv:2601.16849**, que refina saídas
do FunSearch para obter limites inferiores no estado da arte para heurísticas.

## Degradação por recursão

**arXiv:2412.17646 — Rate of Model Collapse in Recursive Training** (2024-12-23). "As models are
recursively trained on generated data from previous rounds" a qualidade se degrada.

**arXiv:2410.12954 — A Note on Shumailov et al. (2024)** (2024-10-16). Revisita o resultado original de
colapso de modelo.

## Dream-RSI (o repositório que originou a ideia)

**github.com/zhengkid/Dream-RSI** — verificado pela API do GitHub em 2026-09-19: a árvore tem **21
arquivos**, todos `README.md`, `CITATION.cff`, `.gitignore`, `assets/*` e `papers/Dream-RSI.pdf`.
**Zero linha de código.** O README declara "Code is being prepared for release". Autores de
Google/Google DeepMind/UMD/UVA. O mecanismo descrito usa o histórico de descobertas como simulador de
repetição ("replay simulator over the realized search space") para avaliar políticas candidatas sem
refazer a busca, otimizando a política de meta-exploração e deixando o agente de código inalterado.
