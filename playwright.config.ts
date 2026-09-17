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

/**
 * Endereco a ensaiar.
 *
 * Sem `E2E_URL`, constroi-se e serve-se localmente. Com ele, os ensaios correm
 * contra o que estiver publicado - e o que permite verificar um deploy do
 * Vercel sem ter de confiar que ele saiu igual ao que saiu aqui.
 */
const PUBLICADO = process.env['E2E_URL']

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
    baseURL: PUBLICADO ?? `http://localhost:${PORTA}`,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Contra um endereco publicado nao ha nada que levantar aqui.
  ...(PUBLICADO
    ? {}
    : {
        webServer: {
          command: `npm run build && npx vite preview --port ${PORTA} --strictPort`,
          url: `http://localhost:${PORTA}`,
          reuseExistingServer: !process.env['CI'],
          timeout: 180_000,
        },
      }),
})
