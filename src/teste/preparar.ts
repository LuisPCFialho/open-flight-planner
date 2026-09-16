/**
 * O que todos os testes de componente precisam antes de montar seja o que for.
 *
 * Os matchers do jest-dom vivem aqui porque `toBeDisabled` e `toBeInTheDocument`
 * dizem numa linha o que de outra maneira sao tres, e porque a mensagem de falha
 * traz o elemento em vez de um `null`.
 *
 * A limpeza entre testes e o que impede o segundo teste de encontrar dois botoes
 * com o mesmo nome - um deste teste e outro que o anterior deixou montado.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)
