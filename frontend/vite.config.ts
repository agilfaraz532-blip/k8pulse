import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Vendor chunks change rarely, so browsers keep them cached across releases
        // Recharts (and its d3 helpers) only loads with the Overview tab
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (/node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|internmap|decimal\.js-light)[\\/]/.test(id)) return 'charts';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Override with API_PROXY_TARGET when the backend runs elsewhere
      '^/(api|docs|redoc|openapi\.json)': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  }
})
