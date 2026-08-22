import { defineConfig } from 'vite'
import { holocron } from '@holocron.so/vite'

export default defineConfig({
  clearScreen: false,
  base: '/docs/',
  ssr: { noExternal: ['scheduler'] },
  plugins: [holocron({ pagesDir: './src' })],
})
