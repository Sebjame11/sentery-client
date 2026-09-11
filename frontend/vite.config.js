import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/zen': {
        target: 'https://opencode.ai',
        changeOrigin: true,
      },
      '/apollo': {
        target: 'https://api.apollo.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/apollo/, ''),
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
})
