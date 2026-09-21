import { defineConfig } from 'vitest/config';

// `testTimeout` de 30 s deixava a suíte VERMELHA AO ACASO sob carga. Medido em 2026-09-21, na mesma
// árvore e sem mudança de código entre as rodadas: 0, 17 e 3 falhas, em testes diferentes a cada
// vez, todas por tempo — com `load average` entre 30 e 60 pela indexação do Spotlight.
//
// 120 s REDUZ o problema, não o elimina, e é preciso dizer isso: uma rodada já com 120 s ainda teve
// 10 timeouts num pico de carga. A rodada limpa de referência passou 1915/1915 com load 87. A causa é
// a máquina ocupada, não o código — provado por A/B com o commit anterior, mesmo build, em sequência.
//
// Vermelho ao acaso é o gêmeo do falso verde: ensina a ignorar vermelho. Quando a suíte falhar só por
// tempo, a regra é rodar os arquivos ISOLADOS antes de concluir qualquer coisa.
export default defineConfig({ test: { include: ['test/**/*.test.ts'], environment: 'node', testTimeout: 120_000, hookTimeout: 120_000 } });
