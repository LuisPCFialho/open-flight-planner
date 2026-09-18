import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Antes de qualquer mapa existir. Ver a nota no proprio ficheiro.
import './mapa/worker-maplibre.ts'
import { Raiz } from './Raiz.tsx'
import { Rede } from './ui/Rede.tsx'
import './estilos/global.css'

const raiz = document.getElementById('raiz')
if (!raiz) throw new Error('elemento #raiz em falta no index.html')

/*
 * A rede vai por fora do `StrictMode` e nao por dentro.
 *
 * Por dentro, uma excepcao durante a montagem dupla do modo estrito podia
 * apanha-la duas vezes; por fora, ela ve a arvore inteira - incluindo o que
 * rebente no proprio `Raiz`, que e onde a sessao e lida.
 */
createRoot(raiz).render(
  <Rede>
    <StrictMode>
      <Raiz />
    </StrictMode>
  </Rede>,
)
