// Bundles src/ into one HTML page.
//   node build-page.mjs dev   -> dev/index.html  (local three.js, fetches mac128k.glb)
//   node build-page.mjs prod  -> dist/index.html (three.js from jsDelivr, model inlined)
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const mode = process.argv[2] || 'prod';
const THREE_VER = '0.170.0';
const cdn = `https://cdn.jsdelivr.net/npm/three@${THREE_VER}`;
const importmap = (base) => `<script type="importmap">{"imports":{"three":"${base}/build/three.module.js","three/addons/":"${base}/examples/jsm/"}}</script>`;
const glbPlugin = {
  name: 'glb',
  setup(b) {
    b.onResolve({ filter: /\/glb\.js$/ }, () => ({ path: 'glb', namespace: 'glb' }));
    b.onLoad({ filter: /.*/, namespace: 'glb' }, () => ({
      contents: mode === 'prod'
        ? `export const GLB_B64 = ${JSON.stringify(fs.readFileSync(path.join(ROOT, 'model/mac128k.glb')).toString('base64'))};`
        : 'export const GLB_B64 = null;',
      loader: 'js',
    }));
  },
};
const out = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/main.js')], bundle: true, format: 'esm', write: false,
  minify: mode === 'prod', external: ['three', 'three/addons/*'], target: 'es2020', plugins: [glbPlugin], legalComments: 'none',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const tpl = fs.readFileSync(path.join(ROOT, 'src/template.html'), 'utf8');
const body = tpl
  .replace('<!--IMPORTMAP-->', importmap(cdn))
  .replace('<!--APP-->', `<script type="module">\n${js}\n</script>`);
if (mode === 'prod') {
  
  
  const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
  fs.writeFileSync(path.join(ROOT, 'index.html'), full); // standalone file
  console.log('prod bytes', body.length);
} else {
  const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
  fs.writeFileSync(path.join(ROOT, 'dev.html'), full);
  console.log('dev bytes', full.length);
}
