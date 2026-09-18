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

/** Entra num projeto novo e espera que o mapa instale as camadas. */
async function abrirProjetoNovo(page: Page): Promise<void> {
  await page.goto('/')

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
