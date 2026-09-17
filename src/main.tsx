import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Antes de qualquer mapa existir. Ver a nota no proprio ficheiro.
import './mapa/worker-maplibre.ts'
import { Raiz } from './Raiz.tsx'
import './estilos/global.css'

const raiz = document.getElementById('raiz')
if (!raiz) throw new Error('elemento #raiz em falta no index.html')

createRoot(raiz).render(
  <StrictMode>
    <Raiz />
  </StrictMode>,
)
