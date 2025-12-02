import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // 性能优化
  build: {
    target: 'esnext',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // 将 react 相关库分离到单独 chunk
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // 将地图相关库分离
          'map-vendor': ['maplibre-gl'],
          // 将工具库分离
          'utils-vendor': ['exifr', 'webdav'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },

  // 开发服务器配置
  server: {
    port: 5173,
    host: true,
    proxy: {
      // 代理 API 请求到后端服务器
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      // 代理上传的文件访问
      '/uploads': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      // 代理高德地图搜索 API
      '/amap-api': {
        target: 'https://restapi.amap.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/amap-api/, ''),
      },
    },
  },
})
