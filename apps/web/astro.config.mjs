// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://av.livn.tr',
  output: 'static',
  trailingSlash: 'ignore',
  // MapLibre's worker is an ES module; bundle it as one so its shared chunk resolves.
  vite: { worker: { format: 'es' } },
});
