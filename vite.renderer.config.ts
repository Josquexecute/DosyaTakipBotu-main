// Bu proje şu aşamada renderer tarafını tsc ile derler.
// Dosya bilerek bırakıldı: ileride Vite/React'e geçilirken Stitch tasarım referansı bozulmadan kullanılacak.
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/renderer',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: false
  }
});
