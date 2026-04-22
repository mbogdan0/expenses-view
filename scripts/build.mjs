import { build as esbuild } from 'esbuild';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'dist');
const tempDir = path.join(root, '.build-temp');
const templatePath = path.join(root, 'src', 'index.template.html');
const outHtml = path.join(outDir, 'expense-consolidator.html');

function inlineSafeScript(scriptContent) {
  return scriptContent.replace(/<\/(script)/gi, '<\\/$1');
}

export async function buildSingleHtml() {
  await fs.mkdir(tempDir, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });

  const jsOut = path.join(tempDir, 'bundle.js');
  const cssOut = path.join(tempDir, 'bundle.css');

  await Promise.all([
    esbuild({
      entryPoints: [path.join(root, 'src', 'main.js')],
      bundle: true,
      minify: true,
      outfile: jsOut,
      format: 'iife',
      target: ['es2020'],
      legalComments: 'none'
    }),
    esbuild({
      entryPoints: [path.join(root, 'src', 'styles.css')],
      bundle: true,
      minify: true,
      outfile: cssOut,
      target: ['es2020'],
      legalComments: 'none'
    })
  ]);

  const [template, css, js] = await Promise.all([
    fs.readFile(templatePath, 'utf8'),
    fs.readFile(cssOut, 'utf8'),
    fs.readFile(jsOut, 'utf8')
  ]);

  const html = template
    .replace('/*__INLINE_CSS__*/', css)
    .replace('//__INLINE_JS__', inlineSafeScript(js));

  await fs.writeFile(outHtml, html, 'utf8');

  await fs.rm(tempDir, { recursive: true, force: true });
  return outHtml;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = await buildSingleHtml();
  process.stdout.write(`Built ${file}\n`);
}
