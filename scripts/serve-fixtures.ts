/**
 * Serves the saved click-tt pages on http://localhost:8080 so the development
 * build of the extension can be tried without touching real click-tt data.
 * Form submissions (Weiter, Löschen, Einfügen) are answered with a notice.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';

const PORT = 8080;
const ROOT = join(import.meta.dirname, '..', 'fixtures');

createServer(async (request, response) => {
  if (request.method === 'POST') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<p>Formular abgeschickt (lokale Testseite, keine Daten an click-tt gesendet). <a href="/">Zurück</a></p>');
    return;
  }
  const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  if (path === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<h1>Gespeicherte click-tt-Seiten</h1><ul>
      <li><a href="/click-tt-single-match-report-part-1.html">Schritt 1: Mannschaftsaufstellung</a></li>
      <li><a href="/click-tt-single-match-report-part-2.html">Schritt 2: Erfassung</a></li></ul>`);
    return;
  }
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
    response.writeHead(200, { 'content-type': type }).end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(PORT, () => console.log(`Saved click-tt pages: http://localhost:${PORT}/`));
