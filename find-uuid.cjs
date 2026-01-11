const https = require('https');

// Buscar el proceso específico del usuario
const url = 'https://contratacionesabiertas.oece.gob.pe/api/v1/releases?sourceId=seace_v3&startDate=2025-01-01&endDate=2025-12-31&page=1';

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const r = json.releases[0];

    console.log('=== CAMPOS PRINCIPALES ===');
    console.log('ocid:', r.ocid);
    console.log('id:', r.id);
    console.log('tender.id:', r.tender?.id);
    console.log('tender.title:', r.tender?.title);

    // Buscar UUIDs en todo el JSON
    const jsonStr = JSON.stringify(r);
    const uuidPattern = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;
    const uuids = jsonStr.match(uuidPattern);
    console.log('\n=== UUIDs encontrados ===');
    if (uuids) {
      [...new Set(uuids)].slice(0, 10).forEach(u => console.log(' ', u));
    }

    // Buscar campos con 'url' o 'uri'
    console.log('\n=== URLs en documentos ===');
    if (r.tender?.documents) {
      r.tender.documents.slice(0, 3).forEach(doc => {
        console.log('  ', doc.title);
        console.log('    URL:', doc.url);
      });
    }

    // Buscar releaseSource
    console.log('\n=== Release Source ===');
    if (r.releaseSource) {
      console.log(JSON.stringify(r.releaseSource, null, 2));
    }

    // Buscar cualquier campo que contenga seace.gob.pe
    console.log('\n=== URLs SEACE encontradas ===');
    const seaceUrls = jsonStr.match(/https?:\/\/[^"]*seace[^"]*/gi);
    if (seaceUrls) {
      [...new Set(seaceUrls)].forEach(u => console.log(' ', u.substring(0, 100)));
    }
  });
}).on('error', console.error);
