import { test, expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

/**
 * O percurso que interessa mesmo: importar o limite da parcela, gerar a
 * cobertura, exportar o ficheiro que vai para o aparelho.
 *
 * Cada peca disto tem testes de unidade. A ligacao entre elas nao tinha: era
 * possivel partir a cobertura e os testes da cobertura continuarem verdes,
 * porque nenhum deles passava pelo painel, pelo estado da aplicacao e pelo
 * exportador de seguida.
 *
 * Corre contra a versao construida. Os dois defeitos mais caros deste projecto
 * - o mapa em branco e o worker do MapLibre morto - so apareciam construidos.
 */

const PARCELA = fileURLToPath(new URL('./fixtures/parcela.kml', import.meta.url))
const ZONA = fileURLToPath(new URL('./fixtures/zona-interdita.kml', import.meta.url))

/**
 * Salta os ensaios quando o sitio pede entrada.
 *
 * Estes ensaios correm uma vez por semana contra o sitio publicado. No dia em
 * que as contas forem ligadas - as variaveis `VITE_FIREBASE_*` postas no Vercel -
 * o que esta em `/` deixa de ser a lista de projetos e passa a ser o ecra de
 * entrada, e todos eles passariam a falhar com um tempo esgotado a procura de um
 * botao que nao esta la.
 *
 * Um tempo esgotado nao diz nada a quem o le na segunda-feira de manha. Isto diz.
 *
 * Saltar e nao falhar: um trabalho agendado que fica vermelho todas as semanas
 * por uma razao conhecida e um trabalho que se aprende a ignorar - e a seguir
 * ignora-se tambem a semana em que ficou vermelho a serio. O que falta nesse dia
 * e ensinar estes ensaios a entrar, e ate la e melhor dizer-se que nao correram
 * do que fingir que correram.
 *
 * ## Esperar pelo ecra, e nao perguntar se ja la esta
 *
 * A primeira versao disto fazia `count()` no ecra de entrada, e `count()` nao
 * espera: numa carga fria do sitio publicado devolve zero antes de o React
 * pintar. O salto nao disparava, o ensaio ficava dois minutos a procura de um
 * botao que nunca vinha, e com as duas repeticoes do CI eram seis minutos por
 * ensaio. Na primeira corrida a serio deu tres saltados e tres intermitentes -
 * uma corrida pura - e o trabalho ficou verde sem ter verificado nada.
 *
 * Agora espera-se que a aplicacao decida qual dos dois ecras mostra, e so
 * depois se pergunta qual deles e.
 */
async function saltarSePedeEntrada(page: Page): Promise<void> {
  const entrada = page.locator('.ecra-entrada')
  const projetos = page.locator('.ecra-projetos')

  await expect(entrada.or(projetos)).toBeVisible({ timeout: 30_000 })
  if (!(await entrada.isVisible())) return

  /*
   * Saltar so faz sentido contra um sitio la fora, que e o que `E2E_URL` marca.
   *
   * Localmente, um ecra de entrada quer dizer outra coisa: que ha um
   * `.env.local` com contas configuradas e a versao construida apanhou-o. Isso
   * nao e uma limitacao conhecida a tolerar todas as semanas - e a bancada mal
   * montada, e o que faz falta e dize-lo em vez de deixar a serie inteira
   * passar por cima sem verificar nada.
   */
  if (!process.env['E2E_URL']) {
    throw new Error(
      'A versao construida arranca em modo de conta e pede entrada, por isso estes ' +
        'ensaios nao tem por onde comecar. Tens um .env.local com as variaveis ' +
        'VITE_FIREBASE_*: parqueia-o (mv .env.local .env.local.parado) e corre outra vez.',
    )
  }

  test.skip(
    true,
    'O sitio publicado tem contas ligadas e mostra o ecra de entrada. Estes ensaios ' +
      'ainda nao sabem entrar - ver docs/contas.md.',
  )
}

/** Entra num projeto novo e espera que o mapa instale as camadas. */
async function abrirProjetoNovo(page: Page): Promise<void> {
  await page.goto('/')
  await saltarSePedeEntrada(page)

  await page.getByRole('button', { name: 'Novo projeto' }).click()
  await page.getByRole('button', { name: /Projeto sem nome/ }).first().click()

  /*
   * `data-pronto` e a unica maneira, de fora, de distinguir "o mapa nao tem
   * camadas nossas" de "tem-nas e estao vazias". Essa distincao ja custou uma
   * manha a este projecto.
   */
  await expect(page.locator('.mapa[data-pronto="sim"]')).toBeVisible()
}

test.describe('do limite da parcela ao ficheiro que voa', () => {
  test('importar area, cobrir e exportar', async ({ page }) => {
    const errosDeConsola: string[] = []
    page.on('console', (mensagem) => {
      if (mensagem.type() === 'error') errosDeConsola.push(mensagem.text())
    })

    await abrirProjetoNovo(page)

    // --- importar o limite --------------------------------------------------
    await page.locator('input[type="file"][data-tipo="referencia"]').setInputFiles(PARCELA)

    // O resumo da importacao diz quantas areas vieram e quanto medem.
    await expect(page.getByText(/parcela\.kml: 1 área\(s\)/)).toBeVisible()

    // --- gerar a cobertura --------------------------------------------------
    await page.getByRole('button', { name: 'Cobrir', exact: true }).click()

    const painel = page.getByRole('dialog', { name: 'Cobrir área com passagens' })
    await expect(painel).toBeVisible()

    // Uma foto por waypoint entra ligada: desligada, o ficheiro sai sem accao
    // de foto nenhuma e a rota voa sem trazer nada.
    await expect(painel.getByLabel('Um waypoint por foto')).toBeChecked()

    const gerar = painel.getByRole('button', { name: /waypoints/ })
    await expect(gerar).toBeEnabled()
    await gerar.click()

    // --- a rota ficou feita -------------------------------------------------
    await expect(painel).toBeHidden()

    await expect(page.locator('.estatisticas')).toContainText(/\d+/)

    const waypoints = await page.locator('.marcador-waypoint').count()
    expect(waypoints).toBeGreaterThan(10)

    // --- exportar -----------------------------------------------------------
    const descarga = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportar', exact: true }).click()

    const ficheiro = await descarga
    expect(ficheiro.suggestedFilename()).toMatch(/\.kmz$/)

    /*
     * Nenhum erro de consola em todo o percurso.
     *
     * E a verificacao que apanha a classe de defeito que nao da excepcao: o
     * worker que morre a carregar, o ficheiro em falta servido como HTML, a
     * camada que nao instala. Nenhum desses parte o ecra - so deixam de fazer
     * o trabalho.
     */
    expect(errosDeConsola).toEqual([])
  })

  test('o mapa levanta-se com as camadas todas, e sem ficheiros em falta', async ({ page }) => {
    /*
     * O defeito do mapa em branco: a ortofoto aparecia e mais nada - sem rota,
     * sem areas, sem marcadores - e sem erro nenhum. Em desenvolvimento nunca
     * acontecia.
     */
    const pedidosFalhados: string[] = []
    page.on('response', (resposta) => {
      if (resposta.status() < 400) return
      // So os nossos: os mosaicos vem de fora e falham por razoes que nao sao nossas.
      if (new URL(resposta.url()).origin === new URL(page.url()).origin) {
        pedidosFalhados.push(`${resposta.status()} ${resposta.url()}`)
      }
    })

    await abrirProjetoNovo(page)

    /*
     * Um ficheiro nosso em falta nao da erro visivel: vem servido como
     * `index.html`, o browser recusa-o por tipo MIME, e o que morre em silencio
     * e o worker do MapLibre - com o mapa a parecer bom e o terreno plano.
     */
    expect(pedidosFalhados).toEqual([])
  })

  test('um ponto de interesse, uma orbita a volta dele, e o ficheiro sai', async ({ page }) => {
    /*
     * A orbita tem os seus testes de unidade, e a ligacao entre eles nao tinha
     * nenhum: criar o POI no mapa, ler o painel, gerar, e exportar de seguida
     * passa por quatro modulos que os testes de unidade nunca veem juntos.
     */
    const errosDeConsola: string[] = []
    page.on('console', (mensagem) => {
      if (mensagem.type() === 'error') errosDeConsola.push(mensagem.text())
    })

    await abrirProjetoNovo(page)

    // Sem POI nenhum o botao nem existe: e o que faz a orbita ter sentido.
    await expect(page.getByRole('button', { name: 'Orbitar', exact: true })).toBeHidden()

    // --- pousar um ponto de interesse no meio do mapa -----------------------
    await page.getByRole('button', { name: 'POI', exact: true }).click()
    await page.locator('.maplibregl-canvas').click({ position: { x: 300, y: 200 } })

    const orbitar = page.getByRole('button', { name: 'Orbitar', exact: true })
    await expect(orbitar).toBeVisible()
    await orbitar.click()

    // --- o painel diz o que vai fazer antes de o fazer ----------------------
    const painel = page.getByRole('dialog', { name: 'Orbitar um ponto' })
    await expect(painel).toBeVisible()

    /*
     * Com os valores de partida - 40 m de raio e 20 acima - a camara aponta a
     * -26,6 graus. Nao ha campo para este numero, de proposito: e a conta
     * `-atan(20/40)` e nao ha nada a decidir nela. Se algum dia aparecer aqui um
     * campo, este ensaio diz porque nao devia.
     */
    await expect(painel).toContainText('-26.6')
    await expect(painel).toContainText('12')

    await painel.getByRole('button', { name: 'Acrescentar à rota' }).click()
    await expect(painel).toBeHidden()

    // --- doze waypoints, e um ficheiro no fim -------------------------------
    expect(await page.locator('.marcador-waypoint').count()).toBe(12)

    const descarga = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportar', exact: true }).click()
    expect((await descarga).suggestedFilename()).toMatch(/\.kmz$/)

    expect(errosDeConsola).toEqual([])
  })

  test('a aeronave arranca e trava em vez de ligar e desligar', async ({ page }) => {
    /*
     * A inercia esta coberta por testes de unidade, mas nenhum deles ve o ciclo
     * de animacao. E la que ela se parte de maneiras que a funcao pura nao
     * conhece: o ciclo tinha uma paragem antecipada para quando nao ha teclas
     * premidas, e com inercia isso deixava a aeronave a deslizar para sempre com
     * a ultima velocidade congelada. O `requestAnimationFrame` nem sequer corre
     * com a janela por tras de outra, e por isso isto so se verifica aqui.
     */
    await abrirProjetoNovo(page)

    await page.getByRole('button', { name: 'Voo virtual', exact: true }).click()
    const hud = page.locator('.hud-voo')
    await expect(hud).toBeVisible()

    /** A latitude que o HUD mostra naquele instante. */
    const latitude = async (): Promise<number> => {
      const texto = (await hud.innerText()).match(/LATITUDE\s*\n\s*(-?[\d.]+)/)
      if (!texto?.[1]) throw new Error('o HUD nao mostra a latitude')
      return Number(texto[1])
    }

    const partida = await latitude()

    // Um segundo de W, a apontar a norte: a latitude tem de subir.
    await page.keyboard.down('w')
    await page.waitForTimeout(1000)
    await page.keyboard.up('w')

    const aoLargar = await latitude()
    expect(aoLargar).toBeGreaterThan(partida)

    /*
     * O que interessa: largar o comando nao para a aeronave a seco. Trezentos
     * milesimos depois ela ainda andou, porque esta a travar.
     */
    await page.waitForTimeout(300)
    const aTravar = await latitude()
    expect(aTravar).toBeGreaterThan(aoLargar)

    /*
      * E acaba mesmo por parar, em vez de deslizar para sempre.
      *
      * A espera e por sondagem e nao por um tempo fixo, de proposito: o ciclo
      * limita o passo a um decimo de segundo, portanto com a maquina ocupada o
      * tempo simulado anda mais devagar do que o relogio. Um `waitForTimeout`
      * de tres segundos passava sozinho e falhava no meio da serie completa,
      * que foi exactamente o que aconteceu a primeira vez que isto correu.
      */
    let anterior = await latitude()
    await expect
      .poll(
        async () => {
          const agora = await latitude()
          const parou = Math.abs(agora - anterior) < 1e-7
          anterior = agora
          return parou
        },
        { timeout: 20000, intervals: [250] },
      )
      .toBe(true)
  })

  test('filtrar, apanhar os que faltam, e trata-los todos de uma vez', async ({ page }) => {
    /*
     * O percurso que o planeamento a serio faz: gerar a cobertura sem accao de
     * foto, descobrir quais e que ficaram sem ela, apanha-los todos e dar-lhes
     * a foto de uma vez. Editar em lote ja existia; o que nao havia era maneira
     * de chegar a duzias de pontos sem lhes bater um a um com o ctrl premido.
     */
    await abrirProjetoNovo(page)
    await page.locator('input[type="file"][data-tipo="referencia"]').setInputFiles(PARCELA)
    await expect(page.getByText(/parcela\.kml: 1 área\(s\)/)).toBeVisible()

    await page.getByRole('button', { name: 'Cobrir', exact: true }).click()
    const cobrir = page.getByRole('dialog', { name: 'Cobrir área com passagens' })

    // Sem accao de foto: e assim que se cria o problema que este percurso resolve.
    await cobrir.getByLabel('Um waypoint por foto').uncheck()

    /*
     * Mais baixo do que a altura de partida, para haver pontos que cheguem.
     *
     * O filtro so aparece acima de vinte waypoints - abaixo disso e ruido - e a
     * esta parcela, a oitenta metros, saem doze. Trinta da passagens que chegam
     * para o filtro fazer sentido, que e a situacao que este percurso encena.
     */
    await cobrir.getByLabel('Altura acima do solo').fill('30')
    await cobrir.getByLabel('Altura acima do solo').blur()

    await cobrir.getByRole('button', { name: /waypoints/ }).click()
    await expect(cobrir).toBeHidden()

    await expect
      .poll(async () => page.locator('.linha-waypoint').count())
      .toBeGreaterThan(20)

    /*
      * Sem distinguir maiusculas, de proposito.
      *
      * O `innerText` devolve o texto **renderizado**, e a folha de estilo poe
      * este rotulo em maiusculas - enquanto o `toContainText` le o texto do DOM
      * e ve "Fotos". Os dois veem coisas diferentes do mesmo elemento, e foi
      * isso que fez este ensaio falhar da primeira vez.
      */
    const estatisticas = page.locator('.estatisticas')
    const fotos = async (): Promise<number> =>
      Number((await estatisticas.innerText()).match(/Fotos\s*(\d+)/i)?.[1] ?? '-1')

    await expect.poll(fotos).toBe(0)

    // --- filtrar pelos que nao tiram foto -----------------------------------
    const lista = page.locator('.painel-esquerdo')
    await lista.getByRole('button', { name: 'Sem foto' }).click()

    // --- apanha-los todos de uma vez ----------------------------------------
    const apanhar = lista.getByRole('button', { name: /^Seleccionar/ })
    await expect(apanhar).toBeVisible()
    const quantos = Number((await apanhar.innerText()).match(/(\d+)/)?.[1] ?? '0')
    expect(quantos).toBeGreaterThan(10)
    await apanhar.click()

    await expect(lista.getByText(`${quantos} seleccionados`)).toBeVisible()

    // --- dar-lhes a foto ----------------------------------------------------
    const propriedades = page.locator('.painel-direito')
    // As abas sao `role="tab"`, nao botoes - o papel e que as distingue.
    await propriedades.getByRole('tab', { name: 'Acções' }).click()
    await propriedades.getByRole('button', { name: 'Tirar foto', exact: true }).click()

    await expect.poll(fotos).toBe(quantos)

    /*
     * E subir a altura de todos sem lhes tirar as diferencas: `+10` soma dez a
     * cada um, ao contrario de escrever um valor, que os igualava.
     */
    await propriedades.getByRole('tab', { name: 'Parâmetros' }).click()
    const alturasAntes = await page.locator('.linha-waypoint .altura').allInnerTexts()

    await propriedades.getByRole('button', { name: '+10', exact: true }).first().click()

    const alturasDepois = await page.locator('.linha-waypoint .altura').allInnerTexts()
    expect(alturasDepois).toHaveLength(alturasAntes.length)
    for (const [i, antes] of alturasAntes.entries()) {
      const a = Number(antes.replace(/[^\d.-]/g, ''))
      const d = Number((alturasDepois[i] ?? '').replace(/[^\d.-]/g, ''))
      expect(d).toBeCloseTo(a + 10, 3)
    }
  })

  test('uma zona interdita por baixo da cobertura trava a exportacao', async ({ page }) => {
    /*
     * A validacao das zonas interditas verifica o troco inteiro e nao so os
     * waypoints, e e por isso que tem de passar por aqui: numa cobertura, as
     * transicoes entre passagens atravessam a zona de lado a lado sem que
     * nenhuma ponta caia la dentro. Um teste de unidade da geometria nao prova
     * que a rota gerada pela aplicacao chega a ser confrontada com ela.
     */
    await abrirProjetoNovo(page)

    await page.locator('input[type="file"][data-tipo="referencia"]').setInputFiles(PARCELA)
    await expect(page.getByText(/parcela\.kml: 1 área\(s\)/)).toBeVisible()

    await page.getByRole('button', { name: 'Cobrir', exact: true }).click()
    const painel = page.getByRole('dialog', { name: 'Cobrir área com passagens' })
    await painel.getByRole('button', { name: /waypoints/ }).click()
    await expect(painel).toBeHidden()

    // Exportar so fica travado por causa da zona: antes dela, esta livre.
    const exportar = page.getByRole('button', { name: 'Exportar', exact: true })
    await expect(exportar).toBeEnabled()

    await page.locator('input[type="file"][data-tipo="exclusao"]').setInputFiles(ZONA)
    await expect(page.getByText(/zona-interdita\.kml: 1 zona\(s\) interdita\(s\)/)).toBeVisible()

    await expect(exportar).toBeDisabled()
    await page.getByRole('tab', { name: /Validações/ }).click()
    await expect(page.getByText(/A rota entra em zona interdita/)).toBeVisible()
  })

  test('sem waypoints nao ha nada para exportar', async ({ page }) => {
    // O botao de exportar tem de estar travado, e nao a dar um ficheiro vazio.
    await abrirProjetoNovo(page)
    await expect(page.getByRole('button', { name: 'Exportar', exact: true })).toBeDisabled()
  })
})
