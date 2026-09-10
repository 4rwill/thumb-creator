import tailwindcss from '@tailwindcss/vite';
import vinext from 'vinext';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
  plugins: [tailwindcss(), vinext(), nitro()],
});
