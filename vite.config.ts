import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://quangshuynh.github.io/remix-deck/, so every asset URL
// needs the /remix-deck/ prefix.
//
// This is deliberately unconditional. Making it depend on `command` splits dev
// from production and breaks `vite preview`, which reports command as 'serve'
// and would then serve the app at / while the built HTML asks for
// /remix-deck/. The dev server just runs at /remix-deck/ too, which matches
// production and means preview actually exercises what gets deployed.
export default defineConfig({
  base: '/remix-deck/',
  plugins: [react()],
})
