const https = require('https');

// El proceso del usuario
const NOMENCLATURA = 'CP SER-SM-41-2025-ELSE-1';
const BASE_URL = 'https://contratacionesabiertas.oece.gob.pe/api/v1';

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON parse error'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => reject(new Error('Timeout')));
  });
}

async function buscar() {
  console.log('Buscando:', NOMENCLATURA);
  console.log('Nomenclatura normalizada:', NOMENCLATURA.replace(/ /g, '-').toUpperCase());

  // Buscar en 2025
  const url = `${BASE_URL}/releases?sourceId=seace_v3&startDate=2025-01-01&endDate=2025-12-31&page=1`;

  let found = null;
  let pageNum = 1;

  while (!found && pageNum <= 20) {
    const pageUrl = `${BASE_URL}/releases?sourceId=seace_v3&startDate=2025-01-01&endDate=2025-12-31&page=${pageNum}`;
    const data = await fetch(pageUrl);

    if (!data.releases || data.releases.length === 0) break;

    for (const r of data.releases) {
      const title = r.tender?.title || '';
      // Buscar ELSE en el título
      if (title.includes('ELSE') || title.includes('SER-SM-41')) {
        console.log(`\nEncontrado posible match: ${title}`);
        console.log(`  tender.id: ${r.tender?.id}`);
        console.log(`  ocid: ${r.ocid}`);

        // Si coincide exactamente
        if (title.includes('41-2025-ELSE') || title.includes('41-2025-ELSE')) {
          found = r;
          break;
        }
      }
    }

    if (!found) {
      process.stdout.write(`Página ${pageNum}...\r`);
      pageNum++;
    }
  }

  if (!found) {
    console.log('\nNo encontrado exactamente. Mostrando estructura de un release para análisis:');
    const data = await fetch(`${BASE_URL}/releases?sourceId=seace_v3&page=1`);
    found = data.releases[0];
  }

  console.log('\n=== ESTRUCTURA COMPLETA DEL RELEASE ===');
  console.log('\nClaves de primer nivel:', Object.keys(found));

  // Mostrar tender completo
  console.log('\n=== TENDER ===');
  if (found.tender) {
    console.log('Claves de tender:', Object.keys(found.tender));
    console.log('tender.id:', found.tender.id);
    console.log('tender.title:', found.tender.title);

    // Buscar cualquier campo que pueda contener la URL de la ficha
    for (const [k, v] of Object.entries(found.tender)) {
      if (typeof v === 'string' && v.length > 20 && v.length < 200) {
        console.log(`tender.${k}:`, v);
      }
    }
  }

  // Mostrar links si existen
  console.log('\n=== LINKS ===');
  if (found.links) console.log(JSON.stringify(found.links, null, 2));

  // Mostrar releaseSource
  console.log('\n=== RELEASE SOURCE ===');
  if (found.releaseSource) console.log(JSON.stringify(found.releaseSource, null, 2));

  // Buscar cualquier campo "url", "uri", "link", "ficha"
  console.log('\n=== TODOS LOS CAMPOS URL/URI/LINK ===');
  const jsonStr = JSON.stringify(found);

  // Buscar patrones de URL de ficha
  const fichaPattern = /fichaSeleccion[^"]+/gi;
  const fichaUrls = jsonStr.match(fichaPattern);
  if (fichaUrls) {
    console.log('URLs de ficha encontradas:', fichaUrls);
  } else {
    console.log('No se encontraron URLs de ficha en la respuesta');
  }

  // Buscar el tender.id numérico - esto podría usarse para construir URL
  console.log('\n=== POSIBLE CONSTRUCCIÓN DE URL ===');
  console.log('tender.id:', found.tender?.id);
  console.log('Posible URL: https://prod2.seace.gob.pe/seacebus-uiwd-pub/fichaSeleccion/fichaSeleccion.xhtml?codigoFicha=' + found.tender?.id);
}

buscar().catch(console.error);
