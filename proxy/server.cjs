// Proxy local para el API OCDS del gobierno peruano.
// Evita el bloqueo WAF contra IPs de Google Apps Script / Cloudflare Workers
// reenviando las peticiones desde tu IP residencial peruana.

const http = require('http');
const https = require('https');

const PORT = Number(process.env.PORT) || 3101;
const TARGET_HOST = 'contratacionesabiertas.oece.gob.pe';
const TARGET_BASE = '/api/v1';

const BROWSER_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://contratacionesabiertas.oece.gob.pe/',
};

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, target: `https://${TARGET_HOST}${TARGET_BASE}` }));
    return;
  }

  const path = TARGET_BASE + req.url;
  const started = Date.now();

  const options = {
    hostname: TARGET_HOST,
    port: 443,
    path,
    method: req.method,
    headers: BROWSER_HEADERS,
  };

  const proxyReq = https.request(options, (proxyRes) => {
    const latency = Date.now() - started;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} -> ${proxyRes.statusCode} (${latency}ms)`);

    const outHeaders = { ...proxyRes.headers };
    outHeaders['access-control-allow-origin'] = '*';
    outHeaders['cache-control'] = 'no-store, no-cache, must-revalidate';
    outHeaders['x-origin-status'] = String(proxyRes.statusCode);
    outHeaders['x-proxy-latency-ms'] = String(latency);

    res.writeHead(proxyRes.statusCode || 500, outHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] Error ${req.url}:`, err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', detail: err.message }));
  });

  proxyReq.end();
});

server.listen(PORT, () => {
  console.log('==============================================');
  console.log('  SEACE OCDS proxy');
  console.log(`  Listening on http://localhost:${PORT}`);
  console.log(`  Forwarding to https://${TARGET_HOST}${TARGET_BASE}`);
  console.log('  Health check: http://localhost:' + PORT + '/health');
  console.log('==============================================');
});
