import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // Use relative asset URLs in the production build so the bundle can be
  // hosted from GitHub Pages or any other sub-path without additional rewrites
  // while keeping the dev server mounted at the default root during `npm run dev`.
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true
  }
}));
