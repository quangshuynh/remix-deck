import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Deployed via `npm run deploy` to github.com/quangshuynh/remix-deck,
// which serves from /remix-deck/. Dev server stays at /.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/remix-deck/' : '/',
  plugins: [react()],
}))
