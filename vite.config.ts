import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径产物：dist 可以部署在任意子路径，也可以挂到现有静态站点下。
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    open: false,
    watch: {
      // 编辑器保存文件时可能产生临时目录；避免 chokidar 在 Windows 上因 EBUSY 崩溃。
      ignored: ['**/.git/**', '**/node_modules/**', '**/.*.tmpdir/**', '**/*.tmp'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    // Three.js 从 r186 起单包体积进一步增大，压缩后仍约 532 kB；
    // 这里显式放宽提示阈值，避免把正常的引擎分块误报成构建问题。
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // three.js 单独成块：升级业务代码时浏览器可以继续用缓存。
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
