import { setWorkerUrl } from 'maplibre-gl'
import urlDoWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

/**
 * Diz ao MapLibre onde esta o seu worker.
 *
 * Sem isto nao ha relevo nenhum, e ninguem diz porque.
 *
 * O MapLibre 6 resolve o worker com `new URL('./maplibre-gl-worker.mjs',
 * import.meta.url)`. O Vite pre-empacota a biblioteca para
 * `node_modules/.vite/deps/maplibre-gl.js`, e a partir dai esse caminho aponta
 * para `.vite/deps/maplibre-gl-worker.mjs`, que nao existe: da 404. Um
 * `new Worker(...)` sobre um 404 nao atira excepcao nenhuma - o worker morre ao
 * carregar e todos os pedidos que lhe sao feitos ficam eternamente por
 * responder, sem erro e sem aviso.
 *
 * O que passa pelo worker e mais do que parece: a descodificacao dos mosaicos de
 * elevacao, e portanto o relevo do terreno todo, e ainda o processamento das
 * fontes GeoJSON, ou seja a linha da rota, o poligono do enquadramento e os
 * contornos das areas. Tudo isso esteve morto ao mesmo tempo. O que continuava a
 * funcionar era a ortofoto, que e raster e nao passa pelo worker, e a camada
 * WebGL propria da rota, que corre no fio principal: dava um mapa com aspecto
 * de estar bom, inclinado e com a rota desenhada, mas com o solo perfeitamente
 * plano numa zona de montanha.
 *
 * O sufixo e `?worker&url`, e nao `?url`.
 *
 * O `?url` copia o ficheiro e devolve o caminho, mas nao segue o que ele
 * importa. O worker do MapLibre importa `./maplibre-gl-shared.mjs`, que nunca
 * chegava ao `dist`: o servidor respondia a esse pedido com o `index.html` e o
 * worker morria ao carregar, com a mesma falta de sinal descrita acima. Em
 * desenvolvimento nao acontecia, porque o Vite serve o ficheiro do
 * `node_modules` com os vizinhos todos ao lado.
 *
 * O `?worker&url` empacota o worker com as dependencias e devolve o caminho do
 * pacote. Precisa de `worker: { format: 'es' }` no `vite.config.ts`, porque o
 * worker do MapLibre e um modulo.
 *
 * `ferramentas/verificar-dist.ts` corre no fim da construcao e trava-a se
 * alguma importacao do `dist` voltar a ficar por resolver.
 */
setWorkerUrl(urlDoWorker)
