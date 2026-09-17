import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  /*
   * O MapLibre num pedaco so dele.
   *
   * Sao oitocentos kilobytes que nao mudam de uma versao da aplicacao para a
   * outra. No mesmo ficheiro que o nosso codigo, cada correccao nossa obrigava
   * quem estiver em obra a descarregar tudo outra vez; a parte - e com o nome
   * marcado pelo conteudo - o browser guarda-o e so volta a busca-lo quando a
   * biblioteca mesmo mudar.
   */
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes('node_modules/maplibre-gl') ? 'maplibre' : undefined,
      },
    },
  },
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
     * A cobertura mede-se, e nunca se tinha medido.
     *
     * Nao ha limiar a travar nada, de proposito: um numero redondo imposto de
     * um dia para o outro so leva a testes escritos para o subir. O que o
     * relatorio serve e para dizer onde estao os buracos - e o primeiro que deu
     * disse-o bem: 55% de linhas, com o nucleo coberto e a interface quase toda
     * por tocar.
     *
     * O `main.tsx` fica de fora porque e so a montagem, e as pastas de teste
     * porque medir o que mede nao quer dizer nada.
     */
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.*', 'src/teste/**', 'src/main.tsx'],
      reporter: ['text-summary', 'html'],
      reportsDirectory: 'coverage',
    },
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
