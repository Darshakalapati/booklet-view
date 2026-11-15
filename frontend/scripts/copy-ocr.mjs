// Copies the text-recognition engine into public/ocr so the site serves it
// itself and reading a photo does not depend on an outside server.
import { copyFileSync, mkdirSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const out = new URL('../public/ocr/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const worker = require.resolve('tesseract.js/dist/worker.min.js');
copyFileSync(worker, join(out, 'worker.min.js'));

const core = dirname(require.resolve('tesseract.js-core/package.json'));
for (const name of ['tesseract-core-simd-lstm', 'tesseract-core-lstm']) {
  copyFileSync(join(core, `${name}.wasm.js`), join(out, `${name}.wasm.js`));
  copyFileSync(join(core, `${name}.wasm`), join(out, `${name}.wasm`));
}

const lang = dirname(require.resolve('@tesseract.js-data/eng/package.json'));
copyFileSync(join(lang, '4.0.0', 'eng.traineddata.gz'), join(out, 'eng.traineddata.gz'));
console.log('OCR engine copied to public/ocr');
