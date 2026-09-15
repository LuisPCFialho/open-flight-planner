import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
