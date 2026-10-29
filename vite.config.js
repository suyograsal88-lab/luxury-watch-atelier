import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const pages = ['index.html', 'contact.html', 'register.html', 'login.html', 'account-register.html', 'cart.html', 'orders.html', 'admin.html'];

export default defineConfig({
  base: './',
  build: {
    rollupOptions: { input: Object.fromEntries(pages.map(page => [page.replace('.html', ''), resolve(import.meta.dirname, page)])) },
  },
  plugins: [{
    name: 'copy-scroll-animation-frames',
    apply: 'build',
    async closeBundle() {
      await cp(resolve(import.meta.dirname, 'frames'), resolve(import.meta.dirname, 'dist', 'frames'), { recursive: true });
      await cp(resolve(import.meta.dirname, 'script.js'), resolve(import.meta.dirname, 'dist', 'script.js'));
    },
  }],
});
