import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Served from https://roynethu0.github.io/Ascii-art-Studio/
  base: '/Ascii-art-Studio/',
})
