import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

// Suppress proxy errors while the backend is starting up
function onProxyError(_err: Error, _req: IncomingMessage, res: ServerResponse) {
  if (!res.headersSent) {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '2' })
    res.end(JSON.stringify({ error: 'Backend starting up, retry shortly...' }))
  }
}

const proxyOpts = {
  target: 'http://localhost:3461',
  changeOrigin: false,
  secure: false,
  configure: (proxy: any) => {
    proxy.on('error', onProxyError)
  },
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react()],
  root: './client',
  publicDir: './public',
  server: {
    port: 3460,
    allowedHosts: true,
    proxy: {
      '/cubejs-api': proxyOpts,
      '/api': proxyOpts,
      '/.well-known': proxyOpts,
      '/oauth': proxyOpts,
      '/mcp': proxyOpts,
      '/health': proxyOpts,
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
})
