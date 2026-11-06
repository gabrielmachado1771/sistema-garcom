import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// No build, o site é publicado em https://gabrielmachado1771.github.io/sistema-garcom/
// (GitHub Pages); em desenvolvimento continua em http://localhost:5173/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/sistema-garcom/' : '/',
  plugins: [react(), tailwindcss()],
}))
