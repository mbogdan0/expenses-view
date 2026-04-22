import http from 'node:http';
import { promises as fs, watch as fsWatch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSingleHtml } from './build.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');
const scriptDir = path.join(root, 'scripts');
const outHtml = path.join(root, 'dist', 'expense-consolidator.html');
const port = Number(process.env.PORT || 4173);

let pendingBuild = false;
let building = false;

async function runBuild() {
  if (building) {
    pendingBuild = true;
    return;
  }

  building = true;
  try {
    const file = await buildSingleHtml();
    process.stdout.write(`[build] ${new Date().toLocaleTimeString()} -> ${file}\n`);
  } catch (error) {
    process.stderr.write(`[build] failed: ${error.stack || error.message}\n`);
  } finally {
    building = false;
    if (pendingBuild) {
      pendingBuild = false;
      await runBuild();
    }
  }
}

function watchDir(dirPath) {
  fs.access(dirPath)
    .then(() => {
      const watcher = fsWatch(dirPath, { recursive: true }, () => {
        void runBuild();
      });

      watcher.on('error', (error) => {
        process.stderr.write(`[watch] ${dirPath}: ${error.message}\n`);
      });

      process.stdout.write(`[watch] listening ${dirPath}\n`);
    })
    .catch((error) => {
      process.stderr.write(`[watch] skip ${dirPath}: ${error.message}\n`);
    });
}

function getContentType(urlPath) {
  if (urlPath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (urlPath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'text/html; charset=utf-8';
}

const server = http.createServer(async (req, res) => {
  try {
    const requestPath = req.url || '/';

    if (requestPath === '/__health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    const html = await fs.readFile(outHtml, 'utf8');
    res.writeHead(200, {
      'Content-Type': getContentType(requestPath),
      'Cache-Control': 'no-store'
    });
    res.end(html);
  } catch {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Build not ready yet.');
  }
});

await runBuild();
watchDir(srcDir);
watchDir(scriptDir);

server.listen(port, () => {
  process.stdout.write(`Dev server: http://localhost:${port}\n`);
});

server.on('error', (error) => {
  if (error && error.code === 'EADDRINUSE') {
    process.stderr.write(`[server] Port ${port} is already in use. Set PORT=xxxx and retry.\n`);
    process.exitCode = 1;
    return;
  }

  process.stderr.write(`[server] ${error.message}\n`);
  process.exitCode = 1;
});
