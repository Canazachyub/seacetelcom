/**
 * Cloudflare Worker — Proxy permanente para API OCDS del gobierno peruano.
 *
 * Problema que resuelve: oece.gob.pe tiene un WAF que bloquea con HTTP 403
 * todas las peticiones desde IPs de Google Apps Script. Este Worker reenvía
 * las mismas requests desde IPs de Cloudflare (no bloqueadas) con headers
 * de navegador real.
 *
 * Deploy: Cloudflare Dashboard → Workers & Pages → Create Worker → pegar esto.
 * Una vez desplegado, copiá la URL (ej: seace-ocds-proxy.TU-USUARIO.workers.dev)
 * y actualizala en GOOGLE_APPS_SCRIPT.js → CONFIG.OCDS_API.BASE_URL
 */

const TARGET = 'https://contratacionesabiertas.oece.gob.pe/api/v1';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
  'Referer': 'https://contratacionesabiertas.oece.gob.pe/',
  'Origin': 'https://contratacionesabiertas.oece.gob.pe',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ ok: true, target: TARGET });
    }

    // Construir URL destino: mantiene path + query string
    const targetUrl = TARGET + url.pathname + url.search;

    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers: BROWSER_HEADERS,
    });

    // Copiar respuesta agregando CORS para que Apps Script pueda leer
    const response = new Response(upstreamResponse.body, upstreamResponse);
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.headers.set('X-Proxy-Target', targetUrl);

    return response;
  },
};
