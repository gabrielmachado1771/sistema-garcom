import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'

// Onde o site é publicado:
// - Vercel (principal): na raiz do domínio → base "/" (links como /r/sobradinho)
// - GitHub Pages: em /sistema-garcom/ → o workflow define GITHUB_PAGES=true
// - Desenvolvimento: http://localhost:5173/
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/sistema-garcom/' : '/',
  plugins: [react(), tailwindcss()],
})
