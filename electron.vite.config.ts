import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron',
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'electron/main.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron',
      rollupOptions: {
        input: {
          preload: resolve(__dirname, 'electron/preload.ts'),
        },
      },
    },
  },
  renderer: {
    root: 'client',
    build: {
      outDir: '../dist',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'client/index.html'),
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'client'),
      },
    },
  },
});
