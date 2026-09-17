import { defineConfig, devices } from '@playwright/test'

/**
 * Testes de ponta a ponta.
 *
 * Existem por uma razao so: os 735 testes de unidade verificam pecas, e nenhum
 * deles verifica o unico percurso que interessa mesmo - importar o limite da
 * parcela, gerar a cobertura, exportar o ficheiro que vai para o aparelho.
 * Cada peca desse percurso esta coberta; a ligacao entre elas nao estava.
 *
 * Correm contra a **versao construida** e nao contra o servidor de
 * desenvolvimento, de proposito. Os dois defeitos mais caros deste projecto - o
 * mapa em branco e o worker morto - so apareciam construidos.
 */

/** Porta propria, para nao chocar com o que estiver a correr a mao. */
const PORTA = 4173

export default defineConfig({
  testDir: 'e2e',
  /* Um percurso que falha a meio raramente falha por acaso: vale mais ver logo. */
  fullyParallel: false,
  workers: 1,
  /*
   * O mapa depende de mosaicos que vem da rede, e a rede as vezes demora. Os
   * tempos sao generosos de proposito: um teste que falha por impaciencia
   * ensina a ignorar falhas, que e pior do que nao ter teste nenhum.
   */
  timeout: 120_000,
  expect: { timeout: 30_000 },
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: `http://localhost:${PORTA}`,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: `npm run build && npx vite preview --port ${PORTA} --strictPort`,
    url: `http://localhost:${PORTA}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
})
