import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.PORT || 4173);
const root = new URL('../website/', import.meta.url);
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/docs.html', ['docs.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/dj-session.png', ['dj-session.png', 'image/png']],
  ['/popup-poster.png', ['popup-poster.png', 'image/png']],
  ['/bohselecta-quickstart.mp4', ['bohselecta-quickstart.mp4', 'video/mp4']],
  ['/bohselecta-quickstart.vtt', ['bohselecta-quickstart.vtt', 'text/vtt; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const file = files.get((request.url || '/').split('?')[0]);
  if (!file) { response.writeHead(404).end('Not found'); return; }
  try {
    const body = await readFile(new URL(file[0], root));
    const headers = { 'Content-Type': file[1], 'Content-Length': body.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' };
    // Video players request byte ranges when seeking.
    if (request.method === 'GET' && request.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      const start = match?.[1] ? Number(match[1]) : Math.max(0, body.length - Number(match?.[2]));
      const end = match?.[1] && match[2] ? Math.min(Number(match[2]), body.length - 1) : body.length - 1;
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= body.length) {
        response.writeHead(416, { 'Content-Range': `bytes */${body.length}` }).end();
        return;
      }
      response.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${body.length}` });
      response.end(body.subarray(start, end + 1));
      return;
    }
    response.writeHead(200, headers);
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(500).end('Unable to read website file');
  }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`bohselecta website → http://127.0.0.1:${server.address().port}`));
