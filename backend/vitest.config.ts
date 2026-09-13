import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(process.cwd(), './src'),
      '@modules': resolve(process.cwd(), './src/modules'),
      '@common': resolve(process.cwd(), './src/common'),
      '@config': resolve(process.cwd(), './src/config'),
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});