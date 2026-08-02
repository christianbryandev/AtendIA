import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.md'],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // O padrao de 5s e apertado demais aqui: montar jsdom com React 19 e
    // resolver imports dinamicos (Suspense/lazy) passa de 6s quando a
    // maquina esta ocupada, e a suite falhava de forma intermitente em
    // testes que nao tem nada de lento. Nenhum destes testes mede
    // desempenho, entao o limite so precisa ser folgado o bastante para
    // nao transformar carga da maquina em falha falsa.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
