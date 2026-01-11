/**
 * =====================================================
 * SEACE INTELLIGENCE - TEST DE CONEXIÓN Y ESTRUCTURA
 * =====================================================
 *
 * Este archivo contiene funciones para probar que:
 * 1. Todas las hojas existen
 * 2. Todas las columnas son correctas
 * 3. Los datos se leen correctamente
 * 4. Las funciones del API funcionan
 *
 * CÓMO USAR:
 * 1. Copia este código en tu Apps Script
 * 2. Ejecuta "ejecutarTodosLosTests()" desde el menú
 * 3. Revisa los resultados en el Logger (Ver > Registros)
 */

// ==================== CONFIGURACIÓN ESPERADA ====================

const TEST_CONFIG = {
  SPREADSHEET_ID: '1iugkHMAW40jLYeYxkbwC4_pox2tdRTqt4bclJzjN1iM',
  DRIVE_FOLDER_ID: '1L1mzM6mTtALDN5waUPIbEhj2zEq7RBZH',

  HOJAS_ESPERADAS: {
    'SEACE_IMPORT': {
      columnas: ['N°', 'Nombre o Sigla de la Entidad', 'Fecha y Hora de Publicacion', 'Nomenclatura', 'Reiniciado Desde', 'Objeto de Contratación', 'Descripción de Objeto', 'VR / VE / Cuantía de la contratación', 'Moneda', 'Versión SEACE'],
      minColumnas: 10
    },
    'BD_PROCESOS': {
      columnas: ['ID', 'NOMENCLATURA', 'ENTIDAD', 'REGION', 'OBJETO', 'DESCRIPCION', 'VALOR', 'MONEDA', 'FECHA_PUB', 'VERSION', 'REINICIADO', 'URL'],
      minColumnas: 12
    },
    'SEGUIMIENTO': {
      columnasBase: ['NOMENCLATURA', 'ENTIDAD', 'OBJETO', 'VALOR', 'REGION', 'ESTADO_INTERES', 'PRIORIDAD', 'RESPONSABLE', 'NOTAS', 'FECHA_AGREGADO', 'CARPETA_DRIVE'],
      etapas: ['CONVOCATORIA', 'REGISTRO_PARTICIPANTES', 'CONSULTAS_OBSERVACIONES', 'ABSOLUCION_CONSULTAS', 'INTEGRACION_BASES', 'PRESENTACION_PROPUESTAS', 'CALIFICACION_EVALUACION', 'BUENA_PRO'],
      minColumnas: 43 // 11 base + 32 etapas (8 * 4)
    },
    'CRONOGRAMA': {
      columnas: ['NOMENCLATURA', 'ETAPA', 'FECHA_INICIO', 'FECHA_FIN', 'ESTADO'],
      minColumnas: 5
    },
    'DOCUMENTOS': {
      columnas: ['NOMENCLATURA', 'NOMBRE', 'TIPO', 'ETAPA', 'URL_DRIVE', 'FECHA_AGREGADO'],
      minColumnas: 6
    },
    'FILTROS_ENTIDADES': {
      columnas: ['ENTIDAD', 'ACTIVO'],
      minColumnas: 2
    },
    'FILTROS_PALABRAS': {
      columnas: ['PALABRA', 'ACTIVO'],
      minColumnas: 2
    },
    'REGIONES': {
      columnas: ['PATRON', 'REGION'],
      minColumnas: 2
    }
  },

  ETAPAS_SEACE: [
    'CONVOCATORIA',
    'REGISTRO_PARTICIPANTES',
    'CONSULTAS_OBSERVACIONES',
    'ABSOLUCION_CONSULTAS',
    'INTEGRACION_BASES',
    'PRESENTACION_PROPUESTAS',
    'CALIFICACION_EVALUACION',
    'BUENA_PRO'
  ],

  ESTADOS_VALIDOS: {
    INTERES: ['PENDIENTE', 'INSCRITO', 'DESCARTADO'],
    PRIORIDAD: ['ALTA', 'MEDIA', 'BAJA'],
    ETAPA: ['PENDIENTE', 'EN_CURSO', 'COMPLETADO', 'VENCIDO', 'NO_APLICA']
  }
};

// ==================== RESULTADOS DE TEST ====================

let testResults = {
  passed: 0,
  failed: 0,
  warnings: 0,
  details: []
};

function resetTestResults() {
  testResults = { passed: 0, failed: 0, warnings: 0, details: [] };
}

function logTest(nombre, passed, mensaje, tipo = 'info') {
  const icon = passed ? '✅' : (tipo === 'warning' ? '⚠️' : '❌');
  const result = { nombre, passed, mensaje, tipo, icon };
  testResults.details.push(result);

  if (passed) {
    testResults.passed++;
  } else if (tipo === 'warning') {
    testResults.warnings++;
  } else {
    testResults.failed++;
  }

  Logger.log(`${icon} ${nombre}: ${mensaje}`);
  return passed;
}

// ==================== TESTS DE HOJAS ====================

/**
 * Test 1: Verificar que todas las hojas existen
 */
function testHojasExisten() {
  Logger.log('\n📋 TEST: Verificando existencia de hojas...\n');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojasEsperadas = Object.keys(TEST_CONFIG.HOJAS_ESPERADAS);

  let todasExisten = true;

  hojasEsperadas.forEach(nombreHoja => {
    const sheet = ss.getSheetByName(nombreHoja);
    if (sheet) {
      logTest(`Hoja ${nombreHoja}`, true, 'Existe');
    } else {
      logTest(`Hoja ${nombreHoja}`, false, 'NO EXISTE - Debes crearla');
      todasExisten = false;
    }
  });

  return todasExisten;
}

/**
 * Test 2: Verificar columnas de cada hoja
 */
function testColumnasHojas() {
  Logger.log('\n📊 TEST: Verificando columnas de hojas...\n');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let todasCorrectas = true;

  Object.entries(TEST_CONFIG.HOJAS_ESPERADAS).forEach(([nombreHoja, config]) => {
    const sheet = ss.getSheetByName(nombreHoja);
    if (!sheet) {
      logTest(`Columnas ${nombreHoja}`, false, 'Hoja no existe');
      todasCorrectas = false;
      return;
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const headersLimpios = headers.filter(h => h !== '');

    // Verificar cantidad mínima de columnas
    if (headersLimpios.length < config.minColumnas) {
      logTest(
        `Columnas ${nombreHoja}`,
        false,
        `Faltan columnas: tiene ${headersLimpios.length}, esperadas ${config.minColumnas}`
      );
      todasCorrectas = false;
      return;
    }

    // Verificar columnas específicas (para hojas simples)
    if (config.columnas) {
      const faltantes = config.columnas.filter(col => !headersLimpios.includes(col));
      if (faltantes.length > 0) {
        logTest(
          `Columnas ${nombreHoja}`,
          false,
          `Columnas faltantes: ${faltantes.join(', ')}`,
          'warning'
        );
        todasCorrectas = false;
      } else {
        logTest(`Columnas ${nombreHoja}`, true, `${headersLimpios.length} columnas OK`);
      }
    }

    // Verificar columnas de SEGUIMIENTO (caso especial)
    if (nombreHoja === 'SEGUIMIENTO' && config.columnasBase) {
      // Verificar columnas base
      const faltantesBase = config.columnasBase.filter(col => !headersLimpios.includes(col));
      if (faltantesBase.length > 0) {
        logTest(
          `${nombreHoja} - Columnas Base`,
          false,
          `Faltantes: ${faltantesBase.join(', ')}`
        );
        todasCorrectas = false;
      } else {
        logTest(`${nombreHoja} - Columnas Base`, true, '11 columnas base OK');
      }

      // Verificar columnas de etapas
      config.etapas.forEach(etapa => {
        const colsEtapa = [
          `${etapa}_ESTADO`,
          `${etapa}_INICIO`,
          `${etapa}_FIN`,
          `${etapa}_NOTAS`
        ];

        const faltantesEtapa = colsEtapa.filter(col => !headersLimpios.includes(col));
        if (faltantesEtapa.length > 0) {
          logTest(
            `${nombreHoja} - Etapa ${etapa}`,
            false,
            `Columnas faltantes: ${faltantesEtapa.join(', ')}`
          );
          todasCorrectas = false;
        }
      });

      if (todasCorrectas) {
        logTest(`${nombreHoja} - Etapas`, true, '8 etapas x 4 columnas = 32 columnas OK');
      }
    }
  });

  return todasCorrectas;
}

/**
 * Test 3: Verificar datos en BD_PROCESOS
 */
function testDatosBDProcesos() {
  Logger.log('\n📁 TEST: Verificando datos en BD_PROCESOS...\n');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('BD_PROCESOS');

  if (!sheet) {
    logTest('BD_PROCESOS', false, 'Hoja no existe');
    return false;
  }

  const data = sheet.getDataRange().getValues();
  const filas = data.length - 1; // Sin header

  if (filas === 0) {
    logTest('BD_PROCESOS - Datos', false, 'No hay datos - Procesa el SEACE_IMPORT', 'warning');
    return false;
  }

  logTest('BD_PROCESOS - Cantidad', true, `${filas} procesos encontrados`);

  // Verificar campos obligatorios
  const headers = data[0];
  const colNomenclatura = headers.indexOf('NOMENCLATURA');
  const colEntidad = headers.indexOf('ENTIDAD');
  const colRegion = headers.indexOf('REGION');
  const colObjeto = headers.indexOf('OBJETO');

  let sinNomenclatura = 0;
  let sinEntidad = 0;
  let sinRegion = 0;

  for (let i = 1; i < data.length; i++) {
    if (!data[i][colNomenclatura]) sinNomenclatura++;
    if (!data[i][colEntidad]) sinEntidad++;
    if (!data[i][colRegion]) sinRegion++;
  }

  if (sinNomenclatura > 0) {
    logTest('BD_PROCESOS - NOMENCLATURA', false, `${sinNomenclatura} filas sin nomenclatura`);
  } else {
    logTest('BD_PROCESOS - NOMENCLATURA', true, 'Todos tienen nomenclatura');
  }

  if (sinRegion > 0) {
    logTest('BD_PROCESOS - REGION', false, `${sinRegion} filas sin región`, 'warning');
  } else {
    logTest('BD_PROCESOS - REGION', true, 'Todos tienen región');
  }

  // Estadísticas por región
  const regiones = {};
  for (let i = 1; i < data.length; i++) {
    const region = data[i][colRegion] || 'SIN REGION';
    regiones[region] = (regiones[region] || 0) + 1;
  }

  Logger.log('\n📍 Distribución por región:');
  Object.entries(regiones)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([region, count]) => {
      Logger.log(`   ${region}: ${count} procesos`);
    });

  // Estadísticas por objeto
  const objetos = {};
  for (let i = 1; i < data.length; i++) {
    const objeto = data[i][colObjeto] || 'SIN OBJETO';
    objetos[objeto] = (objetos[objeto] || 0) + 1;
  }

  Logger.log('\n📦 Distribución por objeto:');
  Object.entries(objetos).forEach(([objeto, count]) => {
    Logger.log(`   ${objeto}: ${count} procesos`);
  });

  return sinNomenclatura === 0;
}

/**
 * Test 4: Verificar datos en SEGUIMIENTO
 */
function testDatosSeguimiento() {
  Logger.log('\n👁️ TEST: Verificando datos en SEGUIMIENTO...\n');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('SEGUIMIENTO');

  if (!sheet) {
    logTest('SEGUIMIENTO', false, 'Hoja no existe');
    return false;
  }

  const data = sheet.getDataRange().getValues();
  const filas = data.length - 1;

  if (filas === 0) {
    logTest('SEGUIMIENTO - Datos', true, 'Sin procesos en seguimiento (normal si es nuevo)', 'warning');
    return true;
  }

  logTest('SEGUIMIENTO - Cantidad', true, `${filas} procesos en seguimiento`);

  const headers = data[0];

  // Verificar estados válidos
  const colEstado = headers.indexOf('ESTADO_INTERES');
  const colPrioridad = headers.indexOf('PRIORIDAD');

  let estadosInvalidos = 0;
  let prioridadesInvalidas = 0;

  for (let i = 1; i < data.length; i++) {
    const estado = data[i][colEstado];
    const prioridad = data[i][colPrioridad];

    if (estado && !TEST_CONFIG.ESTADOS_VALIDOS.INTERES.includes(estado)) {
      estadosInvalidos++;
    }
    if (prioridad && !TEST_CONFIG.ESTADOS_VALIDOS.PRIORIDAD.includes(prioridad)) {
      prioridadesInvalidas++;
    }
  }

  if (estadosInvalidos > 0) {
    logTest('SEGUIMIENTO - Estados', false, `${estadosInvalidos} estados inválidos`);
  } else {
    logTest('SEGUIMIENTO - Estados', true, 'Todos los estados son válidos');
  }

  // Verificar carpetas de Drive
  const colCarpeta = headers.indexOf('CARPETA_DRIVE');
  let sinCarpeta = 0;

  for (let i = 1; i < data.length; i++) {
    if (!data[i][colCarpeta]) sinCarpeta++;
  }

  if (sinCarpeta > 0) {
    logTest('SEGUIMIENTO - Drive', false, `${sinCarpeta} procesos sin carpeta Drive`, 'warning');
  } else if (filas > 0) {
    logTest('SEGUIMIENTO - Drive', true, 'Todos tienen carpeta Drive');
  }

  return true;
}

/**
 * Test 5: Verificar conexión a Drive
 */
function testConexionDrive() {
  Logger.log('\n📁 TEST: Verificando conexión a Google Drive...\n');

  try {
    // Test básico de acceso
    DriveApp.getRootFolder();
    logTest('Drive - Acceso básico', true, 'Acceso a DriveApp OK');

    // Test de carpeta específica
    try {
      const carpeta = DriveApp.getFolderById(TEST_CONFIG.DRIVE_FOLDER_ID);
      const nombreCarpeta = carpeta.getName();
      logTest('Drive - Carpeta raíz', true, `Carpeta "${nombreCarpeta}" accesible`);

      // Contar subcarpetas existentes
      const subcarpetas = carpeta.getFolders();
      let countSubcarpetas = 0;
      while (subcarpetas.hasNext()) {
        subcarpetas.next();
        countSubcarpetas++;
      }

      logTest('Drive - Subcarpetas', true, `${countSubcarpetas} carpetas de procesos encontradas`);

    } catch (e) {
      logTest('Drive - Carpeta raíz', false, `Error accediendo a carpeta: ${e.toString()}`);
      return false;
    }

    return true;

  } catch (e) {
    logTest('Drive - Acceso básico', false, `Sin permisos de Drive: ${e.toString()}`);
    Logger.log('\n⚠️ Ejecuta "autorizarDrive" desde el menú para autorizar permisos');
    return false;
  }
}

/**
 * Test 6: Verificar funciones del API
 */
function testFuncionesAPI() {
  Logger.log('\n🔌 TEST: Verificando funciones del API...\n');

  let todosOK = true;

  // Test getProcesos
  try {
    const result = getProcesos({});
    if (result.procesos && Array.isArray(result.procesos)) {
      logTest('API - getProcesos', true, `Retorna ${result.procesos.length} procesos`);
    } else if (result.error) {
      logTest('API - getProcesos', false, result.error);
      todosOK = false;
    }
  } catch (e) {
    logTest('API - getProcesos', false, e.toString());
    todosOK = false;
  }

  // Test getEstadisticas
  try {
    const stats = getEstadisticas();
    if (stats.totalProcesos !== undefined) {
      logTest('API - getEstadisticas', true, `Total: ${stats.totalProcesos}, Valor: S/ ${stats.valorTotal?.toLocaleString() || 0}`);
    } else {
      logTest('API - getEstadisticas', false, 'No retorna datos correctos');
      todosOK = false;
    }
  } catch (e) {
    logTest('API - getEstadisticas', false, e.toString());
    todosOK = false;
  }

  // Test getSeguimiento
  try {
    const seguimiento = getSeguimiento();
    if (Array.isArray(seguimiento)) {
      logTest('API - getSeguimiento', true, `${seguimiento.length} procesos en seguimiento`);
    } else {
      logTest('API - getSeguimiento', false, 'No retorna array');
      todosOK = false;
    }
  } catch (e) {
    logTest('API - getSeguimiento', false, e.toString());
    todosOK = false;
  }

  // Test getRegionesConProcesos
  try {
    const regiones = getRegionesConProcesos();
    const numRegiones = Object.keys(regiones).length;
    if (numRegiones > 0) {
      logTest('API - getRegiones', true, `${numRegiones} regiones con procesos`);
    } else {
      logTest('API - getRegiones', true, 'Sin datos de regiones (normal si BD vacía)', 'warning');
    }
  } catch (e) {
    logTest('API - getRegiones', false, e.toString());
    todosOK = false;
  }

  // Test getFiltrosEntidades
  try {
    const filtros = getFiltrosEntidades();
    logTest('API - getFiltrosEntidades', true, `${filtros.length} entidades favoritas`);
  } catch (e) {
    logTest('API - getFiltrosEntidades', false, e.toString());
    todosOK = false;
  }

  // Test getFiltrosPalabras
  try {
    const palabras = getFiltrosPalabras();
    logTest('API - getFiltrosPalabras', true, `${palabras.length} palabras clave`);
  } catch (e) {
    logTest('API - getFiltrosPalabras', false, e.toString());
    todosOK = false;
  }

  return todosOK;
}

/**
 * Test 7: Verificar entidades únicas (para filtros)
 */
function testEntidadesUnicas() {
  Logger.log('\n🏢 TEST: Analizando entidades únicas...\n');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('BD_PROCESOS');

  if (!sheet) {
    logTest('Entidades', false, 'BD_PROCESOS no existe');
    return false;
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colEntidad = headers.indexOf('ENTIDAD');

  const entidades = new Set();
  for (let i = 1; i < data.length; i++) {
    if (data[i][colEntidad]) {
      entidades.add(data[i][colEntidad]);
    }
  }

  logTest('Entidades únicas', true, `${entidades.size} entidades diferentes`);

  // Top 15 entidades
  const conteo = {};
  for (let i = 1; i < data.length; i++) {
    const entidad = data[i][colEntidad];
    if (entidad) {
      conteo[entidad] = (conteo[entidad] || 0) + 1;
    }
  }

  Logger.log('\n🏆 Top 15 entidades con más procesos:');
  Object.entries(conteo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([entidad, count], i) => {
      Logger.log(`   ${i + 1}. ${entidad}: ${count} procesos`);
    });

  return true;
}

// ==================== EJECUTAR TODOS LOS TESTS ====================

/**
 * Ejecuta todos los tests y muestra un resumen
 */
function ejecutarTodosLosTests() {
  resetTestResults();

  Logger.log('═'.repeat(60));
  Logger.log('    SEACE INTELLIGENCE - TEST DE CONEXIÓN Y ESTRUCTURA');
  Logger.log('═'.repeat(60));
  Logger.log(`    Fecha: ${new Date().toLocaleString()}`);
  Logger.log('═'.repeat(60));

  // Ejecutar tests
  testHojasExisten();
  testColumnasHojas();
  testDatosBDProcesos();
  testDatosSeguimiento();
  testConexionDrive();
  testFuncionesAPI();
  testEntidadesUnicas();

  // Resumen final
  Logger.log('\n' + '═'.repeat(60));
  Logger.log('    RESUMEN DE TESTS');
  Logger.log('═'.repeat(60));
  Logger.log(`    ✅ Pasados:    ${testResults.passed}`);
  Logger.log(`    ❌ Fallidos:   ${testResults.failed}`);
  Logger.log(`    ⚠️  Advertencias: ${testResults.warnings}`);
  Logger.log('═'.repeat(60));

  const porcentaje = Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100);

  if (testResults.failed === 0) {
    Logger.log('\n🎉 ¡TODOS LOS TESTS PASARON! Tu configuración está correcta.');
  } else {
    Logger.log(`\n⚠️ Hay ${testResults.failed} problemas que resolver.`);
    Logger.log('   Revisa los detalles arriba para corregirlos.');
  }

  // Mostrar en UI
  SpreadsheetApp.getUi().alert(
    `🧪 Resultados del Test\n\n` +
    `✅ Pasados: ${testResults.passed}\n` +
    `❌ Fallidos: ${testResults.failed}\n` +
    `⚠️ Advertencias: ${testResults.warnings}\n\n` +
    `Score: ${porcentaje}%\n\n` +
    `Ver detalles en: Ver > Registros`
  );

  return testResults;
}

/**
 * Obtiene lista de todas las entidades únicas (para usar en filtros)
 */
function getEntidadesUnicas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('BD_PROCESOS');

  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colEntidad = headers.indexOf('ENTIDAD');

  const conteo = {};
  for (let i = 1; i < data.length; i++) {
    const entidad = data[i][colEntidad];
    if (entidad) {
      conteo[entidad] = (conteo[entidad] || 0) + 1;
    }
  }

  // Retornar ordenadas por cantidad de procesos
  return Object.entries(conteo)
    .sort((a, b) => b[1] - a[1])
    .map(([entidad, count]) => ({ entidad, count }));
}

/**
 * Endpoint API para obtener entidades únicas
 */
function apiGetEntidadesUnicas() {
  return getEntidadesUnicas();
}

// ==================== MENÚ ====================

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🧪 Tests SEACE')
    .addItem('Ejecutar TODOS los tests', 'ejecutarTodosLosTests')
    .addSeparator()
    .addItem('Test: Hojas existen', 'testHojasExisten')
    .addItem('Test: Columnas correctas', 'testColumnasHojas')
    .addItem('Test: Datos BD_PROCESOS', 'testDatosBDProcesos')
    .addItem('Test: Datos SEGUIMIENTO', 'testDatosSeguimiento')
    .addItem('Test: Conexión Drive', 'testConexionDrive')
    .addItem('Test: Funciones API', 'testFuncionesAPI')
    .addItem('Test: Entidades únicas', 'testEntidadesUnicas')
    .addToUi();
}
