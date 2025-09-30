import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Use relative asset URLs so the production bundle can be hosted from
  // GitHub Pages or any other sub-path without additional rewrites.
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true
  }
});
