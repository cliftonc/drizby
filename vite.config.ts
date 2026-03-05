import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: './client',
  publicDir: './public',
  server: {
    port: 3460,
    proxy: {
      '/cubejs-api': {
        target: 'http://localhost:3461',
        changeOrigin: true
      },
      '/api': {
        target: 'http://localhost:3461',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../dist'
  }
})
