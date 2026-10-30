import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: './',
  worker: { format: 'es' },
  build: mode === 'library' ? {
    outDir: 'dist-lib',
    copyPublicDir: false,
    lib: { entry: 'src/index.js', formats: ['es'], fileName: 'msnwidget', cssFileName: 'msnwidget' },
    rolldownOptions: { external: ['d3', 'graphology', '@gmod/vcf', 'jspdf', 'svg2pdf.js'] },
  } : {},
}));
