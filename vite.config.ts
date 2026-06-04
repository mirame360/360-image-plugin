import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  server: {
    fs: {
      allow: ['../..'],
    },
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'Image360Player',
      fileName: (format) => (
        format === 'es' ? '360-image-player.min.js' : '360-image-player.min.cjs'
      ),
      formats: ['es', 'cjs'],
    },
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      external: ['react', 'react-dom'],
    },
  },
});
