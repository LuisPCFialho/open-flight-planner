import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  server: { port: 5173 },
  /*
   * A mesma porta do servidor de desenvolvimento, de proposito.
   *
   * Os projetos e as rotas vivem na IndexedDB, que e por origem. Servir a versao
   * construida noutra porta abria a aplicacao vazia, com o trabalho todo
   * aparentemente desaparecido. `strictPort` faz falhar em vez de saltar para a
   * porta seguinte, que daria o mesmo resultado em silencio.
   */
  preview: { port: 5173, strictPort: true },
  test: {
    /*
     * Dois conjuntos, porque sao duas coisas diferentes.
     *
     * O nucleo e geometria, ficheiros e contas: corre em node, depressa e sem
     * DOM nenhum. Os componentes precisam de um documento para serem montados, e
     * o jsdom custa quase um segundo a levantar - nao vale a pena pagar isso nos
     * quatrocentos testes que nao lhe tocam.
     */
    projects: [
      {
        extends: true,
        test: {
          name: 'nucleo',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'componentes',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['src/teste/preparar.ts'],
        },
      },
    ],
  },
})
