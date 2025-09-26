import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        redirect: 'src/redirect.js',
        obrigado: 'src/obrigado.js'
      }
    }
  }
});
