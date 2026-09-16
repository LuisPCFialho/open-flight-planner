import { setWorkerUrl } from 'maplibre-gl'
import urlDoWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

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
 * O sufixo `?url` faz o Vite tratar o ficheiro como recurso e devolver um
 * caminho que serve tanto em desenvolvimento como na versao construida.
 */
setWorkerUrl(urlDoWorker)
