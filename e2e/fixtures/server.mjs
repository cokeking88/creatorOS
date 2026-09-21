import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.FIXTURE_PORT ?? 17992);

const server = createServer(async (req, res) => {
  try {
    const html = await readFile(join(__dirname, 'page.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch {
    res.writeHead(404).end('not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fixture server on http://127.0.0.1:${PORT}`);
});

// Playwright webServer kills the process tree on teardown; no explicit shutdown needed.
