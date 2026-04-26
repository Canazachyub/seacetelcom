/**
 * =====================================================
 * SEACE INTELLIGENCE - Google Apps Script v3.0
 * =====================================================
 *
 * ARQUITECTURA MEJORADA:
 * - Módulos organizados por responsabilidad
 * - Constantes centralizadas
 * - Helpers reutilizables
 * - Validación consistente
 * - Logging integrado
 * - Procesamiento batch optimizado
 *
 * INSTRUCCIONES:
 * 1. Abre tu Google Sheets
 * 2. Ve a Extensiones > Apps Script
 * 3. Pega todo este código
 * 4. Guarda y despliega como Web App
 * 5. Copia la URL y pégala en la app React
 */

// ==================== CONFIGURACIÓN GLOBAL ====================

const CONFIG = {
  // Nombres de hojas
  SHEETS: {
    IMPORT: 'SEACE_IMPORT',
    BD: 'BD_PROCESOS',
    CRONOGRAMA: 'CRONOGRAMA',
    SEGUIMIENTO: 'SEGUIMIENTO',
    DOCUMENTOS: 'DOCUMENTOS',
    FILTROS_ENTIDADES: 'FILTROS_ENTIDADES',
    FILTROS_PALABRAS: 'FILTROS_PALABRAS',
    REGIONES: 'REGIONES',
    GRUPOS_HISTORICOS: 'GRUPOS_HISTORICOS',
    DATOS_SEACE: 'DATOS_SEACE',
    OCDS_INDEX: 'OCDS_INDEX',  // Índice ligero: nomenclatura -> tender_id -> ocid
    FILTROS_EMPRESAS_ELECTRICAS: 'FILTROS_EMPRESAS_ELECTRICAS',  // v2.0: Empresas eléctricas configurables
    HISTORICOS_DETALLE: 'HISTORICOS_DETALLE',  // v2.0: Detalle completo de históricos multi-año
    POSTORES: 'POSTORES',  // v3.0: Postores de procesos
    ENLACES_RAPIDOS: 'ENLACES_RAPIDOS'  // v3.2: Enlaces de acceso rápido configurables
  },

  // Carpeta raíz de Drive para seguimiento
  DRIVE_FOLDER_ID: '1L1mzM6mTtALDN5waUPIbEhj2zEq7RBZH',

  // Habilitar logging (para debugging)
  DEBUG: false,

  // Tamaño de batch para operaciones masivas
  BATCH_SIZE: 100,

  // Configuración de API OCDS (Open Contracting Data Standard)
  // Documentación: https://contratacionesabiertas.oece.gob.pe/api
  //
  // IMPORTANTE: La API oficial (oece.gob.pe) tiene un WAF que bloquea
  // con HTTP 403 todas las peticiones desde IPs de Google Apps Script.
  // Por eso usamos un Cloudflare Worker como proxy transparente —
  // mismo path, solo cambia el host. El Worker reenvía a oece.gob.pe
  // desde IPs de Cloudflare (no bloqueadas) con headers de navegador real.
  //
  // Código del Worker: ver instrucciones en README. La URL del Worker
  // debe apuntar al mismo path /api/v1 del backend original.
  OCDS_API: {
    BASE_URL: 'https://visitor-organizing-mortgages-defence.trycloudflare.com',
    // Endpoints según documentación oficial
    RELEASES_ENDPOINT: '/releases',           // GET - búsqueda con criterios
    RELEASE_BY_ID: '/release',                // GET /release/{sourceId}/{tenderId}
    RECORDS_ENDPOINT: '/records',             // GET - búsqueda de records
    RECORD_BY_ID: '/record',                  // GET /record/{sourceId}/{tenderId}
    FILES_ENDPOINT: '/files',                 // GET - descargas masivas
    // sourceId correcto según OCIDs reales observados: "seacev3" / "seacev2"
    // (sin guion bajo). El naming "seace_v3" del API antiguo no existe en este endpoint.
    SOURCE_V3: 'seacev3',
    SOURCE_V2: 'seacev2',
    RATE_LIMIT_MS: 1000,
    MAX_RETRIES: 3,
    // User-Agent de navegador real para evadir WAF que bloquea UAs custom.
    // Algunos WAFs de sitios gubernamentales peruanos tienen allowlists de
    // Mozilla/Chrome y devuelven 403 a UAs identificables como bots/scripts.
    BROWSER_UA: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
};

// Columnas de BD_PROCESOS (índices 0-based)
const BD_COLS = {
  ID: 0,
  NOMENCLATURA: 1,
  ENTIDAD: 2,
  REGION: 3,
  OBJETO: 4,
  DESCRIPCION: 5,
  VALOR: 6,
  MONEDA: 7,
  FECHA_PUB: 8,
  VERSION: 9,
  REINICIADO: 10,
  URL: 11,
  // v3.1: Columnas de clasificación automática (poblado manualmente o por
  // Apps Script; actualmente NO lo llena ningún script Python — pueden estar
  // vacías hasta que se corran las utilidades internas de clasificación)
  EMPRESA_CORTA: 12,      // Clasificación corta de empresa eléctrica (manual/vacío)
  ESTADO_FECHA: 13,       // Estado según fecha (ESTA SEMANA, ESTE MES, etc.) (manual/vacío)
  TIPO_SERVICIO: 14       // Tipo de servicio (MANTENIMIENTO, SUPERVISIÓN, etc.) (manual/vacío)
};

// Columnas de SEACE_IMPORT (índices 0-based)
const IMPORT_COLS = {
  NUMERO: 0,
  ENTIDAD: 1,
  FECHA_PUB: 2,
  NOMENCLATURA: 3,
  REINICIADO: 4,
  OBJETO: 5,
  DESCRIPCION: 6,
  VALOR: 7,
  MONEDA: 8,
  VERSION: 9
};

// Etapas del proceso SEACE (en orden)
const ETAPAS_SEACE = [
  'CONVOCATORIA',
  'REGISTRO_PARTICIPANTES',
  'CONSULTAS_OBSERVACIONES',
  'ABSOLUCION_CONSULTAS',
  'INTEGRACION_BASES',
  'PRESENTACION_PROPUESTAS',
  'CALIFICACION_EVALUACION',
  'BUENA_PRO'
];

// Años para tracking histórico comparativo
const AÑOS_HISTORICOS = [2021, 2022, 2023, 2024, 2025];

// Estados posibles para cada etapa
const ESTADOS_ETAPA = {
  PENDIENTE: 'PENDIENTE',
  EN_CURSO: 'EN_CURSO',
  COMPLETADO: 'COMPLETADO',
  VENCIDO: 'VENCIDO',
  NO_APLICA: 'NO_APLICA'
};

// Estados de interés para seguimiento
const ESTADOS_INTERES = {
  PENDIENTE: 'PENDIENTE',
  EN_REVISION: 'EN_REVISION',
  PREPARANDO: 'PREPARANDO',
  PRESENTADO: 'PRESENTADO',
  GANADO: 'GANADO',
  PERDIDO: 'PERDIDO',
  DESCARTADO: 'DESCARTADO'
};

// Prioridades
const PRIORIDADES = {
  ALTA: 'ALTA',
  MEDIA: 'MEDIA',
  BAJA: 'BAJA'
};

// Regiones del Perú con patrones de detección (optimizado)
const REGIONES_PERU = {
  'AMAZONAS': ['AMAZONAS', 'CHACHAPOYAS', 'BAGUA'],
  'ANCASH': ['ANCASH', 'HUARAZ', 'CHIMBOTE'],
  'APURIMAC': ['APURIMAC', 'ABANCAY', 'ANDAHUAYLAS'],
  'AREQUIPA': ['AREQUIPA', 'ELECTROSUR', 'SEAL', 'AUTODEMA'],
  'AYACUCHO': ['AYACUCHO', 'HUAMANGA'],
  'CAJAMARCA': ['CAJAMARCA', 'JAEN'],
  'CALLAO': ['CALLAO'],
  'CUSCO': ['CUSCO', 'ELECTRO SUR ESTE'],
  'HUANCAVELICA': ['HUANCAVELICA'],
  'HUANUCO': ['HUANUCO'],
  'ICA': ['ICA', 'NAZCA', 'PISCO'],
  'JUNIN': ['JUNIN', 'HUANCAYO', 'ELECTROCENTRO'],
  'LA LIBERTAD': ['LA LIBERTAD', 'TRUJILLO', 'HIDRANDINA'],
  'LAMBAYEQUE': ['LAMBAYEQUE', 'CHICLAYO', 'ELECTRONORTE'],
  'LIMA': ['LIMA', 'ENEL', 'LUZ DEL SUR', 'SEDAPAL', 'MINISTERIO'],
  'LORETO': ['LORETO', 'IQUITOS', 'ELECTRO ORIENTE'],
  'MADRE DE DIOS': ['MADRE DE DIOS', 'PUERTO MALDONADO'],
  'MOQUEGUA': ['MOQUEGUA', 'ILO'],
  'PASCO': ['PASCO', 'CERRO DE PASCO'],
  'PIURA': ['PIURA', 'ENOSA', 'SULLANA'],
  'PUNO': ['PUNO', 'JULIACA', 'ELECTRO PUNO'],
  'SAN MARTIN': ['SAN MARTIN', 'TARAPOTO', 'MOYOBAMBA'],
  'TACNA': ['TACNA', 'ELECTROSUR'],
  'TUMBES': ['TUMBES'],
  'UCAYALI': ['UCAYALI', 'PUCALLPA']
};

// ==================== UTILIDADES ====================

const Utils = {
  /**
   * Log condicional para debugging
   */
  log: function(message, data) {
    if (CONFIG.DEBUG) {
      console.log('[SEACE] ' + message, data || '');
    }
  },

  /**
   * Obtiene una hoja por nombre con validación
   */
  getSheet: function(sheetName) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) {
      throw new Error('Hoja no encontrada: ' + sheetName);
    }
    return sheet;
  },

  /**
   * Obtiene una hoja, retorna null si no existe (sin error)
   */
  getSheetSafe: function(sheetName) {
    return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  },

  /**
   * Normaliza fecha a formato YYYY-MM-DD
   */
  normalizarFecha: function(fecha) {
    if (!fecha) return '';

    try {
      let d;

      if (fecha instanceof Date) {
        d = fecha;
      } else if (typeof fecha === 'string') {
        // Intentar formato DD/MM/YYYY HH:MM o DD/MM/YYYY
        const partes = fecha.split(' ')[0].split('/');
        if (partes.length === 3) {
          const dia = parseInt(partes[0], 10);
          const mes = parseInt(partes[1], 10) - 1;
          const anio = parseInt(partes[2], 10);
          d = new Date(anio, mes, dia);
        } else {
          d = new Date(fecha);
        }
      } else if (typeof fecha === 'number') {
        // Podría ser un timestamp o serial de Excel
        d = new Date(fecha);
      } else {
        return '';
      }

      if (isNaN(d.getTime())) return '';

      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return year + '-' + month + '-' + day;
    } catch(e) {
      Utils.log('Error normalizando fecha', e);
      return '';
    }
  },

  /**
   * Normaliza valor monetario
   */
  normalizarValor: function(valor) {
    if (!valor) return 0;
    if (typeof valor === 'number') return valor;
    if (typeof valor === 'string') {
      return parseFloat(valor.replace(/[^\d.-]/g, '')) || 0;
    }
    return 0;
  },

  /**
   * Normaliza código de moneda
   */
  normalizarMoneda: function(moneda) {
    if (!moneda) return 'PEN';

    const monedaUpper = String(moneda).toUpperCase();

    if (monedaUpper.includes('DOLAR') || monedaUpper === 'USD') {
      return 'USD';
    }
    if (monedaUpper.includes('EURO') || monedaUpper === 'EUR') {
      return 'EUR';
    }
    return 'PEN';
  },

  /**
   * Detecta la región basándose en el nombre de la entidad
   */
  detectarRegion: function(entidad) {
    if (!entidad) return 'LIMA';

    const entidadUpper = String(entidad).toUpperCase();

    for (const region in REGIONES_PERU) {
      const patrones = REGIONES_PERU[region];
      for (let i = 0; i < patrones.length; i++) {
        if (entidadUpper.includes(patrones[i])) {
          return region;
        }
      }
    }

    return 'LIMA'; // Default
  },

  /**
   * Crea una respuesta de éxito estándar
   */
  successResponse: function(data, mensaje) {
    return {
      success: true,
      mensaje: mensaje || 'Operación exitosa',
      timestamp: new Date().toISOString(),
      ...data
    };
  },

  /**
   * Crea una respuesta de error estándar
   */
  errorResponse: function(mensaje, detalles) {
    return {
      success: false,
      error: mensaje,
      detalles: detalles || null,
      timestamp: new Date().toISOString()
    };
  },

  /**
   * Convierte filas de datos a objetos usando headers
   */
  rowsToObjects: function(rows, headers) {
    return rows.map(function(row) {
      const obj = {};
      headers.forEach(function(header, i) {
        obj[header] = row[i];
      });
      return obj;
    });
  },

  /**
   * Valida que los parámetros requeridos estén presentes
   */
  validateParams: function(params, required) {
    const missing = [];
    required.forEach(function(param) {
      if (!params[param]) {
        missing.push(param);
      }
    });
    if (missing.length > 0) {
      throw new Error('Parámetros requeridos faltantes: ' + missing.join(', '));
    }
  },

  /**
   * Genera una clave única para deduplicación
   */
  generarClaveUnica: function(nomenclatura, fecha) {
    const fechaStr = Utils.normalizarFecha(fecha);
    return nomenclatura + '|' + fechaStr;
  },

  // ==================== CLASIFICACIÓN AUTOMÁTICA (v3.1) ====================
  // Funciones traducidas del script Python filtro_seace.py

  /**
   * Clasificaciones de empresas eléctricas del Perú (44+ empresas)
   * Actualizado: Enero 2025
   * Mapea patrones de búsqueda (regex) a nombres cortos
   */
  CLASIFICACIONES_EMPRESAS: {
    // ═══════════════════════════════════════════════════════════════
    // 1. DISTRIBUCIÓN ELÉCTRICA (15 empresas)
    // ═══════════════════════════════════════════════════════════════

    // ZONA NORTE
    'HIDRANDINA': ['HIDRANDINA', 'ELECTRONORTEMEDIO', 'NOR.*MEDIO'],
    'ELECTRONORTE': ['ELECTRONORTE'],
    'ENOSA': ['ENOSA', 'NOR.*OESTE', 'ELECTRONOROESTE'],
    'ELECTRO ORIENTE': ['ELECTRO.*ORIENTE', 'ORIENTE.*ELECTR'],
    'ELECTRO TOCACHE': ['TOCACHE'],
    'ELECTRO DUNAS': ['ELECTRO.*DUNAS', 'DUNAS'],

    // ZONA CENTRO
    'ELECTROCENTRO': ['ELECTROCENTRO', 'ELECTRO.*CENTRO'],
    'LUZ DEL SUR': ['LUZ.*SUR'],
    'ENEL': ['ENEL.*DISTRIB', 'EDELNOR'],

    // ZONA SUR
    'ELSE': ['ELSE', 'SUR.*ESTE', 'ELECTRO.*SUR.*ESTE'],
    'SEAL': ['SEAL', 'SUR.*OESTE'],
    'ELECTROSUR': ['ELECTROSUR'],
    'ELECTRO PUNO': ['ELECTRO.*PUNO', 'PUNO.*ELECTRI'],

    // ZONA SELVA
    'ELECTRO UCAYALI': ['ELECTRO.*UCAYALI', 'UCAYALI.*ELECTR'],
    'ADINELSA': ['ADINELSA'],

    // ═══════════════════════════════════════════════════════════════
    // 2. GENERACIÓN ELÉCTRICA (17 empresas)
    // ═══════════════════════════════════════════════════════════════

    // HIDROELÉCTRICAS
    'ELECTROPERU': ['ELECTROPERU', 'MANTARO', 'RESTITUCION'],
    'EGENOR': ['EGENOR', 'CARHUAQUERO'],
    'EGEMSA': ['EGEMSA', 'MACHUPICCHU', 'MACHU.*PICCHU', 'SANTA.*TERESA'],
    'EGASA': ['EGASA', 'CHARCANI', 'GENERACION.*AREQUIPA'],
    'SAN GABAN': ['SAN.*GABAN'],
    'EGESUR': ['EGESUR', 'ARICOTA'],
    'EGEJUNIN': ['EGEJUNIN', 'PACHACHACA'],
    'CHINANGO': ['CHINANGO'],
    'STATKRAFT': ['STATKRAFT', 'CHEVES'],
    'ENEL GENERACION': ['ENEL.*GENERACI', 'EDEGEL', 'HUINCO', 'MATUCANA', 'CALLAHUANCA'],
    'ENERSUR': ['ENERSUR', 'YUNCAN'],
    'EGEPSA': ['EGEPSA', 'PANGOA'],

    // TÉRMICAS
    'KALLPA': ['KALLPA'],
    'FENIX POWER': ['FENIX.*POWER', 'FENIX'],
    'TERMOCHILCA': ['TERMOCHILCA'],

    // ═══════════════════════════════════════════════════════════════
    // 3. EMPRESAS MUNICIPALES (7 empresas)
    // ═══════════════════════════════════════════════════════════════
    'EMSEU': ['EMSEU', 'UTCUBAMBA'],
    'EMSEUSA': ['EMSEUSA'],
    'SERSA': ['SERSA', 'RIOJA.*ELECTR', 'ELECTR.*RIOJA'],
    'ESEMPAT': ['ESEMPAT', 'PATIVILCA'],
    'EMSEM': ['EMSEM', 'PARAMONGA'],
    'COELVISAC': ['COELVISAC', 'VISCHONGO'],
    'CHAVIMOCHIC': ['CHAVIMOCHIC'],

    // ═══════════════════════════════════════════════════════════════
    // 4. ORGANISMOS REGULADORES (3)
    // ═══════════════════════════════════════════════════════════════
    'OSINERGMIN': ['OSINERGMIN'],
    'COES': ['COES', 'SINAC'],
    'MINEM': ['MINEM', 'MINISTERIO.*ENERGIA.*MINAS'],

    // ═══════════════════════════════════════════════════════════════
    // 5. TRANSMISIÓN ELÉCTRICA (4+ empresas)
    // ═══════════════════════════════════════════════════════════════
    'PLUZ ENERGIA': ['PLUZ'],
    'TRANSMANTARO': ['TRANSMANTARO'],
    'REDESUR': ['REDESUR', 'RED.*ELECTRICA.*SUR'],
    'ISA PERU': ['ISA.*PERU', 'INTERCONEXION.*ELECTRICA'],

    // ═══════════════════════════════════════════════════════════════
    // 6. OTRAS EMPRESAS
    // ═══════════════════════════════════════════════════════════════
    'VILLACURI': ['VILLACURI']
  },

  /**
   * Categorías de tipo de servicio (sector eléctrico)
   * Mapea palabras clave a categorías - Actualizado Enero 2025
   */
  CATEGORIAS_SERVICIO: {
    // SERVICIOS TÉCNICOS
    'MANTENIMIENTO': ['MANTENIMIENTO', 'REPARACION', 'CORRECTIVO', 'PREVENTIVO', 'REFACCION'],
    'SUPERVISIÓN': ['SUPERVISION', 'FISCALIZACION', 'MONITOREO', 'INSPECCION'],
    'INSTALACIÓN': ['INSTALACION', 'MONTAJE', 'IMPLEMENTACION', 'CONSTRUCCION'],
    'CONSULTORÍA': ['CONSULTORIA', 'ASESORIA', 'ESTUDIO', 'DISEÑO', 'INGENIERIA', 'EXPEDIENTE'],

    // INFRAESTRUCTURA ELÉCTRICA
    'LUMINARIAS/AP': ['LUMINARIA', 'ALUMBRADO', 'LED', 'SODIO', 'VAPOR', 'POSTE'],
    'REDES MT/BT': ['MEDIA TENSION', 'BAJA TENSION', 'REDES', 'LINEA', 'CABLE', 'CONDUCTOR'],
    'SUBESTACIONES': ['SUBESTACION', 'TRANSFORMADOR', 'SET', 'SED', 'CELDA'],
    'TRANSMISIÓN': ['TRANSMISION', 'ALTA TENSION', 'TORRE', 'INTERCONEXION'],
    'GENERACIÓN': ['GENERADOR', 'CENTRAL', 'GRUPO', 'TURBINA', 'HIDROELECTRICA', 'TERMICA'],

    // OPERACIÓN COMERCIAL
    'PÉRDIDAS': ['PERDIDA', 'HURTO', 'FRAUDE', 'ROBO', 'CLANDESTINO', 'ILEGAL'],
    'NTCSE/CALIDAD': ['NTCSE', 'CALIDAD', 'DEFICIENCIA', 'OBSERVACION', 'TENSION', 'FRECUENCIA'],
    'COMERCIAL': ['COMERCIAL', 'COBRANZA', 'FACTURACION', 'CLIENTE', 'ATENCION', 'RECLAMO'],
    'MEDICIÓN': ['MEDICION', 'MEDIDOR', 'REGISTRADOR', 'CONTADOR', 'TELEMEDICION', 'LECTURA'],
    'CORTE/RECONEXION': ['CORTE', 'RECONEXION', 'SUSPENSION', 'RETIRO'],

    // SOPORTE
    'SISTEMAS/TI': ['SISTEMA', 'SOFTWARE', 'HOSTING', 'CLOUD', 'INFORMATICA', 'APLICATIVO', 'ERP', 'SCADA'],
    'LOGÍSTICA': ['LOGISTICA', 'ALMACEN', 'TRANSPORTE', 'CUSTODIA', 'DISTRIBUCION', 'FLOTA'],
    'LEGAL/SERVIDUMBRE': ['SERVIDUMBRE', 'LEGAL', 'SANEAMIENTO', 'NOTARIAL', 'JUDICIAL'],
    'ADMINISTRATIVO': ['ADMINISTRATIVO', 'PERSONAL', 'RECURSOS HUMANOS', 'LIMPIEZA', 'SEGURIDAD'],
    'CAPACITACIÓN': ['CAPACITACION', 'ENTRENAMIENTO', 'FORMACION', 'CURSO', 'TALLER'],

    // PROYECTOS
    'OBRAS CIVILES': ['OBRA CIVIL', 'EXCAVACION', 'CIMENTACION', 'ZANJA', 'CANALIZACION'],
    'ELECTRIFICACIÓN': ['ELECTRIFICACION', 'RURAL', 'AISLADA', 'SER', 'FISE'],
    'EXPANSIÓN': ['EXPANSION', 'AMPLIACION', 'NUEVO SUMINISTRO', 'CONEXION NUEVA']
  },

  /**
   * Clasifica la empresa en una categoría corta
   * @param {string} nombreEntidad - Nombre de la entidad
   * @returns {string} Nombre corto de la empresa o vacío si no es eléctrica
   */
  clasificarEmpresa: function(nombreEntidad) {
    if (!nombreEntidad) return '';

    const nombre = String(nombreEntidad).toUpperCase();

    for (const categoria in Utils.CLASIFICACIONES_EMPRESAS) {
      const patrones = Utils.CLASIFICACIONES_EMPRESAS[categoria];
      for (let i = 0; i < patrones.length; i++) {
        try {
          const regex = new RegExp(patrones[i], 'i');
          if (regex.test(nombre)) {
            return categoria;
          }
        } catch (e) {
          // Si el patrón no es válido como regex, usar includes
          if (nombre.includes(patrones[i])) {
            return categoria;
          }
        }
      }
    }

    // Verificar si es otra empresa eléctrica genérica
    if (nombre.includes('ELECTR') || nombre.includes('ENERGIA')) {
      return 'OTRA ELECTRICA';
    }

    return ''; // No es empresa eléctrica
  },

  /**
   * Clasifica el proceso según su fecha de publicación
   * @param {Date|string} fechaStr - Fecha de publicación
   * @returns {string} Estado de fecha (ESTA SEMANA, ESTE MES, etc.)
   */
  clasificarEstadoFecha: function(fechaStr) {
    try {
      const hoy = new Date();

      if (!fechaStr) return 'SIN FECHA';

      let fecha;

      // Parsear fecha
      if (fechaStr instanceof Date) {
        fecha = fechaStr;
      } else if (typeof fechaStr === 'string') {
        // Intentar formato DD/MM/YYYY HH:MM
        const parts = fechaStr.split(' ')[0].split('/');
        if (parts.length === 3) {
          fecha = new Date(parts[2], parts[1] - 1, parts[0]);
        } else {
          fecha = new Date(fechaStr);
        }
      } else {
        fecha = new Date(fechaStr);
      }

      if (isNaN(fecha.getTime())) return 'FECHA INVÁLIDA';

      const diasDiff = Math.floor((hoy - fecha) / (1000 * 60 * 60 * 24));

      if (diasDiff < 0) return 'FUTURO';
      if (diasDiff <= 7) return 'ESTA SEMANA';
      if (diasDiff <= 30) return 'ESTE MES';
      if (diasDiff <= 90) return 'ÚLTIMO TRIMESTRE';
      return 'ANTIGUO';

    } catch (e) {
      return 'ERROR FECHA';
    }
  },

  /**
   * Clasifica el tipo de servicio basado en la descripción
   * @param {string} descripcion - Descripción del objeto del proceso
   * @returns {string} Tipo de servicio clasificado
   */
  clasificarTipoServicio: function(descripcion) {
    if (!descripcion) return 'NO ESPECIFICADO';

    const desc = String(descripcion).toUpperCase();

    for (const categoria in Utils.CATEGORIAS_SERVICIO) {
      const keywords = Utils.CATEGORIAS_SERVICIO[categoria];
      for (let i = 0; i < keywords.length; i++) {
        if (desc.includes(keywords[i])) {
          return categoria;
        }
      }
    }

    return 'OTROS SERVICIOS';
  }
};

// ==================== API REST ====================

/**
 * Maneja peticiones GET
 */
function doGet(e) {
  const startTime = new Date();
  const action = e.parameter.action || 'getProcesos';
  const params = e.parameter;

  Utils.log('doGet', { action, params });

  let result;

  try {
    result = Router.handle(action, params, 'GET');
  } catch(error) {
    result = Utils.errorResponse(error.message || error.toString());
  }

  Utils.log('doGet response time', (new Date() - startTime) + 'ms');

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Maneja peticiones POST
 */
function doPost(e) {
  const startTime = new Date();
  let data = {};

  try {
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }
  } catch(parseError) {
    Utils.log('Error parsing POST data', parseError);
  }

  // Merge con parámetros de URL
  if (e.parameter) {
    Object.keys(e.parameter).forEach(function(key) {
      if (!data[key]) {
        data[key] = e.parameter[key];
      }
    });
  }

  const action = data.action;
  Utils.log('doPost', { action, data });

  let result;

  try {
    result = Router.handle(action, data, 'POST');
  } catch(error) {
    result = Utils.errorResponse(error.message || error.toString());
  }

  Utils.log('doPost response time', (new Date() - startTime) + 'ms');

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Router central para manejar todas las acciones
 */
const Router = {
  handle: function(action, params, method) {
    // Si viene un parámetro 'data' serializado como JSON, parsearlo
    if (params.data && typeof params.data === 'string') {
      try {
        const parsedData = JSON.parse(params.data);
        // Merge los datos parseados con los params existentes
        Object.keys(parsedData).forEach(function(key) {
          params[key] = parsedData[key];
        });
        // Eliminar el parámetro 'data' ya procesado
        delete params.data;
        Utils.log('Router: Datos complejos parseados desde JSON', parsedData);
      } catch (error) {
        Utils.log('Router: Error parseando JSON data', error.toString());
        return Utils.errorResponse('Error parseando datos JSON: ' + error.message);
      }
    }

    const routes = {
      // === LECTURA ===
      'getProcesos': { handler: Procesos.getAll, method: 'GET' },
      'getProcesoByNomenclatura': { handler: Procesos.getByNomenclatura, method: 'GET' },
      'getCronograma': { handler: Cronograma.get, method: 'GET' },
      'getSeguimiento': { handler: Seguimiento.getAll, method: 'GET' },
      'getSeguimientoDetalle': { handler: Seguimiento.getDetalle, method: 'GET' },
      'getDocumentos': { handler: Documentos.get, method: 'GET' },
      'getFiltrosEntidades': { handler: Filtros.getEntidades, method: 'GET' },
      'getFiltrosPalabras': { handler: Filtros.getPalabras, method: 'GET' },
      'getEstadisticas': { handler: Estadisticas.get, method: 'GET' },
      'getRegiones': { handler: Estadisticas.getRegiones, method: 'GET' },
      'getEntidadesUnicas': { handler: Estadisticas.getEntidadesUnicas, method: 'GET' },

      // === GRUPOS HISTÓRICOS ===
      'getGruposHistoricos': { handler: GruposHistoricos.getAll, method: 'GET' },
      'getGrupoHistorico': { handler: GruposHistoricos.get, method: 'GET' },
      'getGrupoByNomenclatura': { handler: GruposHistoricos.getByNomenclatura, method: 'GET' },
      'listarGruposConStats': { handler: GruposHistoricos.listarConStats, method: 'GET' },
      'getDetalleGrupo': { handler: GruposHistoricos.getDetalle, method: 'GET' },
      'getEstadoScrapingGrupo': { handler: GruposHistoricos.getEstadoScraping, method: 'GET' },

      // === OCDS API (Consulta en tiempo real) ===
      'getProcesoOCDS': { handler: OCDS_API.getProceso, method: 'GET' },
      'getByTenderId': { handler: OCDS_API.getByTenderId, method: 'GET' },
      'getByOcid': { handler: OCDS_API.getByOcid, method: 'GET' },
      'getPostoresOCDS': { handler: OCDS_API.getPostores, method: 'GET' },
      'getDocumentosOCDS': { handler: OCDS_API.getDocumentos, method: 'GET' },
      'getCronogramaOCDS': { handler: OCDS_API.getCronograma, method: 'GET' },
      'listarProcesosOCDS': { handler: OCDS_API.listarProcesos, method: 'GET' },
      'sincronizarHistoricoIndividual': { handler: OCDS_API.sincronizarHistoricoIndividual, method: 'ANY' },
      'sincronizarGrupoHistorico': { handler: OCDS_API.sincronizarGrupoHistorico, method: 'ANY' },

      // === ESCRITURA ===
      'addSeguimiento': { handler: Seguimiento.add, method: 'ANY' },
      'updateSeguimiento': { handler: Seguimiento.update, method: 'ANY' },
      'deleteSeguimiento': { handler: Seguimiento.delete, method: 'ANY' },
      'updateEtapaSeguimiento': { handler: Seguimiento.updateEtapa, method: 'ANY' },
      'addDocumento': { handler: Documentos.add, method: 'ANY' },
      'updateDocumentoUrl': { handler: Documentos.updateUrl, method: 'ANY' },

      // === POSTORES ===
      'getPostores': { handler: Postores.get, method: 'GET' },
      'addPostor': { handler: Postores.add, method: 'ANY' },
      'updatePostor': { handler: Postores.update, method: 'ANY' },
      'deletePostor': { handler: Postores.delete, method: 'ANY' },

      'addFiltroEntidad': { handler: Filtros.addEntidad, method: 'ANY' },
      'addFiltroPalabra': { handler: Filtros.addPalabra, method: 'ANY' },
      'toggleFiltro': { handler: Filtros.toggle, method: 'ANY' },
      'procesarImport': { handler: Import.procesar, method: 'ANY' },
      'crearCarpetaDrive': { handler: Drive.crearCarpetaProceso, method: 'ANY' },
      'listarArchivosDrive': { handler: Drive.listarArchivos, method: 'GET' },

      // === UPLOAD DE ARCHIVOS ===
      'uploadFileToDrive': { handler: Drive.uploadFileToDrive, method: 'ANY' },
      'uploadAndRegisterDocument': { handler: Documentos.uploadAndRegister, method: 'ANY' },

      // === GRUPOS HISTÓRICOS (ESCRITURA) ===
      'crearGrupoHistorico': { handler: GruposHistoricos.crear, method: 'ANY' },
      'updateGrupoHistorico': { handler: GruposHistoricos.update, method: 'ANY' },
      'deleteGrupoHistorico': { handler: GruposHistoricos.delete, method: 'ANY' },

      // === DRIVE GRUPOS ===
      'crearCarpetaGrupoHistorico': { handler: Drive.crearCarpetaGrupoHistorico, method: 'ANY' },
      'migrarCarpetaExistente': { handler: Drive.migrarCarpetaExistente, method: 'ANY' },

      // === OCDS INDEX ===
      'actualizarIndiceOCDS': { handler: OCDS_INDEX.actualizar, method: 'ANY' },
      'getOcdsIndexStats': { handler: OCDS_INDEX.stats, method: 'GET' },

      // === v2.0: EMPRESAS ELÉCTRICAS ===
      'getEmpresasElectricas': { handler: EmpresasElectricas.getAll, method: 'GET' },
      'toggleEmpresaElectrica': { handler: EmpresasElectricas.toggle, method: 'ANY' },
      'addEmpresaElectrica': { handler: EmpresasElectricas.add, method: 'ANY' },

      // === v2.0: SEGUIMIENTO DETALLE COMPLETO ===
      'getSeguimientoDetalleCompleto': { handler: SeguimientoV2.getDetalleCompleto, method: 'GET' },

      // === v2.0: HISTÓRICOS DETALLE ===
      'guardarHistoricoExtraidoIA': { handler: HistoricosDetalle.guardarExtraidoIA, method: 'ANY' },
      'getComparativaHistoricos': { handler: HistoricosDetalle.getComparativa, method: 'GET' },

      // === v3.2: ENLACES RÁPIDOS Y SCRAPING SEACE (stubs/lecturas ligeras) ===
      'getEnlacesRapidos': { handler: EnlacesRapidos.getAll, method: 'GET' },
      'getDatosSeace': { handler: DatosSeaceLookup.getByNomenclatura, method: 'GET' },
      'guardarDatosSeace': { handler: DatosSeaceLookup.guardar, method: 'ANY' },
      'getEstadoScraping': { handler: EstadoScraping.get, method: 'GET' },

      // === BUSCADOR DE HISTÓRICOS ===
      'buscarHistoricosCandidatos': { handler: Historicos.buscarCandidatos, method: 'GET' },

      // === DIAGNÓSTICO DEL SISTEMA ===
      'healthCheck': { handler: Diagnostico.healthCheck, method: 'GET' },
      'debugBuscarIndice': { handler: Diagnostico.debugBuscarIndice, method: 'GET' }
    };

    const route = routes[action];

    if (!route) {
      throw new Error('Acción no válida: ' + action);
    }

    // Verificar método si es necesario
    if (route.method !== 'ANY' && route.method !== method) {
      throw new Error('Método no permitido para esta acción');
    }

    return route.handler(params);
  }
};

// ==================== MÓDULO: PROCESOS ====================

const Procesos = {
  /**
   * Obtiene todos los procesos con filtros opcionales
   */
  getAll: function(params) {
    const sheet = Utils.getSheet(CONFIG.SHEETS.BD);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    let procesos = Utils.rowsToObjects(data.slice(1), headers)
      .filter(function(p) { return p.NOMENCLATURA; });

    // Aplicar filtros
    procesos = Procesos._aplicarFiltros(procesos, params);

    return {
      success: true,
      total: procesos.length,
      procesos: procesos
    };
  },

  /**
   * Obtiene un proceso por su nomenclatura
   */
  getByNomenclatura: function(params) {
    Utils.validateParams(params, ['nomenclatura']);

    const result = Procesos.getAll({ busqueda: params.nomenclatura });
    const proceso = result.procesos.find(function(p) {
      return p.NOMENCLATURA === params.nomenclatura;
    });

    if (!proceso) {
      return Utils.errorResponse('Proceso no encontrado');
    }

    return Utils.successResponse({ proceso: proceso });
  },

  /**
   * Aplica filtros a la lista de procesos
   */
  _aplicarFiltros: function(procesos, params) {
    if (!params) return procesos;

    // Filtro por región
    if (params.region) {
      procesos = procesos.filter(function(p) {
        return p.REGION === params.region;
      });
    }

    // Filtro por entidad (búsqueda parcial)
    if (params.entidad) {
      const entidadLower = params.entidad.toLowerCase();
      procesos = procesos.filter(function(p) {
        return p.ENTIDAD && p.ENTIDAD.toLowerCase().includes(entidadLower);
      });
    }

    // Filtro por objeto
    if (params.objeto) {
      procesos = procesos.filter(function(p) {
        return p.OBJETO === params.objeto;
      });
    }

    // Búsqueda global (descripción, entidad, nomenclatura)
    if (params.busqueda) {
      const busqueda = params.busqueda.toLowerCase();
      procesos = procesos.filter(function(p) {
        return (p.DESCRIPCION && p.DESCRIPCION.toLowerCase().includes(busqueda)) ||
              (p.ENTIDAD && p.ENTIDAD.toLowerCase().includes(busqueda)) ||
              (p.NOMENCLATURA && p.NOMENCLATURA.toLowerCase().includes(busqueda));
      });
    }

    // Filtro por palabras clave (separadas por coma)
    if (params.palabrasClave) {
      const palabras = params.palabrasClave.split(',').map(function(p) {
        return p.trim().toLowerCase();
      });
      procesos = procesos.filter(function(p) {
        return palabras.some(function(palabra) {
          return p.DESCRIPCION && p.DESCRIPCION.toLowerCase().includes(palabra);
        });
      });
    }

    // Filtro por rango de fecha
    if (params.fechaDesde) {
      const desde = new Date(params.fechaDesde);
      procesos = procesos.filter(function(p) {
        return new Date(p.FECHA_PUB) >= desde;
      });
    }

    if (params.fechaHasta) {
      const hasta = new Date(params.fechaHasta);
      procesos = procesos.filter(function(p) {
        return new Date(p.FECHA_PUB) <= hasta;
      });
    }

    // Filtro por rango de valor
    if (params.valorMin) {
      const min = parseFloat(params.valorMin);
      procesos = procesos.filter(function(p) {
        return (p.VALOR || 0) >= min;
      });
    }

    if (params.valorMax) {
      const max = parseFloat(params.valorMax);
      procesos = procesos.filter(function(p) {
        return (p.VALOR || 0) <= max;
      });
    }

    return procesos;
  }
};

// ==================== MÓDULO: IMPORT ====================

const Import = {
  /**
   * Procesa registros de SEACE_IMPORT a BD_PROCESOS
   * Usa clave compuesta (NOMENCLATURA + FECHA) para permitir reiniciados
   */
  procesar: function(params) {
    const importSheet = Utils.getSheetSafe(CONFIG.SHEETS.IMPORT);
    const bdSheet = Utils.getSheetSafe(CONFIG.SHEETS.BD);

    if (!importSheet || !bdSheet) {
      return Utils.errorResponse('Hojas SEACE_IMPORT o BD_PROCESOS no encontradas');
    }

    const importData = importSheet.getDataRange().getValues();
    const existingData = bdSheet.getDataRange().getValues();

    // Construir set de claves existentes
    const existingKeys = Import._buildExistingKeys(existingData);

    // Procesar nuevos registros
    const resultado = Import._procesarRegistros(importData, existingKeys, bdSheet);

    return Utils.successResponse({
      nuevos: resultado.nuevos,
      saltados: resultado.saltados,
      sinNomenclatura: resultado.sinNomenclatura,
      duplicadosExactos: resultado.duplicados,
      errores: resultado.errores,
      totalEnBD: resultado.lastRow - 1
    }, 'Procesados ' + resultado.nuevos + ' nuevos registros');
  },

  /**
   * Construye el set de claves existentes en BD_PROCESOS
   */
  _buildExistingKeys: function(existingData) {
    const keys = new Set();

    for (let i = 1; i < existingData.length; i++) {
      const nomenclatura = existingData[i][BD_COLS.NOMENCLATURA];
      const fechaPub = existingData[i][BD_COLS.FECHA_PUB];

      if (nomenclatura) {
        const key = Utils.generarClaveUnica(nomenclatura, fechaPub);
        keys.add(key);
      }
    }

    return keys;
  },

  /**
   * Procesa los registros de importación
   */
  _procesarRegistros: function(importData, existingKeys, bdSheet) {
    const stats = {
      nuevos: 0,
      saltados: 0,
      sinNomenclatura: 0,
      duplicados: 0,
      errores: 0,
      lastRow: bdSheet.getLastRow()
    };

    const newRows = [];

    for (let i = 1; i < importData.length; i++) {
      const row = importData[i];

      try {
        const resultado = Import._procesarFila(row, existingKeys, stats.lastRow + newRows.length);

        if (resultado.skip) {
          stats.saltados++;
          if (resultado.reason === 'sin_nomenclatura') {
            stats.sinNomenclatura++;
          } else if (resultado.reason === 'duplicado') {
            stats.duplicados++;
          }
        } else if (resultado.newRow) {
          newRows.push(resultado.newRow);
          existingKeys.add(resultado.key);
          stats.nuevos++;
        }
      } catch(e) {
        Utils.log('Error procesando fila ' + i, e);
        stats.errores++;
        stats.saltados++;
      }
    }

    // Insertar en batch si hay nuevos registros
    if (newRows.length > 0) {
      Import._insertBatch(bdSheet, newRows, stats.lastRow);
      stats.lastRow += newRows.length;
    }

    return stats;
  },

  /**
   * Procesa una fila individual
   */
  _procesarFila: function(row, existingKeys, nextId) {
    const nomenclatura = row[IMPORT_COLS.NOMENCLATURA];
    const fechaPubRaw = row[IMPORT_COLS.FECHA_PUB];

    // Validar nomenclatura
    if (!nomenclatura) {
      return { skip: true, reason: 'sin_nomenclatura' };
    }

    // Generar clave única
    const uniqueKey = Utils.generarClaveUnica(nomenclatura, fechaPubRaw);

    // Verificar duplicado
    if (existingKeys.has(uniqueKey)) {
      return { skip: true, reason: 'duplicado' };
    }

    // Procesar campos básicos
    const entidad = row[IMPORT_COLS.ENTIDAD] || '';
    const region = Utils.detectarRegion(entidad);
    const valor = Utils.normalizarValor(row[IMPORT_COLS.VALOR]);
    const moneda = Utils.normalizarMoneda(row[IMPORT_COLS.MONEDA]);
    const objeto = row[IMPORT_COLS.OBJETO] || '';
    const descripcion = row[IMPORT_COLS.DESCRIPCION] || '';

    // v3.1: Clasificación automática (traducido del script Python)
    const empresaCorta = Utils.clasificarEmpresa(entidad);
    const estadoFecha = Utils.clasificarEstadoFecha(fechaPubRaw);
    const tipoServicio = Utils.clasificarTipoServicio(objeto || descripcion);

    const newRow = [
      nextId + 1,                        // ID
      nomenclatura,                      // NOMENCLATURA
      entidad,                           // ENTIDAD
      region,                            // REGION
      objeto,                            // OBJETO
      descripcion,                       // DESCRIPCION
      valor,                             // VALOR
      moneda,                            // MONEDA
      fechaPubRaw,                       // FECHA_PUB
      row[IMPORT_COLS.VERSION] || '',    // VERSION
      row[IMPORT_COLS.REINICIADO] || '', // REINICIADO
      '',                                // URL
      empresaCorta,                      // EMPRESA_CORTA (v3.1)
      estadoFecha,                       // ESTADO_FECHA (v3.1)
      tipoServicio                       // TIPO_SERVICIO (v3.1)
    ];

    return { skip: false, newRow: newRow, key: uniqueKey };
  },

  /**
   * Inserta filas en batch (más eficiente que appendRow)
   */
  _insertBatch: function(sheet, rows, startRow) {
    if (rows.length === 0) return;

    const numCols = rows[0].length;
    const range = sheet.getRange(startRow + 1, 1, rows.length, numCols);
    range.setValues(rows);
  }
};

// ==================== MÓDULO: SEGUIMIENTO ====================

const Seguimiento = {
  /**
   * Obtiene todos los procesos en seguimiento
   */
  getAll: function(params) {
    const sheet = Utils.getSheetSafe(CONFIG.SHEETS.SEGUIMIENTO);
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const seguimientos = data.slice(1)
      .map(function(row) {
        const obj = {};
        headers.forEach(function(header, i) {
          obj[header] = row[i];
        });

        // Transformar columnas de etapas a objetos anidados con años históricos
        ETAPAS_SEACE.forEach(function(etapa) {
          const estadoKey = etapa + '_ESTADO';
          const notasKey = etapa + '_NOTAS';

          if (obj[estadoKey] !== undefined) {
            // Crear objeto base para la etapa
            obj[etapa] = {
              ESTADO: obj[estadoKey] || ESTADOS_ETAPA.PENDIENTE,
              NOTAS: obj[notasKey] || '',
              AÑOS: {}
            };

            // Agregar datos por año
            AÑOS_HISTORICOS.forEach(function(año) {
              const inicioKey = etapa + '_' + año + '_INICIO';
              const finKey = etapa + '_' + año + '_FIN';
              const linkKey = etapa + '_' + año + '_LINK';

              obj[etapa].AÑOS[año] = {
                INICIO: obj[inicioKey] || null,
                FIN: obj[finKey] || null,
                LINK: obj[linkKey] || ''
              };

              // Limpiar las columnas individuales
              delete obj[inicioKey];
              delete obj[finKey];
              delete obj[linkKey];
            });

            delete obj[estadoKey];
            delete obj[notasKey];
          }
        });

        return obj;
      })
      .filter(function(s) { return s.NOMENCLATURA; });

    return seguimientos;
  },

  /**
   * Obtiene detalle de un proceso en seguimiento
   */
  getDetalle: function(params) {
    Utils.validateParams(params, ['nomenclatura']);

    const seguimientos = Seguimiento.getAll();
    const seguimiento = seguimientos.find(function(s) {
      return s.NOMENCLATURA === params.nomenclatura;
    });

    if (!seguimiento) {
      return Utils.errorResponse('Proceso no encontrado en seguimiento');
    }

    // Agregar cronograma y documentos
    seguimiento.CRONOGRAMA = Cronograma.get({ nomenclatura: params.nomenclatura });
    seguimiento.DOCUMENTOS = Documentos.get({ nomenclatura: params.nomenclatura });

    return Utils.successResponse({ seguimiento: seguimiento });
  },

  /**
   * Agrega un proceso a seguimiento
   */
  add: function(params) {
    Utils.validateParams(params, ['nomenclatura']);

    const sheet = Utils.getSheet(CONFIG.SHEETS.SEGUIMIENTO);
    const nomenclatura = params.nomenclatura;

    // Verificar si ya existe
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === nomenclatura) {
        return Utils.errorResponse('Ya existe en seguimiento', { exists: true });
      }
    }

    // Crear carpeta en Drive
    let carpetaInfo = { url: '', error: null };
    try {
      const carpetaResult = Drive.crearCarpetaProceso({
        nomenclatura: nomenclatura,
        entidad: params.entidad || ''
      });
      if (carpetaResult.success) {
        carpetaInfo.url = carpetaResult.url;
      } else {
        carpetaInfo.error = carpetaResult.error;
      }
    } catch(e) {
      carpetaInfo.error = 'Error Drive: ' + e.toString();
    }

    // Obtener información del proceso
    const procesoResult = Procesos.getByNomenclatura({ nomenclatura: nomenclatura });
    const proceso = procesoResult.proceso || {};

    // Crear fila de seguimiento
    const newRow = Seguimiento._buildSeguimientoRow(params, proceso, carpetaInfo.url);
    sheet.appendRow(newRow);

    return Utils.successResponse({
      carpetaUrl: carpetaInfo.url,
      driveError: carpetaInfo.error
    }, carpetaInfo.error ?
      'Agregado sin carpeta Drive: ' + carpetaInfo.error :
      'Agregado a seguimiento correctamente'
    );
  },

  /**
   * Construye la fila para insertar en seguimiento
   */
  _buildSeguimientoRow: function(params, proceso, carpetaUrl) {
    const row = [
      params.nomenclatura,
      proceso.ENTIDAD || params.entidad || '',
      proceso.OBJETO || params.objeto || '',
      proceso.VALOR || params.valor || 0,
      proceso.REGION || params.region || '',
      params.estado || ESTADOS_INTERES.PENDIENTE,
      params.prioridad || PRIORIDADES.MEDIA,
      params.responsable || '',
      params.notas || '',
      new Date(),
      carpetaUrl
    ];

    // Agregar columnas de etapas (4 por etapa: estado, inicio, fin, notas)
    ETAPAS_SEACE.forEach(function() {
      row.push(ESTADOS_ETAPA.PENDIENTE, '', '', '');
    });

    return row;
  },

  /**
   * Actualiza un proceso en seguimiento
   */
  update: function(params) {
    Utils.validateParams(params, ['nomenclatura']);

    const sheet = Utils.getSheet(CONFIG.SHEETS.SEGUIMIENTO);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // Encontrar índices de columnas
    const colMap = {
      estado: headers.indexOf('ESTADO_INTERES') + 1,
      prioridad: headers.indexOf('PRIORIDAD') + 1,
      notas: headers.indexOf('NOTAS') + 1,
      responsable: headers.indexOf('RESPONSABLE') + 1
    };

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === params.nomenclatura) {
        if (params.estado && colMap.estado > 0) {
          sheet.getRange(i + 1, colMap.estado).setValue(params.estado);
        }
        if (params.prioridad && colMap.prioridad > 0) {
          sheet.getRange(i + 1, colMap.prioridad).setValue(params.prioridad);
        }
        if (params.notas !== undefined && colMap.notas > 0) {
          sheet.getRange(i + 1, colMap.notas).setValue(params.notas);
        }
        if (params.responsable !== undefined && colMap.responsable > 0) {
          sheet.getRange(i + 1, colMap.responsable).setValue(params.responsable);
        }
        return Utils.successResponse({}, 'Seguimiento actualizado');
      }
    }

    return Utils.errorResponse('Proceso no encontrado en seguimiento');
  },

  /**
   * Elimina un proceso del seguimiento
   * @param {Object} params - {nomenclatura: string}
   */
  delete: function(params) {
    Utils.validateParams(params, ['nomenclatura']);

    const sheet = Utils.getSheet(CONFIG.SHEETS.SEGUIMIENTO);
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === params.nomenclatura) {
        // Eliminar la fila
        sheet.deleteRow(i + 1);
        return Utils.successResponse({
          nomenclatura: params.nomenclatura
        }, 'Proceso eliminado del seguimiento correctamente');
      }
    }

    return Utils.errorResponse('Proceso no encontrado en seguimiento');
  },

  /**
   * Actualiza una etapa específica de un proceso en seguimiento
   * Ahora soporta años históricos para tracking comparativo
   */
  updateEtapa: function(params) {
    Utils.validateParams(params, ['nomenclatura', 'etapa']);

    const etapaIndex = ETAPAS_SEACE.indexOf(params.etapa);
    if (etapaIndex === -1) {
      return Utils.errorResponse('Etapa no válida: ' + params.etapa);
    }

    const sheet = Utils.getSheet(CONFIG.SHEETS.SEGUIMIENTO);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // Buscar índices de columnas
    const estadoCol = headers.indexOf(params.etapa + '_ESTADO');
    const notasCol = headers.indexOf(params.etapa + '_NOTAS');

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === params.nomenclatura) {
        // Actualizar estado general (si se proporciona)
        if (params.estado && estadoCol > -1) {
          sheet.getRange(i + 1, estadoCol + 1).setValue(params.estado);
        }

        // Actualizar notas generales (si se proporciona)
        if (params.notas !== undefined && notasCol > -1) {
          sheet.getRange(i + 1, notasCol + 1).setValue(params.notas);
        }

        // Actualizar datos por año (si se proporciona el año)
        if (params.año) {
          const inicioCol = headers.indexOf(params.etapa + '_' + params.año + '_INICIO');
          const finCol = headers.indexOf(params.etapa + '_' + params.año + '_FIN');
          const linkCol = headers.indexOf(params.etapa + '_' + params.año + '_LINK');

          if (params.fechaInicio && inicioCol > -1) {
            sheet.getRange(i + 1, inicioCol + 1).setValue(params.fechaInicio);
          }
          if (params.fechaFin && finCol > -1) {
            sheet.getRange(i + 1, finCol + 1).setValue(params.fechaFin);
          }
          if (params.link !== undefined && linkCol > -1) {
            sheet.getRange(i + 1, linkCol + 1).setValue(params.link);
          }
        }

        // Actualizar también el cronograma (mantener compatibilidad)
        Cronograma.updateEtapa(params);

        return Utils.successResponse({}, 'Etapa actualizada');
      }
    }

    return Utils.errorResponse('Proceso no encontrado en seguimiento');
  }
};

// ==================== MÓDULO: CRONOGRAMA ====================

const Cronograma = {
  /**
   * Obtiene el cronograma de un proceso
   */
  get: function(params) {
    const sheet = Utils.getSheetSafe(CONFIG.SHEETS.CRONOGRAMA);
    if (!sheet) return [];

    Utils.validateParams(params, ['nomenclatura']);

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const hoy = new Date();

    return data.slice(1)
      .filter(function(row) { return row[0] === params.nomenclatura; })
      .map(function(row) {
        const obj = {};
        headers.forEach(function(header, i) {
          obj[header] = row[i];
        });

        // Calcular estado y días restantes
        const fin = new Date(obj.FECHA_FIN);
        const inicio = new Date(obj.FECHA_INICIO);

        if (hoy > fin) {
          obj.ESTADO_CALC = ESTADOS_ETAPA.VENCIDO;
        } else if (hoy >= inicio && hoy <= fin) {
          obj.ESTADO_CALC = ESTADOS_ETAPA.EN_CURSO;
        } else {
          obj.ESTADO_CALC = ESTADOS_ETAPA.PENDIENTE;
        }

        obj.DIAS_RESTANTES = Math.ceil((fin - hoy) / (1000 * 60 * 60 * 24));

        return obj;
      });
  },

  /**
   * Actualiza o crea una entrada de cronograma
   */
  updateEtapa: function(params) {
    const sheet = Utils.getSheetSafe(CONFIG.SHEETS.CRONOGRAMA);
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();

    // Buscar si existe la etapa
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === params.nomenclatura && data[i][1] === params.etapa) {
        if (params.fechaInicio) sheet.getRange(i + 1, 3).setValue(params.fechaInicio);
        if (params.fechaFin) sheet.getRange(i + 1, 4).setValue(params.fechaFin);
        if (params.estado) sheet.getRange(i + 1, 5).setValue(params.estado);
        return;
      }
    }

    // Si no existe y hay fechas, crear nueva entrada
    if (params.fechaInicio || params.fechaFin) {
      sheet.appendRow([
        params.nomenclatura,
        params.etapa,
        params.fechaInicio || '',
        params.fechaFin || '',
        params.estado || ESTADOS_ETAPA.PENDIENTE
      ]);
    }
  }
};

// ==================== MÓDULO: DOCUMENTOS ====================

const Documentos = {
  /**
   * Obtiene documentos de un proceso
   */
  get: function(params) {
    const sheet = Utils.getSheetSafe(CONFIG.SHEETS.DOCUMENTOS);
    if (!sheet) return [];

    Utils.validateParams(params, ['nomenclatura']);

    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    return data.slice(1)
      .filter(function(row) { return row[0] === params.nomenclatura; })
      .map(function(row) {
        const obj = {};
        headers.forEach(function(header, i) {
          obj[header] = row[i];
        });
        return obj;
      });
  },

  /**
   * Agrega un documento
   */
  add: function(params) {
    Utils.validateParams(params, ['nomenclatura', 'nombre']);

    const sheet = Utils.getSheet(CONFIG.SHEETS.DOCUMENTOS);

    sheet.appendRow([
      params.nomenclatura,
      params.nombre,
      params.tipo || 'PDF',
      params.etapa || '',
      params.url || '',
      new Date()
    ]);

    return Utils.successResponse({}, 'Documento agregado');
  },

  /**
   * Actualiza la URL de un documento existente (busca por nomenclatura + nombre)
   */
  updateUrl: function(params) {
    Utils.validateParams(params, ['nomenclatura', 'nombre', 'url']);

    const sheet = Utils.getSheetSafe(CONFIG.SHEETS.DOCUMENTOS);
    if (!sheet) {
      return Utils.errorResponse('Hoja DOCUMENTOS no encontrada');
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // Encontrar índice de columnas
    const colNomenclatura = headers.indexOf('NOMENCLATURA');
    const colNombre = headers.indexOf('NOMBRE');
    const colUrl = headers.indexOf('URL_DRIVE');
    const colFecha = headers.indexOf('FECHA_AGREGADO');

    // Buscar documento por nomenclatura + nombre
    for (let i = 1; i < data.length; i++) {
      if (data[i][colNomenclatura] === params.nomenclatura &&
          data[i][colNombre] === params.nombre) {
        // Actualizar URL y fecha
        sheet.getRange(i + 1, colUrl + 1).setValue(params.url);
        if (colFecha >= 0) {
          sheet.getRange(i + 1, colFecha + 1).setValue(new Date());
        }
        return Utils.successResponse({ updated: true, row: i + 1 }, 'URL actualizada');
      }
    }

    return Utils.errorResponse('Documento no encontrado: ' + params.nombre);
  },

  /**
   * Sube archivo a Drive Y registra/actualiza en hoja DOCUMENTOS
   * @param {Object} params - Parámetros del archivo
   * @param {string} params.documentoDestino - (Opcional) Nombre del documento existente a vincular
   *        Si se proporciona, actualiza la URL de ese documento en vez de crear uno nuevo
   * @param {boolean} params.esHistorico - (Opcional) Si es true, sube a HISTORICOS/{año}/
   * @param {string} params.añoProceso - (Opcional) Año del proceso para históricos
   */
  uploadAndRegister: function(params) {
    Utils.validateParams(params, ['nomenclatura', 'fileName', 'fileData', 'mimeType']);

    try {
      // 1. Subir archivo a Drive (con soporte para históricos)
      var uploadResult = Drive.uploadFileToDrive({
        nomenclatura: params.nomenclatura,
        fileName: params.fileName,
        fileData: params.fileData,
        mimeType: params.mimeType,
        entidad: params.entidad,
        esHistorico: params.esHistorico || false,
        añoProceso: params.añoProceso || ''
      });

      if (!uploadResult.success) {
        return uploadResult;
      }

      // 2. Detectar tipo de archivo desde extensión
      var tipoArchivo = Documentos._detectarTipoArchivo(params.fileName);

      // 3. Si hay documentoDestino, actualizar URL del documento existente
      if (params.documentoDestino) {
        var updateResult = Documentos.updateUrl({
          nomenclatura: params.nomenclatura,
          nombre: params.documentoDestino,
          url: uploadResult.viewUrl
        });

        if (!updateResult.success) {
          // Si el documento no existe, crearlo con el nombre del destino
          var sheet = Utils.getSheet(CONFIG.SHEETS.DOCUMENTOS);
          sheet.appendRow([
            params.nomenclatura,
            params.documentoDestino,
            tipoArchivo,
            params.etapa || '',
            uploadResult.viewUrl,
            new Date()
          ]);
        }

        // 4. Si es histórico, también actualizar DOCUMENTOS_JSON en HISTORICOS_DETALLE
        if (params.esHistorico) {
          Documentos._actualizarDocumentoEnHistorico(
            params.nomenclatura,
            params.documentoDestino,
            uploadResult.viewUrl
          );
        }
      } else {
        // Si no hay documentoDestino, crear nuevo registro con el nombre del archivo
        var sheet = Utils.getSheet(CONFIG.SHEETS.DOCUMENTOS);
        sheet.appendRow([
          params.nomenclatura,
          params.fileName,
          tipoArchivo,
          params.etapa || '',
          uploadResult.viewUrl,
          new Date()
        ]);
      }

      return Utils.successResponse({
        fileId: uploadResult.fileId,
        fileUrl: uploadResult.fileUrl,
        viewUrl: uploadResult.viewUrl,
        downloadUrl: uploadResult.downloadUrl,
        tipo: tipoArchivo,
        documentoActualizado: !!params.documentoDestino,
        registradoEnSheets: true
      }, params.documentoDestino ? 'Archivo subido y documento actualizado' : 'Archivo subido y registrado');

    } catch (error) {
      Utils.log('Error en uploadAndRegister', error);
      return Utils.errorResponse('Error: ' + error.toString());
    }
  },

  /**
   * Detecta el tipo de archivo desde su nombre
   * @private
   */
  _detectarTipoArchivo: function(fileName) {
    var extension = fileName.split('.').pop().toUpperCase();

    var mapaExtensiones = {
      'PDF': 'PDF',
      'DOC': 'DOCX',
      'DOCX': 'DOCX',
      'XLS': 'XLSX',
      'XLSX': 'XLSX',
      'JPG': 'JPG',
      'JPEG': 'JPG',
      'PNG': 'PNG',
      'ZIP': 'ZIP',
      'RAR': 'ZIP'
    };

    return mapaExtensiones[extension] || 'OTRO';
  },

  /**
   * Actualiza la URL de un documento en DOCUMENTOS_JSON de HISTORICOS_DETALLE
   * @private
   */
  _actualizarDocumentoEnHistorico: function(nomenclatura, nombreDocumento, url) {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(CONFIG.SHEETS.HISTORICOS_DETALLE);

      if (!sheet) {
        Utils.log('Hoja HISTORICOS_DETALLE no encontrada para actualizar documento');
        return false;
      }

      var data = sheet.getDataRange().getValues();
      var headers = data[0];
      var colNomenclatura = headers.indexOf('NOMENCLATURA');
      var colDocumentosJson = headers.indexOf('DOCUMENTOS_JSON');

      if (colDocumentosJson === -1) {
        Utils.log('Columna DOCUMENTOS_JSON no encontrada en HISTORICOS_DETALLE');
        return false;
      }

      // Buscar la fila del histórico
      for (var i = 1; i < data.length; i++) {
        if (data[i][colNomenclatura] === nomenclatura) {
          // Parsear DOCUMENTOS_JSON existente
          var documentosJson = data[i][colDocumentosJson];
          var documentos = [];

          if (documentosJson) {
            try {
              documentos = JSON.parse(documentosJson);
            } catch (e) {
              Utils.log('Error parseando DOCUMENTOS_JSON', e);
              documentos = [];
            }
          }

          // Buscar y actualizar el documento por nombre
          var encontrado = false;
          for (var j = 0; j < documentos.length; j++) {
            // Comparar por nombre (puede estar en diferentes campos)
            var docNombre = documentos[j].nombre || documentos[j].documento || '';
            if (docNombre === nombreDocumento) {
              documentos[j].url = url;
              encontrado = true;
              Utils.log('Documento actualizado en DOCUMENTOS_JSON: ' + nombreDocumento);
              break;
            }
          }

          // Si no encontró el documento, agregarlo
          if (!encontrado) {
            documentos.push({
              nombre: nombreDocumento,
              url: url,
              tipo: Documentos._detectarTipoArchivo(nombreDocumento)
            });
            Utils.log('Documento agregado a DOCUMENTOS_JSON: ' + nombreDocumento);
          }

          // Guardar JSON actualizado
          sheet.getRange(i + 1, colDocumentosJson + 1).setValue(JSON.stringify(documentos));
          return true;
        }
      }

      Utils.log('Histórico no encontrado para actualizar documento: ' + nomenclatura);
      return false;
    } catch (error) {
      Utils.log('Error en _actualizarDocumentoEnHistorico', error);
      return false;
    }
  }
};

// ==================== MÓDULO: POSTORES (v3.0) ====================

const Postores = {
  /**
   * Obtiene postores de un proceso
   */
  get: function(params) {
    const sheet = Utils.getSheetSafe(CONFIG.SHEETS.POSTORES);
    if (!sheet) return [];

    Utils.validateParams(params, ['nomenclatura']);

    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    return data.slice(1)
      .filter(function(row) { return row[0] === params.nomenclatura; })
      .map(function(row) {
        const obj = {};
        headers.forEach(function(header, i) {
          obj[header] = row[i];
        });
        return obj;
      });
  },

  /**
   * Agrega un postor a un proceso
   */
  add: function(params) {
    Utils.validateParams(params, ['nomenclatura', 'ruc', 'razonSocial']);

    // Obtener o crear hoja
    let sheet = Utils.getSheetSafe(CONFIG.SHEETS.POSTORES);
    if (!sheet) {
      sheet = Postores._crearHoja();
    }

    // Verificar si ya existe este postor para este proceso
    const data = sheet.getDataRange().getValues();
    const yaExiste = data.slice(1).some(function(row) {
      return row[0] === params.nomenclatura && row[1] === params.ruc;
    });

    if (yaExiste) {
      return Utils.errorResponse('El postor ya existe para este proceso');
    }

    sheet.appendRow([
      params.nomenclatura,           // NOMENCLATURA
      params.ruc,                    // RUC
      params.razonSocial,            // RAZON_SOCIAL
      params.representante || '',    // REPRESENTANTE
      params.estado || 'PARTICIPANTE', // ESTADO (PARTICIPANTE, GANADOR, DESCALIFICADO, NO_ADMITIDO)
      params.tipoPostor || '',       // TIPO_POSTOR (CONSORCIO, INDIVIDUAL)
      params.esMYPE || false,        // ES_MYPE
      params.montoOfertado || '',    // MONTO_OFERTADO
      params.puntaje || '',          // PUNTAJE
      params.notas || '',            // NOTAS
      new Date()                     // FECHA_REGISTRO
    ]);

    return Utils.successResponse({ ruc: params.ruc }, 'Postor agregado correctamente');
  },

  /**
   * Actualiza un postor existente
   */
  update: function(params) {
    Utils.validateParams(params, ['nomenclatura', 'ruc']);

    const sheet = Utils.getSheetSafe(CONFIG.SHEETS.POSTORES);
    if (!sheet) {
      return Utils.errorResponse('Hoja POSTORES no existe');
    }

    const data = sheet.getDataRange().getValues();
    let filaEncontrada = -1;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === params.nomenclatura && data[i][1] === params.ruc) {
        filaEncontrada = i + 1; // +1 porque sheet rows son 1-indexed
        break;
      }
    }

    if (filaEncontrada === -1) {
      return Utils.errorResponse('Postor no encontrado');
    }

    // Actualizar campos
    if (params.razonSocial) sheet.getRange(filaEncontrada, 3).setValue(params.razonSocial);
    if (params.representante !== undefined) sheet.getRange(filaEncontrada, 4).setValue(params.representante);
    if (params.estado) sheet.getRange(filaEncontrada, 5).setValue(params.estado);
    if (params.tipoPostor) sheet.getRange(filaEncontrada, 6).setValue(params.tipoPostor);
    if (params.esMYPE !== undefined) sheet.getRange(filaEncontrada, 7).setValue(params.esMYPE);
    if (params.montoOfertado !== undefined) sheet.getRange(filaEncontrada, 8).setValue(params.montoOfertado);
    if (params.puntaje !== undefined) sheet.getRange(filaEncontrada, 9).setValue(params.puntaje);
    if (params.notas !== undefined) sheet.getRange(filaEncontrada, 10).setValue(params.notas);

    return Utils.successResponse({ ruc: params.ruc }, 'Postor actualizado');
  },

  /**
   * Elimina un postor
   */
  delete: function(params) {
    Utils.validateParams(params, ['nomenclatura', 'ruc']);

    const sheet = Utils.getSheetSafe(CONFIG.SHEETS.POSTORES);
    if (!sheet) {
      return Utils.errorResponse('Hoja POSTORES no existe');
    }

    const data = sheet.getDataRange().getValues();

    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === params.nomenclatura && data[i][1] === params.ruc) {
        sheet.deleteRow(i + 1);
        return Utils.successResponse({}, 'Postor eliminado');
      }
    }

    return Utils.errorResponse('Postor no encontrado');
  },

  /**
   * Crea la hoja POSTORES si no existe
   * @private
   */
  _crearHoja: function() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.insertSheet(CONFIG.SHEETS.POSTORES);

    const headers = [
      'NOMENCLATURA', 'RUC', 'RAZON_SOCIAL', 'REPRESENTANTE', 'ESTADO',
      'TIPO_POSTOR', 'ES_MYPE', 'MONTO_OFERTADO', 'PUNTAJE', 'NOTAS', 'FECHA_REGISTRO'
    ];

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#4a5568')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);

    return sheet;
  }
};

// ==================== MÓDULO: FILTROS ====================

const Filtros = {
  /**
   * Obtiene filtros de entidades
   */
  getEntidades: function(params) {
    const sheet = Utils.getSheetSafe(CONFIG.SHEETS.FILTROS_ENTIDADES);
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    return data.slice(1)
      .map(function(row) {
        return {
          entidad: row[0],
          activo: row[1] === true || row[1] === 'TRUE'
        };
      })
      .filter(function(f) { return f.entidad; });
  },

  /**
   * Obtiene filtros de palabras clave
   */
  getPalabras: function(params) {
    const sheet = Utils.getSheetSafe(CONFIG.SHEETS.FILTROS_PALABRAS);
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    return data.slice(1)
      .map(function(row) {
        return {
          palabra: row[0],
          activo: row[1] === true || row[1] === 'TRUE'
        };
      })
      .filter(function(f) { return f.palabra; });
  },

  /**
   * Agrega una entidad a filtros
   */
  addEntidad: function(params) {
    Utils.validateParams(params, ['entidad']);

    const sheet = Utils.getSheet(CONFIG.SHEETS.FILTROS_ENTIDADES);
    sheet.appendRow([params.entidad, true]);

    return Utils.successResponse({}, 'Entidad agregada a filtros');
  },

  /**
   * Agrega una palabra clave a filtros
   */
  addPalabra: function(params) {
    Utils.validateParams(params, ['palabra']);

    const sheet = Utils.getSheet(CONFIG.SHEETS.FILTROS_PALABRAS);
    sheet.appendRow([params.palabra, true]);

    return Utils.successResponse({}, 'Palabra agregada a filtros');
  },

  /**
   * Activa/desactiva un filtro
   */
  toggle: function(params) {
    Utils.validateParams(params, ['tipo', 'valor']);

    const sheetName = params.tipo === 'entidad' ?
      CONFIG.SHEETS.FILTROS_ENTIDADES :
      CONFIG.SHEETS.FILTROS_PALABRAS;

    const sheet = Utils.getSheet(sheetName);
    const data = sheet.getDataRange().getValues();
    const activo = params.activo === 'true' || params.activo === true;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === params.valor) {
        sheet.getRange(i + 1, 2).setValue(activo);
        return Utils.successResponse({}, 'Filtro actualizado');
      }
    }

    return Utils.errorResponse('Filtro no encontrado');
  }
};

// ==================== MÓDULO: ESTADÍSTICAS ====================

const Estadisticas = {
  /**
   * Obtiene estadísticas generales
   */
  get: function(params) {
    const result = Procesos.getAll({});
    const procesos = result.procesos;

    const stats = {
      totalProcesos: procesos.length,
      porRegion: {},
      porObjeto: {},
      porEntidad: {},
      valorTotal: 0,
      porMoneda: { PEN: 0, USD: 0 },
      porAnio: {}
    };

    procesos.forEach(function(p) {
      // Por región
      stats.porRegion[p.REGION] = (stats.porRegion[p.REGION] || 0) + 1;

      // Por objeto
      stats.porObjeto[p.OBJETO] = (stats.porObjeto[p.OBJETO] || 0) + 1;

      // Por entidad
      stats.porEntidad[p.ENTIDAD] = (stats.porEntidad[p.ENTIDAD] || 0) + 1;

      // Valor total
      if (p.VALOR && !isNaN(p.VALOR)) {
        stats.valorTotal += parseFloat(p.VALOR);

        // Por moneda
        const moneda = p.MONEDA || 'PEN';
        stats.porMoneda[moneda] = (stats.porMoneda[moneda] || 0) + parseFloat(p.VALOR);
      }

      // Por año
      if (p.FECHA_PUB) {
        const anio = new Date(p.FECHA_PUB).getFullYear();
        if (!isNaN(anio)) {
          stats.porAnio[anio] = (stats.porAnio[anio] || 0) + 1;
        }
      }
    });

    // Top 10 entidades
    stats.topEntidades = Object.entries(stats.porEntidad)
      .sort(function(a, b) { return b[1] - a[1]; })
      .slice(0, 10);

    return stats;
  },

  /**
   * Obtiene regiones con conteo de procesos
   */
  getRegiones: function(params) {
    const result = Procesos.getAll({});
    const procesos = result.procesos;
    const regiones = {};

    procesos.forEach(function(p) {
      if (p.REGION) {
        if (!regiones[p.REGION]) {
          regiones[p.REGION] = { count: 0, valor: 0 };
        }
        regiones[p.REGION].count++;
        if (p.VALOR && !isNaN(p.VALOR)) {
          regiones[p.REGION].valor += parseFloat(p.VALOR);
        }
      }
    });

    return regiones;
  },

  /**
   * Obtiene entidades únicas con estadísticas
   */
  getEntidadesUnicas: function(params) {
    const sheet = Utils.getSheetSafe(CONFIG.SHEETS.BD);
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const colEntidad = headers.indexOf('ENTIDAD');
    const colRegion = headers.indexOf('REGION');
    const colValor = headers.indexOf('VALOR');

    if (colEntidad === -1) return [];

    const conteo = {};

    for (let i = 1; i < data.length; i++) {
      const entidad = data[i][colEntidad];
      if (entidad) {
        if (!conteo[entidad]) {
          conteo[entidad] = {
            entidad: entidad,
            count: 0,
            valor: 0,
            regiones: new Set()
          };
        }
        conteo[entidad].count++;
        if (colValor !== -1 && data[i][colValor]) {
          conteo[entidad].valor += parseFloat(data[i][colValor]) || 0;
        }
        if (colRegion !== -1 && data[i][colRegion]) {
          conteo[entidad].regiones.add(data[i][colRegion]);
        }
      }
    }

    return Object.values(conteo)
      .map(function(e) {
        return {
          entidad: e.entidad,
          count: e.count,
          valor: e.valor,
          regiones: Array.from(e.regiones)
        };
      })
      .sort(function(a, b) { return b.count - a.count; });
  }
};

// ==================== MÓDULO: DRIVE ====================

const Drive = {
  /**
   * Crea carpeta para un proceso (sin subcarpetas - archivos van directo)
   */
  crearCarpetaProceso: function(params) {
    Utils.validateParams(params, ['nomenclatura']);

    try {
      const carpetaRaiz = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);

      // Crear nombre de carpeta (solo nomenclatura)
      const nombreCarpeta = params.nomenclatura;

      // Verificar si ya existe
      const iterator = carpetaRaiz.getFolders();
      while (iterator.hasNext()) {
        const folder = iterator.next();
        if (folder.getName().startsWith(params.nomenclatura)) {
          return Utils.successResponse({
            url: folder.getUrl(),
            id: folder.getId(),
            existe: true
          }, 'Carpeta ya existía');
        }
      }

      // Crear carpeta principal (archivos irán directo aquí)
      const carpetaProceso = carpetaRaiz.createFolder(nombreCarpeta);

      return Utils.successResponse({
        url: carpetaProceso.getUrl(),
        id: carpetaProceso.getId()
      }, 'Carpeta creada correctamente');

    } catch(error) {
      return Utils.errorResponse('Error al crear carpeta: ' + error.toString());
    }
  },

  /**
   * Crea carpeta para un grupo de históricos con estructura simplificada
   * Estructura:
   *   {NOMENCLATURA_ACTUAL}/
   *     └── (archivos del proceso actual van aquí directo)
   *   HISTORICOS/
   *     ├── {año}/
   *     │   └── {nomenclatura_historico}/
   *     │       └── (archivos del histórico)
   */
  crearCarpetaGrupoHistorico: function(params) {
    Utils.validateParams(params, ['nomenclaturaActual', 'historicosPorAño']);

    try {
      const carpetaRaiz = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
      const nombreCarpeta = params.nomenclaturaActual;

      // Buscar o crear carpeta principal del proceso actual
      let carpetaPrincipal;
      const iterator = carpetaRaiz.getFolders();
      while (iterator.hasNext()) {
        const folder = iterator.next();
        if (folder.getName().startsWith(params.nomenclaturaActual)) {
          carpetaPrincipal = folder;
          break;
        }
      }
      if (!carpetaPrincipal) {
        carpetaPrincipal = carpetaRaiz.createFolder(nombreCarpeta);
      }

      // Crear o obtener carpeta HISTORICOS en la raíz
      const carpetaHistoricos = Drive._getOrCreateFolder(carpetaRaiz, 'HISTORICOS');

      // Crear carpetas para históricos por año
      const historicosPorAño = JSON.parse(params.historicosPorAño);
      const carpetasHistoricos = {};

      Object.keys(historicosPorAño).forEach(function(año) {
        // Crear carpeta del año dentro de HISTORICOS
        const carpetaAño = Drive._getOrCreateFolder(carpetaHistoricos, año);
        const nomenclaturas = historicosPorAño[año];

        // Crear subcarpeta por cada nomenclatura histórica
        nomenclaturas.forEach(function(nomenclatura) {
          Drive._getOrCreateFolder(carpetaAño, nomenclatura);
        });

        carpetasHistoricos[año] = carpetaAño.getUrl();
      });

      return Utils.successResponse({
        url: carpetaPrincipal.getUrl(),
        id: carpetaPrincipal.getId(),
        carpetaHistoricos: carpetaHistoricos.getUrl(),
        carpetasHistoricosPorAño: carpetasHistoricos
      }, 'Carpeta de grupo creada correctamente');

    } catch(error) {
      return Utils.errorResponse('Error al crear carpeta de grupo: ' + error.toString());
    }
  },

  /**
   * Verifica si existe una carpeta para un proceso
   * (Función simplificada - ya no hay subcarpetas que migrar)
   */
  migrarCarpetaExistente: function(params) {
    Utils.validateParams(params, ['nomenclatura']);

    try {
      const carpetaRaiz = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);

      // Buscar carpeta existente
      const nombreBusqueda = params.nomenclatura;
      const iterator = carpetaRaiz.getFolders();
      let carpetaExistente = null;

      while (iterator.hasNext()) {
        const folder = iterator.next();
        if (folder.getName().startsWith(nombreBusqueda)) {
          carpetaExistente = folder;
          break;
        }
      }

      if (!carpetaExistente) {
        return Utils.errorResponse('Carpeta no encontrada para: ' + nombreBusqueda);
      }

      return Utils.successResponse({
        url: carpetaExistente.getUrl(),
        id: carpetaExistente.getId(),
        existe: true
      }, 'Carpeta encontrada');

    } catch(error) {
      return Utils.errorResponse('Error: ' + error.toString());
    }
  },

  /**
   * Obtiene o crea una carpeta dentro de otra
   */
  _getOrCreateFolder: function(parent, name) {
    const folders = parent.getFoldersByName(name);
    if (folders.hasNext()) {
      return folders.next();
    }
    return parent.createFolder(name);
  },

  /**
   * Obtiene o crea carpeta para proceso histórico: HISTORICOS/{año}/{nomenclatura}/
   */
  _getOrCreateHistoricoFolder: function(año, nomenclatura) {
    const carpetaRaiz = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);

    // Crear estructura: HISTORICOS/{año}/{nomenclatura}/
    const carpetaHistoricos = Drive._getOrCreateFolder(carpetaRaiz, 'HISTORICOS');
    const carpetaAño = Drive._getOrCreateFolder(carpetaHistoricos, String(año));
    const carpetaProceso = Drive._getOrCreateFolder(carpetaAño, nomenclatura);

    return carpetaProceso;
  },

  /**
   * Extrae el año de una nomenclatura
   */
  _extraerAñoNomenclatura: function(nomenclatura) {
    const match = nomenclatura.match(/(\d{4})/);
    return match ? parseInt(match[1]) : null;
  },

  /**
   * Lista todos los archivos de una carpeta de Drive por su URL
   */
  listarArchivos: function(params) {
    Utils.validateParams(params, ['carpetaUrl']);

    try {
      // Extraer ID de la URL
      const folderId = Drive._extraerIdDesdUrl(params.carpetaUrl);
      if (!folderId) {
        return Utils.errorResponse('No se pudo extraer el ID de la carpeta de la URL');
      }

      const folder = DriveApp.getFolderById(folderId);
      const archivos = [];

      // Listar archivos de la carpeta principal
      const filesIterator = folder.getFiles();
      while (filesIterator.hasNext()) {
        const file = filesIterator.next();
        archivos.push({
          nombre: file.getName(),
          url: file.getUrl(),
          id: file.getId(),
          tipo: file.getMimeType(),
          tamaño: file.getSize(),
          fechaCreacion: file.getDateCreated().toISOString(),
          fechaModificacion: file.getLastUpdated().toISOString(),
          subcarpeta: null
        });
      }

      // Listar archivos de las subcarpetas
      const subfoldersIterator = folder.getFolders();
      while (subfoldersIterator.hasNext()) {
        const subfolder = subfoldersIterator.next();
        const subfolderName = subfolder.getName();
        const subfilesIterator = subfolder.getFiles();

        while (subfilesIterator.hasNext()) {
          const file = subfilesIterator.next();
          archivos.push({
            nombre: file.getName(),
            url: file.getUrl(),
            id: file.getId(),
            tipo: file.getMimeType(),
            tamaño: file.getSize(),
            fechaCreacion: file.getDateCreated().toISOString(),
            fechaModificacion: file.getLastUpdated().toISOString(),
            subcarpeta: subfolderName
          });
        }
      }

      return Utils.successResponse({
        archivos: archivos,
        total: archivos.length
      }, archivos.length + ' archivo(s) encontrado(s)');

    } catch(error) {
      return Utils.errorResponse('Error al listar archivos: ' + error.toString());
    }
  },

  /**
   * Sube un archivo a Google Drive desde base64
   * @param {Object} params - Parámetros
   * @param {string} params.nomenclatura - Nomenclatura del proceso
   * @param {string} params.fileName - Nombre del archivo
   * @param {string} params.fileData - Contenido del archivo en base64
   * @param {string} params.mimeType - Tipo MIME del archivo
   * @param {string} params.entidad - Entidad (opcional, para nombre de carpeta)
   * @param {boolean} params.esHistorico - Si es proceso histórico, sube a HISTORICOS/{año}/
   * @param {string} params.añoProceso - Año del proceso (requerido si esHistorico=true)
   */
  uploadFileToDrive: function(params) {
    Utils.validateParams(params, ['nomenclatura', 'fileName', 'fileData', 'mimeType']);

    try {
      let carpetaProceso = null;

      // 1. Determinar carpeta destino según si es histórico o no
      if (params.esHistorico && params.añoProceso) {
        // Histórico: HISTORICOS/{año}/{nomenclatura}/
        carpetaProceso = Drive._getOrCreateHistoricoFolder(params.añoProceso, params.nomenclatura);
        Utils.log('Carpeta histórico: HISTORICOS/' + params.añoProceso + '/' + params.nomenclatura);
      } else {
        // Proceso actual: raíz/{nomenclatura}/
        const carpetaRaiz = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);

        // Buscar carpeta existente por nomenclatura
        const iterator = carpetaRaiz.getFolders();
        while (iterator.hasNext()) {
          const folder = iterator.next();
          if (folder.getName() === params.nomenclatura) {
            carpetaProceso = folder;
            break;
          }
        }

        // Si no existe, crear carpeta
        if (!carpetaProceso) {
          carpetaProceso = carpetaRaiz.createFolder(params.nomenclatura);
          Utils.log('Carpeta creada: ' + params.nomenclatura);
        }
      }

      // 4. Decodificar base64 y crear blob
      const decodedData = Utilities.base64Decode(params.fileData);
      const blob = Utilities.newBlob(decodedData, params.mimeType, params.fileName);

      // 5. Verificar tamaño (limite ~50MB para Apps Script)
      if (decodedData.length > 50 * 1024 * 1024) {
        return Utils.errorResponse('Archivo demasiado grande. Límite: 50MB');
      }

      // 6. Crear archivo en Drive
      const archivo = carpetaProceso.createFile(blob);

      // 7. Configurar permisos públicos con link
      archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      return Utils.successResponse({
        fileId: archivo.getId(),
        fileUrl: archivo.getUrl(),
        downloadUrl: 'https://drive.google.com/uc?export=download&id=' + archivo.getId(),
        viewUrl: 'https://drive.google.com/file/d/' + archivo.getId() + '/view',
        fileName: archivo.getName(),
        mimeType: archivo.getMimeType(),
        size: archivo.getSize(),
        carpetaUrl: carpetaProceso.getUrl()
      }, 'Archivo subido correctamente');

    } catch (error) {
      Utils.log('Error uploading file', error);
      return Utils.errorResponse('Error al subir archivo: ' + error.toString());
    }
  },

  /**
   * Extrae el ID de una carpeta desde su URL
   */
  _extraerIdDesdUrl: function(url) {
    // URL formato: https://drive.google.com/drive/folders/{ID}
    const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }
};

// ==================== MÓDULO: GRUPOS HISTÓRICOS ====================

const GruposHistoricos = {
  /**
   * Obtiene todos los grupos históricos
   */
  getAll: function(params) {
    const sheet = Utils.getSheetSafe(CONFIG.SHEETS.GRUPOS_HISTORICOS);
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    return data.slice(1)
      .map(function(row) {
        const obj = {};
        headers.forEach(function(header, i) {
          obj[header] = row[i];
        });
        // Parsear JSON de nomenclaturas
        if (obj.NOMENCLATURAS_HISTORICOS) {
          try {
            obj.NOMENCLATURAS_HISTORICOS = JSON.parse(obj.NOMENCLATURAS_HISTORICOS);
          } catch(e) {
            obj.NOMENCLATURAS_HISTORICOS = [];
          }
        }
        return obj;
      })
      .filter(function(g) { return g.ID_GRUPO; });
  },

  /**
   * Obtiene un grupo por su ID
   */
  get: function(params) {
    Utils.validateParams(params, ['idGrupo']);

    const grupos = GruposHistoricos.getAll();
    const grupo = grupos.find(function(g) {
      return g.ID_GRUPO === params.idGrupo;
    });

    if (!grupo) {
      return Utils.errorResponse('Grupo no encontrado');
    }

    return Utils.successResponse({ grupo: grupo });
  },

  /**
   * Obtiene un grupo por la nomenclatura del proceso actual
   */
  getByNomenclatura: function(params) {
    Utils.validateParams(params, ['nomenclatura']);

    const grupos = GruposHistoricos.getAll();
    const grupo = grupos.find(function(g) {
      return g.NOMENCLATURA_ACTUAL === params.nomenclatura;
    });

    if (!grupo) {
      return Utils.successResponse({ grupo: null });
    }

    return Utils.successResponse({ grupo: grupo });
  },

  /**
   * Crea un nuevo grupo histórico
   */
  crear: function(params) {
    Utils.validateParams(params, ['nomenclaturaActual', 'nomenclaturasHistoricos']);

    const sheet = Utils.getSheet(CONFIG.SHEETS.GRUPOS_HISTORICOS);

    // Verificar si ya existe un grupo para esta nomenclatura
    const grupoExistente = GruposHistoricos.getByNomenclatura({
      nomenclatura: params.nomenclaturaActual
    });

    if (grupoExistente.grupo) {
      return Utils.errorResponse('Ya existe un grupo para este proceso', {
        idGrupoExistente: grupoExistente.grupo.ID_GRUPO
      });
    }

    // Generar ID único
    const idGrupo = 'GH-' + Date.now();

    // Preparar nomenclaturas como JSON
    let nomenclaturas = params.nomenclaturasHistoricos;
    if (typeof nomenclaturas === 'string') {
      try {
        nomenclaturas = JSON.parse(nomenclaturas);
      } catch(e) {
        nomenclaturas = nomenclaturas.split(',').map(function(n) { return n.trim(); });
      }
    }

    // Insertar en hoja (sin carpeta Drive — Fase 1.5)
    sheet.appendRow([
      idGrupo,
      params.nomenclaturaActual,
      JSON.stringify(nomenclaturas),
      new Date(),
      params.notas || '',
      ''
    ]);

    // Actualizar SEGUIMIENTO con el ID del grupo
    try {
      GruposHistoricos._actualizarSeguimiento(params.nomenclaturaActual, idGrupo);
    } catch(e) {
      Utils.log('Error actualizando seguimiento', e);
    }

    return Utils.successResponse({
      idGrupo: idGrupo
    }, 'Grupo histórico creado correctamente');
  },

  /**
   * Actualiza un grupo histórico
   */
  update: function(params) {
    Utils.validateParams(params, ['idGrupo']);

    const sheet = Utils.getSheet(CONFIG.SHEETS.GRUPOS_HISTORICOS);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const colNomenclaturas = headers.indexOf('NOMENCLATURAS_HISTORICOS') + 1;
    const colNotas = headers.indexOf('NOTAS') + 1;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === params.idGrupo) {
        if (params.nomenclaturasHistoricos && colNomenclaturas > 0) {
          let nomenclaturas = params.nomenclaturasHistoricos;
          if (typeof nomenclaturas !== 'string') {
            nomenclaturas = JSON.stringify(nomenclaturas);
          }
          sheet.getRange(i + 1, colNomenclaturas).setValue(nomenclaturas);
        }
        if (params.notas !== undefined && colNotas > 0) {
          sheet.getRange(i + 1, colNotas).setValue(params.notas);
        }
        return Utils.successResponse({}, 'Grupo actualizado');
      }
    }

    return Utils.errorResponse('Grupo no encontrado');
  },

  /**
   * Elimina un grupo histórico
   */
  delete: function(params) {
    Utils.validateParams(params, ['idGrupo']);

    const sheet = Utils.getSheet(CONFIG.SHEETS.GRUPOS_HISTORICOS);
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === params.idGrupo) {
        sheet.deleteRow(i + 1);
        return Utils.successResponse({}, 'Grupo eliminado');
      }
    }

    return Utils.errorResponse('Grupo no encontrado');
  },

  /**
   * Lista todos los grupos históricos enriquecidos con estadísticas:
   * montos (de BD_PROCESOS) y estado de scraping (de DATOS_SEACE).
   * @param {Object} params - { filterByActual?: string }
   */
  listarConStats: function(params) {
    params = params || {};
    const filterByActual = params.filterByActual ? String(params.filterByActual).trim() : '';

    // 1) Cargar grupos
    const grupos = GruposHistoricos.getAll();

    // 2) Construir índice NOMENCLATURA -> fila BD_PROCESOS (para valores de referencia)
    const bdSheet = Utils.getSheetSafe(CONFIG.SHEETS.BD);
    const bdIndex = {};
    if (bdSheet) {
      const bdData = bdSheet.getDataRange().getValues();
      for (let i = 1; i < bdData.length; i++) {
        const nom = bdData[i][BD_COLS.NOMENCLATURA];
        if (nom) {
          bdIndex[String(nom).trim()] = {
            valor: Number(bdData[i][BD_COLS.VALOR]) || 0
          };
        }
      }
    }

    // 3) Construir índice NOMENCLATURA -> estado scraping desde DATOS_SEACE
    const seaceSheet = Utils.getSheetSafe(CONFIG.SHEETS.DATOS_SEACE);
    const seaceIndex = {};
    if (seaceSheet) {
      const seaceData = seaceSheet.getDataRange().getValues();
      if (seaceData.length >= 2) {
        const seaceHeaders = seaceData[0];
        const idxNom = seaceHeaders.indexOf('NOMENCLATURA');
        const idxEstado = seaceHeaders.indexOf('ESTADO_SCRAPING');
        if (idxNom >= 0 && idxEstado >= 0) {
          for (let i = 1; i < seaceData.length; i++) {
            const nom = seaceData[i][idxNom];
            if (nom) {
              seaceIndex[String(nom).trim()] = String(seaceData[i][idxEstado] || '').trim().toLowerCase();
            }
          }
        }
      }
    }

    // 4) Enriquecer cada grupo con stats
    const resultado = grupos
      .filter(function(g) {
        if (!filterByActual) return true;
        return g.NOMENCLATURA_ACTUAL === filterByActual;
      })
      .map(function(g) {
        const nomenclaturas = Array.isArray(g.NOMENCLATURAS_HISTORICOS) ? g.NOMENCLATURAS_HISTORICOS : [];

        // Stats de montos
        const valoresRef = nomenclaturas.map(function(n) {
          const info = bdIndex[String(n).trim()];
          return info ? info.valor : 0;
        });
        const positivos = valoresRef.filter(function(v) { return v > 0; });
        let montoMinimo = 0, montoMaximo = 0, montoMedia = 0;
        if (positivos.length > 0) {
          montoMinimo = Math.min.apply(null, positivos);
          montoMaximo = Math.max.apply(null, positivos);
          const suma = positivos.reduce(function(acc, v) { return acc + v; }, 0);
          montoMedia = suma / positivos.length;
        }

        // Rango de años (regex -20XX-)
        const años = [];
        nomenclaturas.forEach(function(n) {
          const m = String(n).match(/-(20\d{2})-/);
          if (m) años.push(parseInt(m[1], 10));
        });
        const añoMinimo = años.length ? Math.min.apply(null, años) : null;
        const añoMaximo = años.length ? Math.max.apply(null, años) : null;

        // Stats de scraping
        let scrapeados = 0, pendientes = 0, conError = 0;
        nomenclaturas.forEach(function(n) {
          const estado = seaceIndex[String(n).trim()];
          if (estado === 'completo') scrapeados++;
          else if (estado === 'error') conError++;
          else pendientes++; // incluye 'pendiente' y ausente
        });

        return {
          idGrupo: g.ID_GRUPO,
          nomenclaturaActual: g.NOMENCLATURA_ACTUAL,
          nomenclaturasHistoricos: nomenclaturas,
          fechaCreacion: g.FECHA_CREACION,
          notas: g.NOTAS || '',
          stats: {
            totalHistoricos: nomenclaturas.length,
            valoresRef: valoresRef,
            montoMinimo: montoMinimo,
            montoMaximo: montoMaximo,
            montoMedia: montoMedia,
            añoMinimo: añoMinimo,
            añoMaximo: añoMaximo,
            scrapeados: scrapeados,
            pendientes: pendientes,
            conError: conError
          }
        };
      });

    return Utils.successResponse({ grupos: resultado });
  },

  /**
   * Devuelve el detalle completo de un grupo: info + histórico con datos
   * de BD_PROCESOS y estado de scraping desde DATOS_SEACE.
   * @param {Object} params - { idGrupo: string }
   */
  getDetalle: function(params) {
    Utils.validateParams(params, ['idGrupo']);

    const grupos = GruposHistoricos.getAll();
    const grupo = grupos.find(function(g) { return g.ID_GRUPO === params.idGrupo; });
    if (!grupo) {
      return Utils.errorResponse('Grupo no encontrado');
    }

    const nomenclaturas = Array.isArray(grupo.NOMENCLATURAS_HISTORICOS) ? grupo.NOMENCLATURAS_HISTORICOS : [];

    // Índice BD_PROCESOS
    const bdSheet = Utils.getSheetSafe(CONFIG.SHEETS.BD);
    const bdIndex = {};
    if (bdSheet) {
      const bdData = bdSheet.getDataRange().getValues();
      for (let i = 1; i < bdData.length; i++) {
        const nom = bdData[i][BD_COLS.NOMENCLATURA];
        if (nom) {
          bdIndex[String(nom).trim()] = {
            descripcion: bdData[i][BD_COLS.DESCRIPCION] || '',
            entidad: bdData[i][BD_COLS.ENTIDAD] || '',
            valor: Number(bdData[i][BD_COLS.VALOR]) || 0,
            fecha_pub: bdData[i][BD_COLS.FECHA_PUB] || '',
            tipo_servicio: bdData[i][BD_COLS.TIPO_SERVICIO] || '',
            empresa_corta: bdData[i][BD_COLS.EMPRESA_CORTA] || ''
          };
        }
      }
    }

    // Índice DATOS_SEACE (registro completo por nomenclatura)
    const seaceSheet = Utils.getSheetSafe(CONFIG.SHEETS.DATOS_SEACE);
    const seaceIndex = {};
    if (seaceSheet) {
      const seaceData = seaceSheet.getDataRange().getValues();
      if (seaceData.length >= 2) {
        const seaceHeaders = seaceData[0];
        const idxNom = seaceHeaders.indexOf('NOMENCLATURA');
        if (idxNom >= 0) {
          for (let i = 1; i < seaceData.length; i++) {
            const nom = seaceData[i][idxNom];
            if (nom) {
              const reg = {};
              seaceHeaders.forEach(function(h, idx) { reg[h] = seaceData[i][idx]; });
              seaceIndex[String(nom).trim()] = reg;
            }
          }
        }
      }
    }

    const historicos = nomenclaturas.map(function(n) {
      const key = String(n).trim();
      const bd = bdIndex[key] || {};
      const seace = seaceIndex[key];

      let scraping;
      if (!seace) {
        scraping = { estado: 'pendiente' };
      } else {
        let numPdfs = 0, numPostores = 0;
        try {
          const docs = seace.DOCUMENTOS_JSON ? JSON.parse(seace.DOCUMENTOS_JSON) : [];
          numPdfs = Array.isArray(docs) ? docs.length : 0;
        } catch(e) { numPdfs = 0; }
        try {
          const posts = seace.POSTORES_JSON ? JSON.parse(seace.POSTORES_JSON) : [];
          numPostores = Array.isArray(posts) ? posts.length : 0;
        } catch(e) { numPostores = 0; }

        scraping = {
          estado: String(seace.ESTADO_SCRAPING || 'pendiente').trim().toLowerCase(),
          fechaScraping: seace.FECHA_SCRAPING || null,
          urlSeace: seace.URL_SEACE || '',
          numPdfs: numPdfs,
          numPostores: numPostores,
          error: seace.ERROR_MENSAJE || ''
        };
      }

      return {
        nomenclatura: n,
        descripcion: bd.descripcion || '',
        entidad: bd.entidad || '',
        valor: bd.valor || 0,
        fecha_pub: bd.fecha_pub || '',
        tipo_servicio: bd.tipo_servicio || '',
        empresa_corta: bd.empresa_corta || '',
        scraping: scraping
      };
    });

    return Utils.successResponse({
      idGrupo: grupo.ID_GRUPO,
      nomenclaturaActual: grupo.NOMENCLATURA_ACTUAL,
      notas: grupo.NOTAS || '',
      fechaCreacion: grupo.FECHA_CREACION,
      historicos: historicos
    });
  },

  /**
   * Versión liviana de getDetalle: solo estados de scraping por histórico.
   * Útil para polling de progreso en tiempo real.
   * @param {Object} params - { idGrupo: string }
   */
  getEstadoScraping: function(params) {
    Utils.validateParams(params, ['idGrupo']);

    const grupos = GruposHistoricos.getAll();
    const grupo = grupos.find(function(g) { return g.ID_GRUPO === params.idGrupo; });
    if (!grupo) {
      return Utils.errorResponse('Grupo no encontrado');
    }

    const nomenclaturas = Array.isArray(grupo.NOMENCLATURAS_HISTORICOS) ? grupo.NOMENCLATURAS_HISTORICOS : [];

    // Índice liviano DATOS_SEACE
    const seaceSheet = Utils.getSheetSafe(CONFIG.SHEETS.DATOS_SEACE);
    const seaceIndex = {};
    if (seaceSheet) {
      const seaceData = seaceSheet.getDataRange().getValues();
      if (seaceData.length >= 2) {
        const seaceHeaders = seaceData[0];
        const idxNom = seaceHeaders.indexOf('NOMENCLATURA');
        const idxEstado = seaceHeaders.indexOf('ESTADO_SCRAPING');
        const idxFecha = seaceHeaders.indexOf('FECHA_SCRAPING');
        const idxError = seaceHeaders.indexOf('ERROR_MENSAJE');
        if (idxNom >= 0) {
          for (let i = 1; i < seaceData.length; i++) {
            const nom = seaceData[i][idxNom];
            if (nom) {
              seaceIndex[String(nom).trim()] = {
                estado: idxEstado >= 0 ? String(seaceData[i][idxEstado] || 'pendiente').trim().toLowerCase() : 'pendiente',
                fechaScraping: idxFecha >= 0 ? seaceData[i][idxFecha] : null,
                error: idxError >= 0 ? (seaceData[i][idxError] || '') : ''
              };
            }
          }
        }
      }
    }

    const estados = nomenclaturas.map(function(n) {
      const info = seaceIndex[String(n).trim()];
      if (!info) {
        return { nomenclatura: n, estado: 'pendiente', fechaScraping: null, error: '' };
      }
      return {
        nomenclatura: n,
        estado: info.estado,
        fechaScraping: info.fechaScraping,
        error: info.error
      };
    });

    return Utils.successResponse({
      idGrupo: grupo.ID_GRUPO,
      totalHistoricos: nomenclaturas.length,
      estados: estados
    });
  },

  /**
   * Agrupa nomenclaturas por año
   */
  _agruparPorAño: function(nomenclaturas) {
    const grupos = {};

    nomenclaturas.forEach(function(nom) {
      const match = nom.match(/(\d{4})/);
      const año = match ? match[1] : 'SIN_AÑO';

      if (!grupos[año]) {
        grupos[año] = [];
      }
      grupos[año].push(nom);
    });

    return grupos;
  },

  /**
   * Actualiza el campo ID_GRUPO_HISTORICO en SEGUIMIENTO
   */
  _actualizarSeguimiento: function(nomenclatura, idGrupo) {
    const sheet = Utils.getSheetSafe(CONFIG.SHEETS.SEGUIMIENTO);
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const colGrupo = headers.indexOf('ID_GRUPO_HISTORICO') + 1;

    if (colGrupo <= 0) return; // Columna no existe

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === nomenclatura) {
        sheet.getRange(i + 1, colGrupo).setValue(idGrupo);
        return;
      }
    }
  }
};

// ==================== MÓDULO: OCDS API (Consulta en tiempo real) ====================

/**
 * API OCDS - Consulta datos en tiempo real desde el Portal de Contrataciones Abiertas
 *
 * ESTRATEGIA:
 * 1. Mantener índice ligero: NOMENCLATURA → TENDER_ID → OCID (hoja OCDS_INDEX)
 * 2. Consultar API en tiempo real usando tender_id
 *
 * ENDPOINTS QUE FUNCIONAN:
 * - GET /record/{ocid}
 * - GET /record/{source}/{tender_id}
 */
const OCDS_API = {

  /**
   * CONSULTA PRINCIPAL: Obtiene datos completos de un proceso
   */
  getProceso: function(params) {
    Utils.validateParams(params, ['nomenclatura']);
    const nomenclatura = params.nomenclatura.toUpperCase().trim();

    // 1) Intentar índice local (fast path)
    let indexData = OCDS_API._buscarEnIndice(nomenclatura);
    let fuenteIndice = 'INDICE_LOCAL';

    // 2) Fallback: si no está en el índice, buscar en vivo en la API OCDS
    //    y cachear el resultado en OCDS_INDEX para futuras consultas.
    if (!indexData) {
      try {
        indexData = OCDS_API._liveSearchByNomenclatura(nomenclatura);
        if (indexData) fuenteIndice = 'LIVE_FETCH';
      } catch (e) {
        Logger.log('Error en _liveSearchByNomenclatura: ' + e);
      }
    }

    if (!indexData) {
      const año = OCDS_API._extraerAñoNomenclatura(nomenclatura);
      return Utils.errorResponse(
        'Proceso no encontrado en índice ni en API OCDS. ' +
        'La API OCDS del gobierno podría no haber publicado aún el mes ' +
        (año ? 'correspondiente a ' + año : 'correspondiente') + '. ' +
        'Intenta con Tender ID u OCID si los conoces.'
      );
    }

    // 3) Preferir OCID (es el identificador canónico y está correcto en el índice).
    //    Si no hay OCID, caer a tender_id numérico.
    let respuesta;
    if (indexData.ocid && String(indexData.ocid).startsWith('ocds-')) {
      respuesta = OCDS_API.getByOcid({ ocid: indexData.ocid });
    } else {
      respuesta = OCDS_API.getByTenderId({
        tenderId: indexData.tenderId,
        source: CONFIG.OCDS_API.SOURCE_V3
      });
    }
    if (respuesta.success) respuesta.fuenteIndice = fuenteIndice;
    return respuesta;
  },

  /**
   * CONSULTA POR TENDER_ID (FUNCIONA)
   */
  getByTenderId: function(params) {
    Utils.validateParams(params, ['tenderId']);
    const source = params.source || CONFIG.OCDS_API.SOURCE_V3;
    const url = CONFIG.OCDS_API.BASE_URL + '/record/' + source + '/' + params.tenderId;

    try {
      const data = OCDS_API._fetch(url);
      if (data && data.records && data.records.length > 0) {
        return Utils.successResponse({
          datos: OCDS_API._transformarRecord(data.records[0]),
          fuente: 'API_TIEMPO_REAL'
        });
      }
      return Utils.errorResponse('tender_id no encontrado: ' + params.tenderId);
    } catch(e) {
      return Utils.errorResponse('Error API: ' + e.toString());
    }
  },

  /**
   * CONSULTA POR OCID (FUNCIONA)
   */
  getByOcid: function(params) {
    Utils.validateParams(params, ['ocid']);
    let ocid = params.ocid;
    if (!ocid.startsWith('ocds-')) ocid = 'ocds-dgv273-' + ocid;

    const url = CONFIG.OCDS_API.BASE_URL + '/record/' + ocid;

    try {
      const data = OCDS_API._fetch(url);
      if (data && data.records && data.records.length > 0) {
        return Utils.successResponse({
          datos: OCDS_API._transformarRecord(data.records[0]),
          fuente: 'API_TIEMPO_REAL'
        });
      }
      return Utils.errorResponse('OCID no encontrado: ' + ocid);
    } catch(e) {
      return Utils.errorResponse('Error API: ' + e.toString());
    }
  },

  /**
   * Obtiene postores de un proceso
   */
  getPostores: function(params) {
    const resultado = OCDS_API.getProceso(params);
    if (!resultado.success) return resultado;
    return Utils.successResponse({
      postores: resultado.datos.postores || [],
      total: (resultado.datos.postores || []).length
    });
  },

  /**
   * Obtiene documentos de un proceso
   */
  getDocumentos: function(params) {
    const resultado = OCDS_API.getProceso(params);
    if (!resultado.success) return resultado;
    return Utils.successResponse({
      documentos: resultado.datos.documentos || [],
      total: (resultado.datos.documentos || []).length
    });
  },

  /**
   * Obtiene cronograma de un proceso
   */
  getCronograma: function(params) {
    const resultado = OCDS_API.getProceso(params);
    if (!resultado.success) return resultado;
    return Utils.successResponse({ cronograma: resultado.datos.cronograma || {} });
  },

  /**
   * Lista todos los procesos del índice
   */
  listarProcesos: function(params) {
    const sheet = Utils.getSheetSafe(CONFIG.SHEETS.OCDS_INDEX);
    if (!sheet) return Utils.errorResponse('Índice no encontrado. Ejecuta "Actualizar Índice OCDS".');

    const data = sheet.getDataRange().getValues();
    let procesos = data.slice(1)
      .filter(function(row) { return row[0]; })
      .map(function(row) {
        return {
          nomenclatura: row[0],
          tenderId: row[1],
          ocid: row[2],
          entidad: row[3],
          valor: row[4]
        };
      });

    if (params && params.entidad) {
      const entidad = params.entidad.toUpperCase();
      procesos = procesos.filter(function(p) {
        return p.entidad && p.entidad.toUpperCase().includes(entidad);
      });
    }

    return Utils.successResponse({ total: procesos.length, procesos: procesos });
  },

  // ==================== HELPERS ====================

  /**
   * Busca una nomenclatura en OCDS_INDEX con 3 estrategias en cascada:
   *   1) TextFinder exact (matchEntireCell=true) — rápido con Sheets index
   *   2) TextFinder substring + verify — por si la celda tiene whitespace
   *      invisible (NBSP, etc.) que rompe el match exacto
   *   3) Chunked linear scan (10K filas por batch) — fallback garantizado
   *      usando solo columna A + verificación con normalización agresiva
   */
  _buscarEnIndice: function(nomenclatura) {
    const sheet = Utils.getSheetSafe(CONFIG.SHEETS.OCDS_INDEX);
    if (!sheet) return null;

    const needle = OCDS_API._normalizarNomenclatura(nomenclatura);
    if (!needle) return null;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    const colA = sheet.getRange(2, 1, lastRow - 1, 1);

    // Estrategia 1: TextFinder exact cell match
    try {
      const finder = colA.createTextFinder(needle)
        .matchCase(false)
        .matchEntireCell(true)
        .useRegularExpression(false);
      const cell = finder.findNext();
      if (cell) {
        return OCDS_API._leerFilaIndice(sheet, cell.getRow());
      }
    } catch (e) {
      Logger.log('_buscarEnIndice Estrategia 1 (TextFinder exact) error: ' + e);
    }

    // Estrategia 2: TextFinder substring + verify con normalización
    try {
      const finder = colA.createTextFinder(needle)
        .matchCase(false)
        .matchEntireCell(false)
        .useRegularExpression(false);
      const cells = finder.findAll();
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const valNormalizado = OCDS_API._normalizarNomenclatura(cell.getValue());
        if (valNormalizado === needle) {
          return OCDS_API._leerFilaIndice(sheet, cell.getRow());
        }
      }
    } catch (e) {
      Logger.log('_buscarEnIndice Estrategia 2 (TextFinder substring) error: ' + e);
    }

    // Estrategia 3: Chunked linear scan garantizado
    try {
      const colMap = OCDS_API._getIndiceColMap(sheet);
      const numCols = Math.max(sheet.getLastColumn(), 5);
      const CHUNK = 10000;
      let startRow = 2;
      const deadlineMs = Date.now() + 20000; // no tocar el timeout de 30s
      while (startRow <= lastRow && Date.now() < deadlineMs) {
        const numRows = Math.min(CHUNK, lastRow - startRow + 1);
        const data = sheet.getRange(startRow, 1, numRows, numCols).getValues();
        for (let i = 0; i < data.length; i++) {
          const valNormalizado = OCDS_API._normalizarNomenclatura(data[i][colMap.nomenclatura]);
          if (valNormalizado === needle) {
            return OCDS_API._construirFilaIndice(data[i], colMap);
          }
        }
        startRow += CHUNK;
      }
    } catch (e) {
      Logger.log('_buscarEnIndice Estrategia 3 (chunked scan) error: ' + e);
    }

    return null;
  },

  /**
   * Normaliza nomenclaturas agresivamente para match:
   * - Upper case
   * - Trim
   * - Remueve non-breaking spaces (U+00A0)
   * - Colapsa whitespace múltiple
   * - Remueve caracteres de control invisibles
   */
  _normalizarNomenclatura: function(valor) {
    if (!valor) return '';
    return String(valor)
      .replace(/ /g, ' ')        // non-breaking space → space
      .replace(/[​-‍﻿]/g, '') // zero-width chars
      .replace(/\s+/g, ' ')           // whitespace múltiple → uno solo
      .trim()
      .toUpperCase();
  },

  _leerFilaIndice: function(sheet, rowNumber) {
    const colMap = OCDS_API._getIndiceColMap(sheet);
    const numCols = Math.max(sheet.getLastColumn(), 5);
    const rowData = sheet.getRange(rowNumber, 1, 1, numCols).getValues()[0];
    return OCDS_API._construirFilaIndice(rowData, colMap);
  },

  /**
   * Construye objeto de fila del índice a partir del row array + el map
   * de columnas. Tolerante a schemas distintos (p.ej. columnas en otro
   * orden o nombres distintos poblados por scripts externos).
   */
  _construirFilaIndice: function(row, colMap) {
    const safe = function(idx) { return idx >= 0 ? row[idx] : null; };
    const rawValor = safe(colMap.valor);
    // Solo devolver valor si es numérico real. El índice OCDS_INDEX de algunos
    // despliegues tiene descripción en la columna "VALOR" (schema heredado de
    // scripts Python viejos) — devolver null en ese caso en vez del texto basura.
    const valorNum = typeof rawValor === 'number'
      ? rawValor
      : (typeof rawValor === 'string' && /^[\d,.\s-]+$/.test(rawValor)
          ? parseFloat(String(rawValor).replace(/[^\d.-]/g, ''))
          : null);

    return {
      nomenclatura: safe(colMap.nomenclatura),
      tenderId: safe(colMap.tenderId),
      ocid: safe(colMap.ocid),
      entidad: safe(colMap.entidad),
      valor: (valorNum != null && !isNaN(valorNum)) ? valorNum : null
    };
  },

  /**
   * Lee los headers de la hoja OCDS_INDEX y mapea cada campo a su índice
   * de columna. Acepta distintos nombres posibles (ej. TENDER_ID vs TENDERID).
   * Si no encuentra un nombre, cae al orden por defecto [NOM, TID, OCID, ENT, VAL].
   * Cacheado en memoria del script (no persistente, se recalcula en cada invocación).
   */
  _getIndiceColMap: function(sheet) {
    try {
      const lastCol = sheet.getLastColumn();
      if (lastCol < 1) throw new Error('Hoja sin columnas');
      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
        return String(h || '').toUpperCase().trim();
      });
      const find = function(nombres) {
        for (let i = 0; i < headers.length; i++) {
          for (let j = 0; j < nombres.length; j++) {
            if (headers[i] === nombres[j]) return i;
          }
        }
        return -1;
      };
      const map = {
        nomenclatura: find(['NOMENCLATURA', 'NOMBRE']),
        tenderId: find(['TENDER_ID', 'TENDERID', 'ID_TENDER']),
        ocid: find(['OCID']),
        entidad: find(['ENTIDAD', 'BUYER', 'ENTIDAD_NOMBRE']),
        valor: find(['VALOR', 'VALUE', 'MONTO', 'AMOUNT', 'VALOR_REFERENCIAL'])
      };
      // Fallback al orden por defecto para campos no encontrados
      if (map.nomenclatura < 0) map.nomenclatura = 0;
      if (map.tenderId < 0) map.tenderId = 1;
      if (map.ocid < 0) map.ocid = 2;
      if (map.entidad < 0) map.entidad = 3;
      if (map.valor < 0) map.valor = 4;
      return map;
    } catch (e) {
      Logger.log('_getIndiceColMap fallback al orden default: ' + e);
      return { nomenclatura: 0, tenderId: 1, ocid: 2, entidad: 3, valor: 4 };
    }
  },

  /**
   * Busca en vivo una nomenclatura contra la API OCDS paginando por meses
   * del año embebido en la nomenclatura (ej: CP-XX-2026-... → año 2026).
   * Al terminar, cachea TODOS los records escaneados en OCDS_INDEX en UNA
   * sola llamada a _upsertRows para minimizar lecturas/escrituras sobre la hoja.
   *
   * Retorna {nomenclatura, tenderId, ocid, entidad, valor} o null si no
   * aparece en ningún mes disponible del año.
   */
  _liveSearchByNomenclatura: function(nomenclatura) {
    const needle = String(nomenclatura || '').toUpperCase().trim();
    if (!needle) return null;

    const año = OCDS_API._extraerAñoNomenclatura(needle);
    if (!año) return null;

    // Intentar obtener meses de /files?year=X. Si está vacío (típico en año
    // actual — el API publica el paquete mensual con retraso), usar fallback:
    // para año actual probar 1 hasta mes actual, para año pasado probar 1-12.
    let meses = OCDS_INDEX._getMesesDisponibles(año);
    if (meses.length === 0) {
      const hoy = new Date();
      const añoActual = hoy.getFullYear();
      const mesActual = hoy.getMonth() + 1;
      if (año === añoActual) {
        // Año en curso: probar desde mes actual hacia atrás
        meses = [];
        for (let m = mesActual; m >= 1; m--) meses.push(m);
      } else if (año < añoActual) {
        // Año pasado: probar todos los meses
        meses = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
      } else {
        return null; // año futuro, nada que hacer
      }
    } else {
      // Meses del más reciente al más antiguo (mayor probabilidad de match reciente)
      meses.sort(function(a, b) { return b - a; });
    }

    // Asegurar que la hoja exista para poder cachear; agregar col MES si falta
    let sheet = Utils.getSheetSafe(CONFIG.SHEETS.OCDS_INDEX);
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(CONFIG.SHEETS.OCDS_INDEX);
      sheet.getRange(1, 1, 1, 7).setValues([['NOMENCLATURA', 'TENDER_ID', 'OCID', 'ENTIDAD', 'VALOR', 'FECHA_ACTUALIZACION', 'MES']]);
      sheet.getRange(1, 1, 1, 7).setBackground('#059669').setFontColor('white').setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else if (sheet.getLastColumn() < 7) {
      sheet.getRange(1, 7).setValue('MES')
        .setBackground('#059669').setFontColor('white').setFontWeight('bold');
    }

    let encontrado = null;
    const rowsAcumuladas = [];
    const now = new Date();

    // Limitar tiempo total para no tocar el timeout de 30s de Apps Script
    const deadlineMs = Date.now() + 25000;

    for (let m = 0; m < meses.length && !encontrado; m++) {
      if (Date.now() > deadlineMs) break;
      const mes = meses[m];
      const dataSegmentationID = año + '-' + String(mes).padStart(2, '0');
      let page = 1;

      while (page <= 100 && !encontrado && Date.now() <= deadlineMs) {
        const url = CONFIG.OCDS_API.BASE_URL + '/records?sourceId=' + CONFIG.OCDS_API.SOURCE_V3 +
                    '&dataSegmentationID=' + dataSegmentationID + '&page=' + page;
        Utilities.sleep(CONFIG.OCDS_API.RATE_LIMIT_MS);

        try {
          const response = UrlFetchApp.fetch(url, {
            muteHttpExceptions: true,
            headers: { 'Accept': 'application/json', 'User-Agent': CONFIG.OCDS_API.BROWSER_UA }
          });
          if (response.getResponseCode() !== 200) break;
          const data = JSON.parse(response.getContentText());
          const records = data.records || [];
          if (records.length === 0) break;

          for (let r = 0; r < records.length; r++) {
            const record = records[r];
            const compiled = record.compiledRelease || {};
            const tender = compiled.tender || {};
            const buyer = compiled.buyer || {};
            const title = tender.title || '';
            const titleUpper = title.toUpperCase().trim();

            const entry = {
              nomenclatura: title,
              tenderId: tender.id || '',
              ocid: compiled.ocid || '',
              entidad: buyer.name || '',
              valor: tender.value ? tender.value.amount : 0
            };

            rowsAcumuladas.push([
              entry.nomenclatura, entry.tenderId, entry.ocid,
              entry.entidad, entry.valor, now, mes
            ]);

            if (!encontrado && titleUpper === needle) {
              encontrado = entry;
              // No cortamos el loop aquí: terminamos de acumular la página
              // actual para cachearla completa. Cortamos en el while.
            }
          }

          page++;
        } catch (e) {
          Logger.log('_liveSearchByNomenclatura fetch error page=' + page + ': ' + e);
          break;
        }
      }
    }

    // UN solo upsert al final (minimiza lecturas/escrituras sobre OCDS_INDEX)
    if (rowsAcumuladas.length > 0) {
      try {
        OCDS_INDEX._upsertRows(sheet, rowsAcumuladas);
      } catch (e) {
        Logger.log('_liveSearchByNomenclatura upsert final error: ' + e);
      }
    }

    return encontrado;
  },

  _fetch: function(url) {
    Utilities.sleep(CONFIG.OCDS_API.RATE_LIMIT_MS);
    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'Accept': 'application/json', 'User-Agent': CONFIG.OCDS_API.BROWSER_UA }
    });
    if (response.getResponseCode() !== 200) throw new Error('HTTP ' + response.getResponseCode());
    return JSON.parse(response.getContentText());
  },

  _transformarRecord: function(record) {
    const compiled = record.compiledRelease || record;
    const tender = compiled.tender || {};
    const awards = compiled.awards || [];
    const contracts = compiled.contracts || [];
    const parties = compiled.parties || [];

    // Postores
    const postores = (tender.tenderers || []).map(function(t) {
      return { ruc: (t.id || '').replace('PE-RUC-', ''), nombre: t.name || '', esGanador: false };
    });

    // Ganador
    let ganador = null, montoAdjudicado = null, fechaBuenaPro = null;
    if (awards.length > 0) {
      const award = awards[0];
      fechaBuenaPro = award.date;
      montoAdjudicado = award.value ? award.value.amount : null;
      if (award.suppliers && award.suppliers.length > 0) {
        ganador = {
          ruc: (award.suppliers[0].id || '').replace('PE-RUC-', ''),
          nombre: award.suppliers[0].name || ''
        };
        postores.forEach(function(p) { if (p.ruc === ganador.ruc) p.esGanador = true; });
      }
    }

    // Contrato
    let contrato = null;
    if (contracts.length > 0) {
      const c = contracts[0];
      contrato = {
        numero: c.title || c.id || '',
        monto: c.value ? c.value.amount : null,
        moneda: c.value ? c.value.currency : 'PEN',
        fechaFirma: c.dateSigned || '',
        inicio: c.period ? c.period.startDate : '',
        fin: c.period ? c.period.endDate : '',
        duracionDias: c.period ? c.period.durationInDays : null
      };
    }

    // Entidad
    let entidad = {};
    parties.forEach(function(p) {
      if (p.roles && p.roles.includes('buyer')) {
        const ids = p.additionalIdentifiers || [];
        entidad = {
          nombre: p.name || '',
          ruc: ids.length > 0 ? ids[0].id : '',
          direccion: p.address ? p.address.streetAddress : '',
          departamento: p.address ? p.address.department : '',
          telefono: p.contactPoint ? p.contactPoint.telephone : ''
        };
      }
    });

    // Documentos
    const documentos = [];
    (tender.documents || []).forEach(function(doc) {
      documentos.push({
        titulo: doc.title || '', tipo: doc.documentType || '',
        formato: doc.format || '', url: doc.url || '', fecha: doc.datePublished || ''
      });
    });
    contracts.forEach(function(c) {
      (c.documents || []).forEach(function(doc) {
        documentos.push({
          titulo: doc.title || 'Documento contrato', tipo: doc.documentType || 'contractSigned',
          formato: doc.format || '', url: doc.url || '', fecha: doc.datePublished || ''
        });
      });
    });

    // Items
    const items = (tender.items || []).map(function(item, idx) {
      return {
        numero: idx + 1, descripcion: item.description || '',
        cantidad: item.quantity || 1, unidad: item.unit ? item.unit.name : '',
        clasificacion: item.classification ? item.classification.description : ''
      };
    });

    return {
      ocid: compiled.ocid || '', tenderId: tender.id || '', nomenclatura: tender.title || '',
      descripcion: tender.description || '', tipoProcedimiento: tender.procurementMethodDetails || '',
      metodo: tender.procurementMethod || '', categoria: tender.mainProcurementCategory || '',
      valorReferencial: tender.value ? tender.value.amount : 0,
      moneda: tender.value ? tender.value.currency : 'PEN',
      fechaPublicacion: tender.datePublished || '',
      cronograma: {
        convocatoriaInicio: tender.tenderPeriod ? tender.tenderPeriod.startDate : '',
        convocatoriaFin: tender.tenderPeriod ? tender.tenderPeriod.endDate : '',
        consultasInicio: tender.enquiryPeriod ? tender.enquiryPeriod.startDate : '',
        consultasFin: tender.enquiryPeriod ? tender.enquiryPeriod.endDate : '',
        buenaPro: fechaBuenaPro
      },
      entidad: entidad, postores: postores, numPostores: postores.length,
      ganador: ganador, montoAdjudicado: montoAdjudicado, contrato: contrato,
      documentos: documentos, numDocumentos: documentos.length,
      items: items, numItems: items.length
    };
  },

  // ==================== HELPERS PARA SINCRONIZACIÓN HISTÓRICA ====================

  /**
   * Extrae el año de una nomenclatura
   * Ejemplo: CP-SM-36-2024-ELSE-1 → 2024
   */
  _extraerAñoNomenclatura: function(nomenclatura) {
    const match = nomenclatura.match(/-(\d{4})-/);
    return match ? parseInt(match[1]) : new Date().getFullYear();
  },

  /**
   * Construye el link OSCE usando tenderId
   */
  _construirLinkOSCE: function(nomenclatura, tenderId) {
    if (tenderId) {
      return 'https://prodapp2.seace.gob.pe/seacebus-uiwd-pub/buscadorPublico/buscadorPublico.xhtml?tenderId=' + tenderId;
    }
    return 'https://prodapp2.seace.gob.pe/seacebus-uiwd-pub/buscadorPublico/buscadorPublico.xhtml';
  },

  // ==================== SINCRONIZACIÓN INDIVIDUAL Y GRUPAL ====================

  /**
   * Sincroniza UN histórico individual con OCDS
   * Extrae automáticamente el año y guarda datos con año específico
   */
  sincronizarHistoricoIndividual: function(params) {
    Utils.validateParams(params, ['nomenclatura']);

    const nomenclatura = params.nomenclatura;
    const año = OCDS_API._extraerAñoNomenclatura(nomenclatura);

    // 1. Buscar en índice OCDS
    const indexData = OCDS_API._buscarEnIndice(nomenclatura);
    if (!indexData) {
      return Utils.errorResponse('No encontrado en índice OCDS: ' + nomenclatura);
    }

    // 2. Consultar API con tender_id
    const datosOCDS = OCDS_API.getByTenderId({
      tenderId: indexData.tenderId,
      source: CONFIG.OCDS_API.SOURCE_V3
    });

    if (!datosOCDS.success) {
      return datosOCDS;
    }

    const datos = datosOCDS.datos;
    const cronograma = datos.cronograma || {};
    const linkOSCE = OCDS_API._construirLinkOSCE(nomenclatura, indexData.tenderId);

    // 3. Actualizar cada etapa CON año y link
    let etapasActualizadas = 0;

    // Convocatoria
    if (cronograma.convocatoriaInicio) {
      Seguimiento.updateEtapa({
        nomenclatura: nomenclatura,
        etapa: 'CONVOCATORIA',
        estado: 'COMPLETADO',
        fechaInicio: cronograma.convocatoriaInicio,
        fechaFin: cronograma.convocatoriaFin,
        año: año,
        link: linkOSCE
      });
      etapasActualizadas++;
    }

    // Consultas/Observaciones
    if (cronograma.consultasInicio) {
      Seguimiento.updateEtapa({
        nomenclatura: nomenclatura,
        etapa: 'CONSULTAS_OBSERVACIONES',
        estado: 'COMPLETADO',
        fechaInicio: cronograma.consultasInicio,
        fechaFin: cronograma.consultasFin,
        año: año,
        link: linkOSCE
      });
      etapasActualizadas++;
    }

    // Buena Pro
    if (cronograma.buenaPro) {
      Seguimiento.updateEtapa({
        nomenclatura: nomenclatura,
        etapa: 'BUENA_PRO',
        estado: 'COMPLETADO',
        fechaInicio: cronograma.buenaPro,
        fechaFin: cronograma.buenaPro,
        año: año,
        link: linkOSCE
      });
      etapasActualizadas++;
    }

    return Utils.successResponse({
      etapasActualizadas: etapasActualizadas,
      año: año,
      linkOSCE: linkOSCE
    }, 'Histórico ' + nomenclatura + ' (' + año + ') sincronizado con ' + etapasActualizadas + ' etapas');
  },

  /**
   * Sincroniza TODOS los históricos de un grupo
   * Consulta uno por uno y guarda cada año por separado
   */
  sincronizarGrupoHistorico: function(params) {
    Utils.validateParams(params, ['nomenclaturaActual']);

    // 1. Obtener grupo
    const grupo = GruposHistoricos.getByNomenclatura({
      nomenclatura: params.nomenclaturaActual
    });

    if (!grupo.success || !grupo.grupo) {
      return Utils.errorResponse('Grupo no encontrado para: ' + params.nomenclaturaActual);
    }

    const historicos = grupo.grupo.NOMENCLATURAS_HISTORICOS || [];
    const resultados = [];
    let totalEtapas = 0;

    // 2. Sincronizar nomenclatura actual
    try {
      const resultadoActual = OCDS_API.sincronizarHistoricoIndividual({
        nomenclatura: params.nomenclaturaActual
      });
      if (resultadoActual.success) {
        resultados.push({
          nomenclatura: params.nomenclaturaActual,
          año: resultadoActual.año,
          etapas: resultadoActual.etapasActualizadas,
          success: true
        });
        totalEtapas += resultadoActual.etapasActualizadas;
      } else {
        resultados.push({
          nomenclatura: params.nomenclaturaActual,
          success: false,
          error: resultadoActual.error || 'Error desconocido'
        });
      }
    } catch(e) {
      resultados.push({
        nomenclatura: params.nomenclaturaActual,
        success: false,
        error: e.toString()
      });
    }

    // 3. Sincronizar cada histórico
    historicos.forEach(function(nomenclatura) {
      try {
        const resultado = OCDS_API.sincronizarHistoricoIndividual({
          nomenclatura: nomenclatura
        });

        if (resultado.success) {
          resultados.push({
            nomenclatura: nomenclatura,
            año: resultado.año,
            etapas: resultado.etapasActualizadas,
            success: true
          });
          totalEtapas += resultado.etapasActualizadas;
        } else {
          resultados.push({
            nomenclatura: nomenclatura,
            success: false,
            error: resultado.error || 'Error desconocido'
          });
        }
      } catch(e) {
        resultados.push({
          nomenclatura: nomenclatura,
          success: false,
          error: e.toString()
        });
      }
    });

    return Utils.successResponse({
      totalHistoricos: historicos.length + 1,
      totalEtapasActualizadas: totalEtapas,
      resultados: resultados
    }, 'Sincronizados ' + (historicos.length + 1) + ' históricos con ' + totalEtapas + ' etapas totales');
  }
};

// ==================== MÓDULO: OCDS INDEX (Generador de índice) ====================

const OCDS_INDEX = {
  /**
   * Actualiza el índice descargando datos de la API
   */
  actualizar: function(params) {
    const year = parseInt(params.year) || new Date().getFullYear();
    const monthFilter = params.month ? parseInt(params.month) : null;
    const entidadFiltro = params.entidad || null;

    // Crear hoja si no existe; si existe pero no tiene columna MES (G), agregarla
    let sheet = Utils.getSheetSafe(CONFIG.SHEETS.OCDS_INDEX);
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(CONFIG.SHEETS.OCDS_INDEX);
      sheet.getRange(1, 1, 1, 7).setValues([['NOMENCLATURA', 'TENDER_ID', 'OCID', 'ENTIDAD', 'VALOR', 'FECHA_ACTUALIZACION', 'MES']]);
      sheet.getRange(1, 1, 1, 7).setBackground('#059669').setFontColor('white').setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else if (sheet.getLastColumn() < 7) {
      // Migrar: agregar encabezado MES en columna G
      sheet.getRange(1, 7).setValue('MES')
        .setBackground('#059669').setFontColor('white').setFontWeight('bold');
    }

    // Obtener meses desde /files?year=X. Si está vacío (típico en año actual),
    // probar igual 1..12 o 1..mes-actual; _descargarMes retorna [] si no hay
    // data para ese mes específico, así que no es costoso.
    let mesesDisponibles = OCDS_INDEX._getMesesDisponibles(year);
    if (mesesDisponibles.length === 0) {
      const hoy = new Date();
      const añoActual = hoy.getFullYear();
      const mesActual = hoy.getMonth() + 1;
      if (year === añoActual) {
        mesesDisponibles = [];
        for (let m = 1; m <= mesActual; m++) mesesDisponibles.push(m);
      } else if (year < añoActual) {
        mesesDisponibles = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      } else {
        return Utils.errorResponse('Año ' + year + ' es futuro, no hay datos');
      }
    }

    // Filtrar por mes específico si se pidió
    const mesesAProcesar = monthFilter
      ? mesesDisponibles.filter(function(m) { return m === monthFilter; })
      : mesesDisponibles;

    if (monthFilter && mesesAProcesar.length === 0) {
      return Utils.errorResponse('El mes ' + monthFilter + '/' + year + ' no está disponible en el API OCDS aún');
    }

    let totalProcesos = 0;
    const errores = [];

    mesesAProcesar.forEach(function(mes) {
      try {
        const procesos = OCDS_INDEX._descargarMes(year, mes, entidadFiltro);
        if (procesos.length > 0) {
          const rows = procesos.map(function(p) {
            // Ahora la fila tiene 7 columnas, incluyendo MES al final
            return [p.nomenclatura, p.tenderId, p.ocid, p.entidad, p.valor, new Date(), mes];
          });
          OCDS_INDEX._upsertRows(sheet, rows);
          totalProcesos += procesos.length;
        }
      } catch(e) {
        errores.push(year + '-' + mes + ': ' + e.toString());
      }
    });

    return Utils.successResponse({
      procesados: totalProcesos,
      meses: mesesAProcesar.length,
      year: year,
      month: monthFilter,
      errores: errores
    }, 'Índice actualizado con ' + totalProcesos + ' procesos' + (monthFilter ? ' para ' + year + '-' + String(monthFilter).padStart(2, '0') : ''));
  },

  /**
   * Retorna el estado del índice por año/mes comparado con lo disponible en
   * el API OCDS. Para cada año presente en el índice (+ año actual):
   *   - cuenta de procesos indexados por mes (si tiene columna MES)
   *   - última fecha de actualización por mes
   *   - qué meses están disponibles en el API OCDS
   *
   * El año se extrae de NOMENCLATURA (formato: PREFIX-YYYY-SUFIJO) — 100% confiable.
   * El mes se lee de la columna G (MES) si existe; si no, va a "sin mes" (mes 0).
   * Los scrapes nuevos populan MES automáticamente; los viejos quedan en "sin mes"
   * hasta que se re-scrapen.
   *
   * @returns { años: { 2026: { total, sinMes, meses: { 1: {...}, ... } } } }
   */
  stats: function(params) {
    const sheet = Utils.getSheetSafe(CONFIG.SHEETS.OCDS_INDEX);

    const index = {}; // { year: { total, sinMes, meses: {1: {count, lastUpdate}, ...} } }

    if (sheet) {
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      if (lastRow > 1) {
        // Leer columnas: A (NOMENCLATURA), F (FECHA_ACTUALIZACION), G (MES si existe)
        const numCols = Math.max(lastCol, 6);
        const data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
        const tieneColMes = lastCol >= 7;

        for (let i = 0; i < data.length; i++) {
          const nomenclatura = String(data[i][0] || '');
          const fechaAct = data[i][5];
          const mesRaw = tieneColMes ? data[i][6] : null;

          // Extraer año de nomenclatura. Las nomenclaturas tienen varios
          // grupos -XX- separados por guiones; el año real viene casi
          // siempre al final (TIPO-METODO-NUMERO-YEAR-ENTIDAD-VERSION).
          // Por eso: buscamos TODOS los matches de -YYYY- y tomamos el último
          // que caiga en el rango realista 2010-2030.
          const yearRegex = /-(20[1-2]\d)-/g;
          let yearMatch = null;
          let m;
          while ((m = yearRegex.exec(nomenclatura)) !== null) {
            const y = parseInt(m[1]);
            if (y >= 2010 && y <= 2030) yearMatch = y;
          }
          if (!yearMatch) continue;
          const year = yearMatch;

          // Extraer mes de columna MES si existe, sino null
          const month = (mesRaw && !isNaN(parseInt(mesRaw))) ? parseInt(mesRaw) : null;

          if (!index[year]) index[year] = { total: 0, sinMes: 0, meses: {} };
          index[year].total++;

          if (month && month >= 1 && month <= 12) {
            if (!index[year].meses[month]) index[year].meses[month] = { count: 0, lastUpdate: null };
            index[year].meses[month].count++;
            if (fechaAct) {
              const cur = index[year].meses[month].lastUpdate;
              if (!cur || fechaAct > cur) {
                index[year].meses[month].lastUpdate = fechaAct;
              }
            }
          } else {
            index[year].sinMes++;
          }
        }
      }
    }

    // Asegurar que el año actual aparezca aunque esté vacío
    const añoActual = new Date().getFullYear();
    if (!index[añoActual]) index[añoActual] = { total: 0, sinMes: 0, meses: {} };

    // Para cada año, consultar API cuáles meses están disponibles
    const años = Object.keys(index).map(function(y) { return parseInt(y); }).sort(function(a, b) { return b - a; });
    const resultado = {};

    años.forEach(function(año) {
      const mesesDisponiblesAPI = OCDS_INDEX._getMesesDisponibles(año);
      const mesesStatus = {};

      for (let m = 1; m <= 12; m++) {
        const entry = index[año].meses[m];
        const count = entry ? entry.count : 0;
        const lastUpdate = entry ? entry.lastUpdate : null;
        const disponibleAPI = mesesDisponiblesAPI.indexOf(m) !== -1;

        // Status:
        //   indexed    → en API y en índice (puede ser parcial, pero usuario puede re-scrapear)
        //   missing    → en API pero NO en índice (falta scrapear)
        //   extra      → en índice pero NO en API (raro, quedó de antes)
        //   unavailable → no en API ni en índice (nada que hacer)
        let status = 'unavailable';
        if (disponibleAPI && count > 0) status = 'indexed';
        else if (disponibleAPI && count === 0) status = 'missing';
        else if (!disponibleAPI && count > 0) status = 'extra';

        mesesStatus[m] = {
          count: count,
          lastUpdate: lastUpdate ? (lastUpdate instanceof Date ? lastUpdate.toISOString() : String(lastUpdate)) : null,
          disponibleAPI: disponibleAPI,
          status: status
        };
      }

      resultado[año] = {
        total: index[año].total,
        sinMes: index[año].sinMes || 0,
        meses: mesesStatus,
        mesesDisponiblesAPI: mesesDisponiblesAPI
      };
    });

    return Utils.successResponse({ años: resultado });
  },

  _getMesesDisponibles: function(year) {
    try {
      const url = CONFIG.OCDS_API.BASE_URL + '/files?year=' + year + '&source=' + CONFIG.OCDS_API.SOURCE_V3;
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'Accept': 'application/json', 'User-Agent': CONFIG.OCDS_API.BROWSER_UA } });
      if (response.getResponseCode() !== 200) return [];
      const data = JSON.parse(response.getContentText());
      return (data.results || []).map(function(r) { return parseInt(r.month); });
    } catch(e) { return []; }
  },

  _descargarMes: function(year, month, entidadFiltro) {
    const procesos = [];
    const dataSegmentationID = year + '-' + String(month).padStart(2, '0');
    const entidadUpper = entidadFiltro ? entidadFiltro.toUpperCase() : null;
    let page = 1;

    while (page <= 100) {
      const url = CONFIG.OCDS_API.BASE_URL + '/records?sourceId=' + CONFIG.OCDS_API.SOURCE_V3 +
                  '&dataSegmentationID=' + dataSegmentationID + '&page=' + page;
      Utilities.sleep(CONFIG.OCDS_API.RATE_LIMIT_MS);

      try {
        const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'Accept': 'application/json', 'User-Agent': CONFIG.OCDS_API.BROWSER_UA } });
        if (response.getResponseCode() !== 200) break;
        const data = JSON.parse(response.getContentText());
        const records = data.records || [];
        if (records.length === 0) break;

        records.forEach(function(record) {
          const compiled = record.compiledRelease || {};
          const tender = compiled.tender || {};
          const buyer = compiled.buyer || {};
          const nomenclatura = tender.title || '';
          const buyerName = buyer.name || '';

          if (entidadUpper) {
            if (!buyerName.toUpperCase().includes(entidadUpper) && !nomenclatura.toUpperCase().includes(entidadUpper)) return;
          }

          procesos.push({
            nomenclatura: nomenclatura, tenderId: tender.id || '', ocid: compiled.ocid || '',
            entidad: buyerName, valor: tender.value ? tender.value.amount : 0
          });
        });
        page++;
      } catch(e) { break; }
    }
    return procesos;
  },

  _upsertRows: function(sheet, rows) {
    if (!rows || rows.length === 0) return;

    const lastRow = sheet.getLastRow();
    const existingNoms = {};

    // Leer SOLO columna A (nomenclatura) para construir el map.
    // En OCDS_INDEX con 124K+ filas, esto es ~6x más eficiente que
    // leer toda la hoja (6 columnas × 124K celdas).
    if (lastRow > 1) {
      const colA = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < colA.length; i++) {
        if (colA[i][0]) {
          existingNoms[String(colA[i][0]).trim().toUpperCase()] = i + 2;
        }
      }
    }

    const newRows = [];
    rows.forEach(function(row) {
      const key = String(row[0] || '').trim().toUpperCase();
      if (!key) return;
      if (existingNoms[key]) {
        sheet.getRange(existingNoms[key], 1, 1, row.length).setValues([row]);
      } else {
        newRows.push(row);
      }
    });

    if (newRows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
    }
  }
};

// ==================== MENÚ Y UTILIDADES DE SHEETS ====================

/**
 * Crea menú personalizado al abrir el documento
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🔷 SEACE Intelligence')
    .addItem('📥 Procesar Import SEACE', 'menuProcesarImport')
    .addItem('📊 Ver Estadísticas', 'menuMostrarEstadisticas')
    .addSeparator()
    .addItem('📁 Autorizar Google Drive', 'menuAutorizarDrive')
    .addItem('📁 Crear Carpetas para Seguimientos', 'menuCrearCarpetasParaTodos')
    .addSeparator()
    .addItem('⚙️ Crear/Actualizar Hojas Base', 'menuCrearHojasBase')
    .addItem('🔄 Actualizar Estados Cronograma', 'menuActualizarEstadosCronograma')
    .addSeparator()
    .addSubMenu(ui.createMenu('🧪 Pruebas OCDS')
      .addItem('🔌 Probar Conexión API', 'testConexionOCDS')
      .addItem('🔍 Buscar Proceso', 'testBuscarProceso'))
    .addToUi();
}

/**
 * Wrapper del menú para procesar import
 */
function menuProcesarImport() {
  const ui = SpreadsheetApp.getUi();

  const resultado = Import.procesar({});

  if (resultado.success) {
    ui.alert(
      '✅ Import Procesado',
      'Nuevos registros: ' + resultado.nuevos + '\n' +
      'Saltados (duplicados): ' + resultado.duplicadosExactos + '\n' +
      'Sin nomenclatura: ' + resultado.sinNomenclatura + '\n' +
      'Total en BD: ' + resultado.totalEnBD,
      ui.ButtonSet.OK
    );
  } else {
    ui.alert('❌ Error', resultado.error, ui.ButtonSet.OK);
  }
}

/**
 * Muestra estadísticas en un diálogo
 */
function menuMostrarEstadisticas() {
  const stats = Estadisticas.get({});

  let msg = '📊 ESTADÍSTICAS SEACE\n\n';
  msg += 'Total Procesos: ' + stats.totalProcesos + '\n';
  msg += 'Valor Total: S/ ' + stats.valorTotal.toLocaleString() + '\n\n';
  msg += 'Por Objeto:\n';

  for (const key in stats.porObjeto) {
    msg += '  • ' + key + ': ' + stats.porObjeto[key] + '\n';
  }

  msg += '\nPor Año:\n';
  const anios = Object.keys(stats.porAnio).sort().reverse();
  anios.forEach(function(anio) {
    msg += '  • ' + anio + ': ' + stats.porAnio[anio] + ' procesos\n';
  });

  SpreadsheetApp.getUi().alert(msg);
}

/**
 * Autoriza permisos de Google Drive
 */
function menuAutorizarDrive() {
  const ui = SpreadsheetApp.getUi();

  try {
    DriveApp.getRootFolder();
    const carpetaRaiz = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    const nombreCarpeta = carpetaRaiz.getName();

    ui.alert(
      '✅ Google Drive Autorizado',
      'Permisos configurados correctamente.\n\n' +
      'Carpeta raíz: ' + nombreCarpeta + '\n' +
      'ID: ' + CONFIG.DRIVE_FOLDER_ID,
      ui.ButtonSet.OK
    );
  } catch(e) {
    ui.alert(
      '❌ Error de Autorización',
      'Error: ' + e.toString() + '\n\n' +
      'Verifica que:\n' +
      '1. El ID de carpeta sea correcto: ' + CONFIG.DRIVE_FOLDER_ID + '\n' +
      '2. Tengas acceso a esa carpeta',
      ui.ButtonSet.OK
    );
  }
}

/**
 * Crea carpetas en Drive para todos los seguimientos sin carpeta
 */
function menuCrearCarpetasParaTodos() {
  const ui = SpreadsheetApp.getUi();
  const seguimientos = Seguimiento.getAll();

  let creadas = 0;
  let errores = 0;
  let yaExistian = 0;

  seguimientos.forEach(function(s) {
    if (!s.CARPETA_DRIVE) {
      try {
        const resultado = Drive.crearCarpetaProceso({
          nomenclatura: s.NOMENCLATURA,
          entidad: s.ENTIDAD
        });

        if (resultado.success) {
          if (resultado.existe) {
            yaExistian++;
          } else {
            creadas++;
          }
          // Actualizar la URL en seguimiento
          Seguimiento.update({
            nomenclatura: s.NOMENCLATURA,
            carpetaDrive: resultado.url
          });
        } else {
          errores++;
        }
      } catch(e) {
        errores++;
      }
    } else {
      yaExistian++;
    }
  });

  ui.alert(
    '📁 Carpetas Procesadas',
    'Creadas: ' + creadas + '\n' +
    'Ya existían: ' + yaExistian + '\n' +
    'Errores: ' + errores,
    ui.ButtonSet.OK
  );
}

/**
 * Actualiza estados de cronograma basado en fechas
 */
function menuActualizarEstadosCronograma() {
  const sheet = Utils.getSheetSafe(CONFIG.SHEETS.CRONOGRAMA);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Hoja CRONOGRAMA no encontrada');
    return;
  }

  const data = sheet.getDataRange().getValues();
  const hoy = new Date();
  let actualizados = 0;

  for (let i = 1; i < data.length; i++) {
    const fechaFin = new Date(data[i][3]); // FECHA_FIN
    const fechaInicio = new Date(data[i][2]); // FECHA_INICIO
    const estadoActual = data[i][4];

    let nuevoEstado = estadoActual;

    if (hoy > fechaFin && estadoActual !== ESTADOS_ETAPA.COMPLETADO) {
      nuevoEstado = ESTADOS_ETAPA.VENCIDO;
    } else if (hoy >= fechaInicio && hoy <= fechaFin && estadoActual === ESTADOS_ETAPA.PENDIENTE) {
      nuevoEstado = ESTADOS_ETAPA.EN_CURSO;
    }

    if (nuevoEstado !== estadoActual) {
      sheet.getRange(i + 1, 5).setValue(nuevoEstado);
      actualizados++;
    }
  }

  SpreadsheetApp.getUi().alert('Estados actualizados: ' + actualizados);
}

/**
 * Crea o actualiza las hojas base del sistema
 */
function menuCrearHojasBase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Headers para SEGUIMIENTO
  const headersSeguimiento = [
    'NOMENCLATURA', 'ENTIDAD', 'OBJETO', 'VALOR', 'REGION',
    'ESTADO_INTERES', 'PRIORIDAD', 'RESPONSABLE', 'NOTAS', 'FECHA_AGREGADO', 'CARPETA_DRIVE'
  ];

  // Agregar columnas de etapas con años históricos
  ETAPAS_SEACE.forEach(function(etapa) {
    // Agregar columnas generales (estado y notas aplican a todo)
    headersSeguimiento.push(etapa + '_ESTADO');
    headersSeguimiento.push(etapa + '_NOTAS');

    // Agregar columnas específicas por año (fecha inicio, fin, link OSCE)
    AÑOS_HISTORICOS.forEach(function(año) {
      headersSeguimiento.push(
        etapa + '_' + año + '_INICIO',
        etapa + '_' + año + '_FIN',
        etapa + '_' + año + '_LINK'
      );
    });
  });

  const hojas = [
    {
      name: CONFIG.SHEETS.IMPORT,
      headers: ['N°', 'Nombre o Sigla de la Entidad', 'Fecha y Hora de Publicacion',
                'Nomenclatura', 'Reiniciado Desde', 'Objeto de Contratación',
                'Descripción de Objeto', 'VR / VE / Cuantía de la contratación',
                'Moneda', 'Versión SEACE']
    },
    {
      name: CONFIG.SHEETS.BD,
      headers: ['ID', 'NOMENCLATURA', 'ENTIDAD', 'REGION', 'OBJETO', 'DESCRIPCION',
                'VALOR', 'MONEDA', 'FECHA_PUB', 'VERSION', 'REINICIADO', 'URL',
                'EMPRESA_CORTA', 'ESTADO_FECHA', 'TIPO_SERVICIO']  // v3.1: Columnas de clasificación
    },
    {
      name: CONFIG.SHEETS.CRONOGRAMA,
      headers: ['NOMENCLATURA', 'ETAPA', 'FECHA_INICIO', 'FECHA_FIN', 'ESTADO']
    },
    {
      name: CONFIG.SHEETS.SEGUIMIENTO,
      headers: headersSeguimiento
    },
    {
      name: CONFIG.SHEETS.DOCUMENTOS,
      headers: ['NOMENCLATURA', 'NOMBRE', 'TIPO', 'ETAPA', 'URL_DRIVE', 'FECHA_AGREGADO',
                'AÑO_PROCESO', 'ES_HISTORICO', 'NOMENCLATURA_GRUPO']
    },
    {
      name: CONFIG.SHEETS.FILTROS_ENTIDADES,
      headers: ['ENTIDAD', 'ACTIVO']
    },
    {
      name: CONFIG.SHEETS.FILTROS_PALABRAS,
      headers: ['PALABRA', 'ACTIVO']
    },
    {
      name: CONFIG.SHEETS.REGIONES,
      headers: ['PATRON', 'REGION']
    },
    {
      name: CONFIG.SHEETS.GRUPOS_HISTORICOS,
      headers: ['ID_GRUPO', 'NOMENCLATURA_ACTUAL', 'NOMENCLATURAS_HISTORICOS',
                'FECHA_CREACION', 'NOTAS', 'CARPETA_DRIVE']
    },
    {
      name: CONFIG.SHEETS.DATOS_SEACE,
      headers: ['NOMENCLATURA', 'FECHA_SCRAPING', 'OCID', 'TENDER_ID', 'URL_SEACE', 'SOURCE_ID',
                'CRONOGRAMA_JSON', 'DOCUMENTOS_JSON', 'POSTORES_JSON', 'CONTRATO_JSON',
                'ACCIONES_JSON', 'ITEMS_JSON', 'COMITE_JSON', 'CONSULTAS_JSON', 'OFERTAS_JSON',
                'ESTADO_SCRAPING', 'ERROR_MENSAJE', 'FUENTE']
    },
    {
      name: CONFIG.SHEETS.FILTROS_EMPRESAS_ELECTRICAS,
      headers: ['ITEM', 'NOMBRE_COMPLETO', 'NOMBRE_CORTO', 'PATRON_BUSQUEDA', 'COLOR_HEX', 'ACTIVO'],
      datosDefault: [
        [1, 'Consorcio Eléctrico de Villacurí S.A.C.', 'VILLACURI', 'VILLACURI', '#E3F2FD', true],
        [2, 'Electricidad Pangoa S.A. - EGEPSA', 'EGEPSA', 'EGEPSA|PANGOA', '#E8F5E9', true],
        [3, 'Electro Dunas S.A.A.', 'ELECTRO DUNAS', 'ELECTRO DUNAS|DUNAS', '#FFF3E0', true],
        [4, 'Electro Tocache S.A.', 'ELECTRO TOCACHE', 'TOCACHE', '#FCE4EC', true],
        [5, 'Electrocentro S.A.', 'ELECTROCENTRO', 'ELECTROCENTRO|ELECTRO.*CENTRO', '#F3E5F5', true],
        [6, 'Electronoroeste S.A. - ENOSA', 'ENOSA', 'ENOSA|NOR.*OESTE|ELECTRONOROESTE', '#E0F7FA', true],
        [7, 'Empresa de Generación Eléctrica de Arequipa S.A. - EGASA', 'EGASA', 'EGASA|GENERACION.*AREQUIPA', '#FFF8E1', true],
        [8, 'Empresa Regional de Servicio Público de Electricidad del Sur Este S.A.A. - ELSE', 'ELSE', 'ELSE|SUR.*ESTE', '#E8EAF6', true],
        [9, 'Empresa Regional de Servicio Público de Electricidad - ELECTRO ORIENTE', 'ELECTRO ORIENTE', 'ELECTRO.*ORIENTE|ORIENTE', '#EFEBE9', true],
        [10, 'Empresa de Administración de Infraestructura Eléctrica S.A. - ADINELSA', 'ADINELSA', 'ADINELSA', '#ECEFF1', true],
        [11, 'Empresa Regional de Servicio Público de Electricidad ELECTROSUR S.A.', 'ELECTROSUR', 'ELECTROSUR', '#FBE9E7', true],
        [12, 'Empresa de Servicios Eléctricos Municipal de Pativilca S.A.C. - ESEMPAT S.A.C.', 'ESEMPAT', 'ESEMPAT|PATIVILCA', '#F1F8E9', true],
        [13, 'Empresa de Servicios Eléctricos Municipales de Paramonga S.A. - EMSEM S.A.', 'EMSEM', 'EMSEM|PARAMONGA', '#E0F2F1', true],
        [14, 'Empresa Municipal de Servicios Eléctricos Utcubamba S.A.C. - EMSEU S.A.C.', 'EMSEU', 'EMSEU|UTCUBAMBA', '#FFF9C4', true],
        [15, 'Empresa Regional de Servicio Público de Electricidad de Puno S.A.A.', 'ELECTRO PUNO', 'ELECTRO.*PUNO|PUNO.*ELECTRI', '#FFECB3', true],
        [16, 'Empresa Regional de Servicio Público de Electricidad Electronortemedio S.A. - HIDRANDINA', 'HIDRANDINA', 'HIDRANDINA|ELECTRONORTEMEDIO|NOR.*MEDIO', '#B3E5FC', true],
        [17, 'Luz del Sur S.A.A.', 'LUZ DEL SUR', 'LUZ.*SUR', '#DCEDC8', true],
        [18, 'Pluz Energía Perú S.A.A. (antes Enel Distribución Perú S.A.A.)', 'PLUZ/ENEL', 'PLUZ|ENEL', '#F0F4C3', true],
        [19, 'Servicios Eléctricos Rioja S.A. - SERSA', 'SERSA', 'SERSA|RIOJA', '#FFE0B2', true],
        [20, 'Sociedad Eléctrica del Sur Oeste S.A. - SEAL', 'SEAL', 'SEAL|SUR.*OESTE', '#D1C4E9', true],
        [21, 'Empresa de Servicio Público de Electricidad Electronorte S.A.', 'ELECTRONORTE', 'ELECTRONORTE', '#FFCDD2', true],
        [22, 'Empresa Concesionaria de Electricidad de Ucayali S.A.', 'ELECTRO UCAYALI', 'UCAYALI', '#C8E6C9', true],
        [23, 'Organismo Supervisor de la Inversión en Energía y Minería', 'OSINERGMIN', 'OSINERGMIN', '#B2DFDB', true],
        [24, 'Empresa de Generación Eléctrica San Gabán S.A.', 'SAN GABAN', 'SAN.*GABAN', '#FFCCBC', true],
        [25, 'Empresa de Generación Eléctrica Machupicchu S.A.', 'MACHUPICCHU', 'MACHUPICCHU', '#D7CCC8', true]
      ]
    },
    {
      name: CONFIG.SHEETS.HISTORICOS_DETALLE,
      headers: ['NOMENCLATURA', 'AÑO', 'ENTIDAD', 'ENTIDAD_RUC', 'ENTIDAD_DIRECCION', 'ENTIDAD_TELEFONO',
                'OBJETO', 'VALOR_REFERENCIAL', 'MONTO_ADJUDICADO', 'GANADOR_RUC', 'GANADOR_NOMBRE',
                'FECHA_CONVOCATORIA', 'FECHA_BUENA_PRO', 'NUMERO_CONTRATO', 'TOTAL_POSTORES', 'ESTADO_PROCESO',
                'LINK_SEACE', 'LINK_OSCE', 'CRONOGRAMA_JSON', 'DOCUMENTOS_JSON', 'POSTORES_JSON',
                'COMITE_JSON', 'CONSULTAS_JSON', 'ACCIONES_JSON', 'ACUERDOS_JSON', 'CONTRATO_JSON',
                'DATOS_COMPLETOS_JSON', 'FECHA_EXTRACCION', 'FUENTE']
    }
  ];

  hojas.forEach(function(hoja) {
    let sheet = ss.getSheetByName(hoja.name);
    if (!sheet) {
      sheet = ss.insertSheet(hoja.name);
    }

    // Configurar headers
    const headerRange = sheet.getRange(1, 1, 1, hoja.headers.length);
    headerRange.setValues([hoja.headers]);
    headerRange
      .setBackground('#1e40af')
      .setFontColor('white')
      .setFontWeight('bold');

    sheet.setFrozenRows(1);

    // Insertar datos por defecto si existen (solo para hojas nuevas sin datos)
    if (hoja.datosDefault && sheet.getLastRow() === 1) {
      sheet.getRange(2, 1, hoja.datosDefault.length, hoja.datosDefault[0].length).setValues(hoja.datosDefault);
    }

    // Ajustar ancho de columnas
    for (let i = 1; i <= hoja.headers.length; i++) {
      sheet.setColumnWidth(i, 120);
    }
  });

  SpreadsheetApp.getUi().alert(
    '✅ Hojas Configuradas',
    'Las siguientes hojas han sido creadas/actualizadas:\n\n' +
    hojas.map(function(h) { return '• ' + h.name; }).join('\n'),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ==================== FUNCIÓN PARA INSTALAR MENÚ MANUALMENTE ====================

/**
 * Ejecuta esta función manualmente si el menú no aparece automáticamente
 * Ve a Ejecutar > ejecutarInstalacionManual en el editor de Apps Script
 */
function ejecutarInstalacionManual() {
  onOpen();
  SpreadsheetApp.getUi().alert(
    '✅ Menú Instalado',
    'El menú "🔷 SEACE Intelligence" ha sido agregado.\n\n' +
    'Lo encontrarás en la barra de menú superior.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Configura el trigger para que onOpen se ejecute automáticamente
 */
function configurarTrigger() {
  // Eliminar triggers existentes
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'onOpen') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Crear nuevo trigger
  ScriptApp.newTrigger('onOpen')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onOpen()
    .create();

  SpreadsheetApp.getUi().alert(
    '✅ Trigger Configurado',
    'El menú ahora aparecerá automáticamente cada vez que abras el documento.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ==================== FUNCIONES LEGACY (compatibilidad) ====================

// Mantener compatibilidad con llamadas antiguas
function procesarImportSEACE() { return Import.procesar({}); }
function getProcesos(params) { return Procesos.getAll(params || {}); }
function getSeguimiento() { return Seguimiento.getAll(); }
function getEstadisticas() { return Estadisticas.get({}); }
function getRegionesConProcesos() { return Estadisticas.getRegiones({}); }
function getEntidadesUnicas() { return Estadisticas.getEntidadesUnicas({}); }
function getFiltrosEntidades() { return Filtros.getEntidades({}); }
function getFiltrosPalabras() { return Filtros.getPalabras({}); }
function getCronograma(nomenclatura) { return Cronograma.get({ nomenclatura: nomenclatura }); }
function getDocumentos(nomenclatura) { return Documentos.get({ nomenclatura: nomenclatura }); }

function addSeguimiento(nomenclatura, estado, prioridad, notas) {
  return Seguimiento.add({ nomenclatura: nomenclatura, estado: estado, prioridad: prioridad, notas: notas });
}

function updateSeguimiento(nomenclatura, estado, prioridad, notas) {
  return Seguimiento.update({ nomenclatura: nomenclatura, estado: estado, prioridad: prioridad, notas: notas });
}

function addFiltroEntidad(entidad) { return Filtros.addEntidad({ entidad: entidad }); }
function addFiltroPalabra(palabra) { return Filtros.addPalabra({ palabra: palabra }); }

function crearCarpetaProcesoEnDrive(nomenclatura, entidad) {
  return Drive.crearCarpetaProceso({ nomenclatura: nomenclatura, entidad: entidad });
}

// ==================== FUNCIONES DE PRUEBA ====================

// ==================== MÓDULO: EMPRESAS ELÉCTRICAS (v2.0) ====================

const EmpresasElectricas = {
  /**
   * Obtiene la lista de empresas eléctricas configuradas para filtrado
   * @returns {Object} Lista de empresas con sus patrones y colores
   */
  getAll: function() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEETS.FILTROS_EMPRESAS_ELECTRICAS);

    // Si no existe la hoja, crearla con datos por defecto
    if (!sheet) {
      sheet = EmpresasElectricas._crearHoja();
    }

    const data = sheet.getDataRange().getValues();
    const empresas = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[5] === true || row[5] === 'TRUE') { // ACTIVO
        empresas.push({
          item: row[0],
          nombreCompleto: row[1],
          nombreCorto: row[2],
          patronBusqueda: row[3],
          colorHex: row[4],
          activo: true
        });
      }
    }

    return Utils.successResponse({
      empresas: empresas,
      total: empresas.length
    });
  },

  /**
   * Actualiza el estado activo/inactivo de una empresa
   * @param {Object} params - {item: number, activo: boolean}
   */
  toggle: function(params) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.FILTROS_EMPRESAS_ELECTRICAS);

    if (!sheet) {
      return Utils.errorResponse('Hoja FILTROS_EMPRESAS_ELECTRICAS no encontrada');
    }

    const data = sheet.getDataRange().getValues();
    const item = parseInt(params.item);
    const activo = params.activo === true || params.activo === 'true';

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === item) {
        sheet.getRange(i + 1, 6).setValue(activo); // Columna ACTIVO
        return Utils.successResponse(
          { item: item, activo: activo },
          'Empresa ' + item + ' actualizada a ' + (activo ? 'activa' : 'inactiva')
        );
      }
    }

    return Utils.errorResponse('Empresa no encontrada');
  },

  /**
   * Agrega una nueva empresa eléctrica al filtro
   * @param {Object} params - {nombreCompleto, nombreCorto, patronBusqueda, colorHex}
   */
  add: function(params) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.FILTROS_EMPRESAS_ELECTRICAS);

    if (!sheet) {
      return Utils.errorResponse('Hoja no encontrada');
    }

    const lastRow = sheet.getLastRow();
    const newItem = lastRow; // Siguiente número

    sheet.appendRow([
      newItem,
      params.nombreCompleto || '',
      params.nombreCorto || '',
      params.patronBusqueda || '',
      params.colorHex || '#E0E0E0',
      true
    ]);

    return Utils.successResponse(
      { item: newItem },
      'Empresa ' + params.nombreCorto + ' agregada con éxito'
    );
  },

  /**
   * Filtra procesos por empresas eléctricas activas
   * @param {Array} procesos - Array de procesos a filtrar
   * @returns {Array} Procesos filtrados con color asignado
   */
  filtrar: function(procesos) {
    const empresasConfig = EmpresasElectricas.getAll();
    if (!empresasConfig.success) return procesos;

    const empresas = empresasConfig.data.empresas;
    const procesosFiltrados = [];

    for (const proceso of procesos) {
      const entidad = (proceso.ENTIDAD || proceso['Nombre o Sigla de la Entidad'] || '').toUpperCase();

      for (const empresa of empresas) {
        const patrones = empresa.patronBusqueda.split('|');
        let match = false;

        for (const patron of patrones) {
          const regex = new RegExp(patron, 'i');
          if (regex.test(entidad)) {
            match = true;
            break;
          }
        }

        if (match) {
          procesosFiltrados.push({
            ...proceso,
            EMPRESA_CORTA: empresa.nombreCorto,
            COLOR_EMPRESA: empresa.colorHex
          });
          break;
        }
      }
    }

    return procesosFiltrados;
  },

  /**
   * Crea la hoja de empresas eléctricas con datos por defecto
   * @private
   */
  _crearHoja: function() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.insertSheet(CONFIG.SHEETS.FILTROS_EMPRESAS_ELECTRICAS);

    // Headers
    sheet.getRange(1, 1, 1, 6).setValues([[
      'ITEM', 'NOMBRE_COMPLETO', 'NOMBRE_CORTO', 'PATRON_BUSQUEDA', 'COLOR_HEX', 'ACTIVO'
    ]]);

    // Datos por defecto (las 25 empresas)
    const empresasDefault = [
      [1, 'Consorcio Eléctrico de Villacurí S.A.C.', 'VILLACURI', 'VILLACURI', '#E3F2FD', true],
      [2, 'Electricidad Pangoa S.A. - EGEPSA', 'EGEPSA', 'EGEPSA|PANGOA', '#E8F5E9', true],
      [3, 'Electro Dunas S.A.A.', 'ELECTRO DUNAS', 'ELECTRO DUNAS|DUNAS', '#FFF3E0', true],
      [4, 'Electro Tocache S.A.', 'ELECTRO TOCACHE', 'TOCACHE', '#FCE4EC', true],
      [5, 'Electrocentro S.A.', 'ELECTROCENTRO', 'ELECTROCENTRO|ELECTRO.*CENTRO', '#F3E5F5', true],
      [6, 'Electronoroeste S.A. - ENOSA', 'ENOSA', 'ENOSA|NOR.*OESTE|ELECTRONOROESTE', '#E0F7FA', true],
      [7, 'Empresa de Generación Eléctrica de Arequipa S.A. - EGASA', 'EGASA', 'EGASA|GENERACION.*AREQUIPA', '#FFF8E1', true],
      [8, 'Empresa Regional de Servicio Público de Electricidad del Sur Este S.A.A. - ELSE', 'ELSE', 'ELSE|SUR.*ESTE', '#E8EAF6', true],
      [9, 'Empresa Regional de Servicio Público de Electricidad - ELECTRO ORIENTE', 'ELECTRO ORIENTE', 'ELECTRO.*ORIENTE|ORIENTE', '#EFEBE9', true],
      [10, 'Empresa de Administración de Infraestructura Eléctrica S.A. - ADINELSA', 'ADINELSA', 'ADINELSA', '#ECEFF1', true],
      [11, 'Empresa Regional de Servicio Público de Electricidad ELECTROSUR S.A.', 'ELECTROSUR', 'ELECTROSUR', '#FBE9E7', true],
      [12, 'Empresa de Servicios Eléctricos Municipal de Pativilca S.A.C. - ESEMPAT S.A.C.', 'ESEMPAT', 'ESEMPAT|PATIVILCA', '#F1F8E9', true],
      [13, 'Empresa de Servicios Eléctricos Municipales de Paramonga S.A. - EMSEM S.A.', 'EMSEM', 'EMSEM|PARAMONGA', '#E0F2F1', true],
      [14, 'Empresa Municipal de Servicios Eléctricos Utcubamba S.A.C. - EMSEU S.A.C.', 'EMSEU', 'EMSEU|UTCUBAMBA', '#FFF9C4', true],
      [15, 'Empresa Regional de Servicio Público de Electricidad de Puno S.A.A.', 'ELECTRO PUNO', 'ELECTRO.*PUNO|PUNO.*ELECTRI', '#FFECB3', true],
      [16, 'Empresa Regional de Servicio Público de Electricidad Electronortemedio S.A. - HIDRANDINA', 'HIDRANDINA', 'HIDRANDINA|ELECTRONORTEMEDIO|NOR.*MEDIO', '#B3E5FC', true],
      [17, 'Luz del Sur S.A.A.', 'LUZ DEL SUR', 'LUZ.*SUR', '#DCEDC8', true],
      [18, 'Pluz Energía Perú S.A.A. (antes Enel Distribución Perú S.A.A.)', 'PLUZ/ENEL', 'PLUZ|ENEL', '#F0F4C3', true],
      [19, 'Servicios Eléctricos Rioja S.A. - SERSA', 'SERSA', 'SERSA|RIOJA', '#FFE0B2', true],
      [20, 'Sociedad Eléctrica del Sur Oeste S.A. - SEAL', 'SEAL', 'SEAL|SUR.*OESTE', '#D1C4E9', true],
      [21, 'Empresa de Servicio Público de Electricidad Electronorte S.A.', 'ELECTRONORTE', 'ELECTRONORTE', '#FFCDD2', true],
      [22, 'Empresa Concesionaria de Electricidad de Ucayali S.A.', 'ELECTRO UCAYALI', 'UCAYALI', '#C8E6C9', true],
      [23, 'Organismo Supervisor de la Inversión en Energía y Minería', 'OSINERGMIN', 'OSINERGMIN', '#B2DFDB', true],
      [24, 'Empresa de Generación Eléctrica San Gabán S.A.', 'SAN GABAN', 'SAN.*GABAN', '#FFCCBC', true],
      [25, 'Empresa de Generación Eléctrica Machupicchu S.A.', 'MACHUPICCHU', 'MACHUPICCHU', '#D7CCC8', true]
    ];

    sheet.getRange(2, 1, empresasDefault.length, 6).setValues(empresasDefault);

    // Formato
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#1F4E79').setFontColor('white');
    sheet.setFrozenRows(1);

    return sheet;
  }
};

// ==================== MÓDULO: SEGUIMIENTO V2 (Detalle Completo) ====================

const SeguimientoV2 = {
  /**
   * Obtiene el detalle completo de un proceso en seguimiento
   * Incluye: cronograma, documentos, postores, contrato, comité, históricos
   * @param {Object} params - {nomenclatura: string}
   * @returns {Object} Detalle completo del proceso
   */
  getDetalleCompleto: function(params) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const seguimientoSheet = ss.getSheetByName(CONFIG.SHEETS.SEGUIMIENTO);

    if (!seguimientoSheet) {
      return Utils.errorResponse('Hoja SEGUIMIENTO no encontrada');
    }

    const nomenclatura = params.nomenclatura;
    if (!nomenclatura) {
      return Utils.errorResponse('Falta parámetro nomenclatura');
    }

    // Buscar proceso
    const data = seguimientoSheet.getDataRange().getValues();
    const headers = data[0];
    let procesoRow = null;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === nomenclatura) {
        procesoRow = data[i];
        break;
      }
    }

    if (!procesoRow) {
      return Utils.errorResponse('Proceso no encontrado en seguimiento');
    }

    // Construir objeto de proceso
    const proceso = {};
    headers.forEach(function(header, idx) {
      proceso[header] = procesoRow[idx];
    });

    // Parsear JSON de datos completos si existe
    let datosCompletos = {};
    const jsonColIndex = headers.indexOf('DATOS_COMPLETOS_JSON');
    if (jsonColIndex !== -1 && procesoRow[jsonColIndex]) {
      try {
        datosCompletos = JSON.parse(procesoRow[jsonColIndex]);
      } catch (e) {
        Utils.log('Error parsing DATOS_COMPLETOS_JSON', e);
      }
    }

    // Obtener históricos del proceso
    const historicos = SeguimientoV2._getHistoricosCompletos(nomenclatura);

    // Obtener documentos asociados
    const documentos = SeguimientoV2._getDocumentosProceso(nomenclatura);

    return Utils.successResponse({
      proceso: {
        // Información básica
        nomenclatura: proceso.NOMENCLATURA,
        entidad: proceso.ENTIDAD,
        objeto: proceso.OBJETO,
        region: proceso.REGION,

        // Valores
        valorReferencial: proceso.VALOR_REFERENCIAL || proceso.VALOR,
        montoAdjudicado: proceso.MONTO_ADJUDICADO,

        // Estado
        estadoInteres: proceso.ESTADO_INTERES,
        prioridad: proceso.PRIORIDAD,
        responsable: proceso.RESPONSABLE,
        notas: proceso.NOTAS,

        // Ganador
        ganador: {
          ruc: proceso.GANADOR_RUC,
          nombre: proceso.GANADOR_NOMBRE,
          contrato: proceso.NUMERO_CONTRATO,
          fechaContrato: proceso.FECHA_CONTRATO
        },

        // Cronograma (8 etapas)
        cronograma: SeguimientoV2._extraerCronograma(proceso),

        // Datos adicionales del JSON
        postores: datosCompletos.postores || [],
        comite: datosCompletos.comite || [],
        consultas: datosCompletos.consultas || [],
        acciones: datosCompletos.acciones || [],

        // Documentos
        documentos: documentos,

        // Históricos multi-año
        historicos: historicos,

        // Links
        linkSeace: proceso.LINK_SEACE,
        carpetaDrive: proceso.CARPETA_DRIVE
      }
    });
  },

  /**
   * Extrae el cronograma de las 8 etapas del proceso
   * @private
   */
  _extraerCronograma: function(proceso) {
    const etapas = [
      'CONVOCATORIA',
      'REGISTRO_PARTICIPANTES',
      'CONSULTAS_OBSERVACIONES',
      'ABSOLUCION_CONSULTAS',
      'INTEGRACION_BASES',
      'PRESENTACION_PROPUESTAS',
      'CALIFICACION_EVALUACION',
      'BUENA_PRO'
    ];

    const cronograma = [];

    for (const etapa of etapas) {
      cronograma.push({
        etapa: etapa,
        estado: proceso[etapa + '_ESTADO'] || 'PENDIENTE',
        fechaInicio: proceso[etapa + '_INICIO'] || null,
        fechaFin: proceso[etapa + '_FIN'] || null,
        notas: proceso[etapa + '_NOTAS'] || ''
      });
    }

    return cronograma;
  },

  /**
   * Obtiene los históricos completos de un proceso (todos los años)
   * @private
   */
  _getHistoricosCompletos: function(nomenclaturaActual) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const historicosSheet = ss.getSheetByName(CONFIG.SHEETS.HISTORICOS_DETALLE);

    // Obtener grupo asociado para conocer las nomenclaturas seleccionadas
    const grupoResult = GruposHistoricos.getByNomenclatura({ nomenclatura: nomenclaturaActual });
    const grupo = grupoResult.grupo;
    const nomenclaturasGrupo = grupo && grupo.NOMENCLATURAS_HISTORICOS
      ? (Array.isArray(grupo.NOMENCLATURAS_HISTORICOS)
          ? grupo.NOMENCLATURAS_HISTORICOS
          : [])
      : [];

    // Crear mapa de nomenclaturas del grupo por año
    const nomenclaturasPorAño = {};
    nomenclaturasGrupo.forEach(function(nom) {
      const match = nom.match(/-(\d{4})-/);
      if (match) {
        const año = parseInt(match[1]);
        if (!nomenclaturasPorAño[año]) {
          nomenclaturasPorAño[año] = [];
        }
        nomenclaturasPorAño[año].push(nom);
      }
    });

    // Si no hay hoja de históricos, retornar solo nomenclaturas sin datos
    if (!historicosSheet) {
      return SeguimientoV2._construirHistoricosDesdeNomenclaturas(nomenclaturasPorAño);
    }

    const data = historicosSheet.getDataRange().getValues();
    const headers = data[0];
    const historicos = [];
    const nomenclaturasConDatos = new Set();

    // Buscar datos para cada nomenclatura del grupo
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const nomenclatura = row[0];

      // Verificar si es una nomenclatura del grupo
      if (nomenclatura && nomenclaturasGrupo.includes(nomenclatura)) {
        const historico = {};
        headers.forEach(function(header, idx) {
          historico[header] = row[idx];
        });
        historicos.push(historico);
        nomenclaturasConDatos.add(nomenclatura);
      }
    }

    // Agregar nomenclaturas sin datos (placeholder)
    nomenclaturasGrupo.forEach(function(nom) {
      if (!nomenclaturasConDatos.has(nom)) {
        const match = nom.match(/-(\d{4})-/);
        const año = match ? parseInt(match[1]) : null;
        historicos.push({
          NOMENCLATURA: nom,
          AÑO: año,
          _SIN_DATOS: true // Marcador para indicar que no tiene datos extraídos
        });
      }
    });

    // Ordenar por año descendente, luego por nomenclatura
    historicos.sort(function(a, b) {
      const yearA = a.AÑO || 0;
      const yearB = b.AÑO || 0;
      if (yearB !== yearA) return yearB - yearA;
      return (a.NOMENCLATURA || '').localeCompare(b.NOMENCLATURA || '');
    });

    return historicos;
  },

  /**
   * Construye históricos vacíos desde nomenclaturas del grupo
   * @private
   */
  _construirHistoricosDesdeNomenclaturas: function(nomenclaturasPorAño) {
    const historicos = [];
    Object.keys(nomenclaturasPorAño).forEach(function(año) {
      nomenclaturasPorAño[año].forEach(function(nom) {
        historicos.push({
          NOMENCLATURA: nom,
          AÑO: parseInt(año),
          _SIN_DATOS: true
        });
      });
    });
    historicos.sort(function(a, b) { return b.AÑO - a.AÑO; });
    return historicos;
  },

  /**
   * Obtiene documentos de un proceso
   * @private
   */
  _getDocumentosProceso: function(nomenclatura) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const docsSheet = ss.getSheetByName(CONFIG.SHEETS.DOCUMENTOS);

    if (!docsSheet) return [];

    const data = docsSheet.getDataRange().getValues();
    const headers = data[0];
    const documentos = [];

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === nomenclatura || data[i][1] === nomenclatura) {
        const doc = {};
        headers.forEach(function(header, idx) {
          doc[header] = data[i][idx];
        });
        documentos.push(doc);
      }
    }

    return documentos;
  }
};

// ==================== MÓDULO: HISTÓRICOS DETALLE (v2.0) ====================

const HistoricosDetalle = {
  /**
   * Guarda los datos de un histórico extraídos por IA desde capturas SEACE
   * @param {Object} params - Datos en formato JSON extraídos por IA
   * @returns {Object} Resultado de la operación
   */
  guardarExtraidoIA: function(params) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEETS.HISTORICOS_DETALLE);

    // Crear hoja si no existe
    if (!sheet) {
      sheet = HistoricosDetalle._crearHoja();
    }

    // Validar datos mínimos
    if (!params.nomenclatura) {
      return Utils.errorResponse('Falta nomenclatura en los datos');
    }

    // Extraer año de nomenclatura
    const matchAño = params.nomenclatura.match(/-(\d{4})-/);
    const año = matchAño ? parseInt(matchAño[1]) : new Date().getFullYear();

    // Verificar si ya existe
    const data = sheet.getDataRange().getValues();
    let existeRow = -1;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === params.nomenclatura) {
        existeRow = i + 1;
        break;
      }
    }

    // Extraer datos - soporta formato anidado del JSON de IA
    const entidadNombre = (params.entidad && typeof params.entidad === 'object')
      ? params.entidad.nombre
      : (params.entidad || '');
    const entidadRuc = (params.entidad && typeof params.entidad === 'object')
      ? params.entidad.ruc
      : (params.entidadRuc || '');
    const entidadDireccion = (params.entidad && typeof params.entidad === 'object')
      ? params.entidad.direccion
      : '';
    const entidadTelefono = (params.entidad && typeof params.entidad === 'object')
      ? params.entidad.telefono
      : '';

    const objeto = params.objeto ||
      (params.procedimiento && params.procedimiento.objeto) ||
      params.descripcion || '';

    const valorReferencial = params.valorReferencial || params.valor_referencial || 0;
    const montoAdjudicado = params.montoAdjudicado || params.monto_adjudicado ||
      (params.ganador && params.ganador.montoAdjudicado) || 0;

    const ganadorRuc = (params.ganador && params.ganador.ruc) || params.ganadorRuc || params.ganador_ruc || '';
    const ganadorNombre = (params.ganador && params.ganador.nombre) || params.ganadorNombre || params.ganador_nombre || '';

    const fechaConvocatoria = params.fechaConvocatoria || params.fecha_convocatoria ||
      (params.cronograma && params.cronograma[0] && (params.cronograma[0].fechaInicio || params.cronograma[0].fecha_inicio)) || '';
    const fechaBuenaPro = params.fechaBuenaPro || params.fecha_buena_pro ||
      (params.cronograma && params.cronograma.length > 0 &&
        (params.cronograma[params.cronograma.length - 1].fechaFin || params.cronograma[params.cronograma.length - 1].fecha_fin)) || '';

    const numeroContrato = params.numeroContrato || params.numero_contrato ||
      (params.contrato && params.contrato.numero) || '';
    const totalPostores = params.totalPostores || params.total_postores ||
      (params.postores && params.postores.length) || 0;

    const estadoProceso = (params.procedimiento && params.procedimiento.estado) || params.estado || '';

    // Preparar fila de datos con estructura ampliada
    const nuevaFila = [
      params.nomenclatura || (params.procedimiento && params.procedimiento.nomenclatura) || '',
      año,
      entidadNombre,
      entidadRuc,
      entidadDireccion,
      entidadTelefono,
      objeto,
      valorReferencial,
      montoAdjudicado,
      ganadorRuc,
      ganadorNombre,
      fechaConvocatoria,
      fechaBuenaPro,
      numeroContrato,
      totalPostores,
      estadoProceso,
      params.linkSeace || params.link_seace || '',
      params.linkOsce || params.link_osce || OCDS_API._construirLinkOSCE(params.nomenclatura, params.tender_id),
      JSON.stringify(params.cronograma || []),
      JSON.stringify(params.documentos || []),
      JSON.stringify(params.postores || []),
      JSON.stringify(params.comiteSeleccion || params.comite || []),
      JSON.stringify(params.consultasObservaciones || params.consultas || []),
      JSON.stringify(params.accionesDelProcedimiento || params.acciones || []),
      JSON.stringify(params.acuerdosComerciales || []),
      JSON.stringify(params.contrato || {}),
      JSON.stringify(params),  // DATOS_COMPLETOS_JSON - guarda TODO el objeto original
      new Date(),
      params.fuente || 'IA'
    ];

    let accion, filaResultado;
    if (existeRow > 0) {
      sheet.getRange(existeRow, 1, 1, nuevaFila.length).setValues([nuevaFila]);
      accion = 'actualizado';
      filaResultado = existeRow;
    } else {
      sheet.appendRow(nuevaFila);
      accion = 'agregado';
      filaResultado = sheet.getLastRow();
    }

    // Dual-write: también upsertear en DATOS_SEACE para que Fase 2/3
    // (GrupoDetalleModal, inteligencia competitiva) vean los datos unificados
    // con los que produzca el scraper Python. Si falla, no rompe el flujo
    // principal — HISTORICOS_DETALLE ya quedó guardado.
    let dualWrite = { ok: false, error: null };
    try {
      const resDual = DatosSeaceLookup.guardar({
        nomenclatura: params.nomenclatura,
        fuente: 'captura_ia',
        estadoScraping: 'completo',
        fechaScraping: new Date(),
        tenderId: params.tender_id || params.tenderId || '',
        urlSeace: params.linkSeace || params.link_seace || '',
        cronograma: params.cronograma || [],
        documentos: params.documentos || [],
        postores: params.postores || [],
        contrato: params.contrato || {},
        acciones: params.accionesDelProcedimiento || params.acciones || [],
        items: params.items || [],
        comite: params.comiteSeleccion || params.comite || [],
        consultas: params.consultasObservaciones || params.consultas || [],
        ofertas: params.ofertas || params.postores || []
      });
      dualWrite.ok = !!(resDual && resDual.success);
      if (!dualWrite.ok) dualWrite.error = (resDual && resDual.error) || 'sin detalle';
    } catch (e) {
      dualWrite.error = e && e.toString ? e.toString() : String(e);
      Utils.log('HistoricosDetalle.guardarExtraidoIA dualWrite error', dualWrite.error);
    }

    return Utils.successResponse(
      { accion: accion, fila: filaResultado, dualWriteDatosSeace: dualWrite },
      'Histórico ' + params.nomenclatura + ' ' + accion
    );
  },

  /**
   * Obtiene la comparativa de históricos para un proceso
   * @param {Object} params - {nomenclatura: string}
   * @returns {Object} Comparativa de todos los años
   */
  getComparativa: function(params) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.HISTORICOS_DETALLE);

    if (!sheet) {
      return Utils.errorResponse('Hoja HISTORICOS_DETALLE no encontrada');
    }

    const nomenclaturaActual = params.nomenclatura;
    if (!nomenclaturaActual) {
      return Utils.errorResponse('Falta parámetro nomenclatura');
    }

    // Extraer patrón base (sin año)
    const basePattern = nomenclaturaActual.replace(/-\d{4}-/, '-XXXX-');

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const historicos = [];

    for (let i = 1; i < data.length; i++) {
      const nom = data[i][0] || '';
      const nomPattern = nom.replace(/-\d{4}-/, '-XXXX-');

      if (nomPattern === basePattern) {
        const historico = {};
        headers.forEach(function(header, idx) {
          historico[header] = data[i][idx];
        });
        historicos.push(historico);
      }
    }

    // Ordenar por año
    historicos.sort(function(a, b) {
      return (a.AÑO || 0) - (b.AÑO || 0);
    });

    // Calcular estadísticas comparativas
    const comparativa = {
      años: historicos.map(function(h) { return h.AÑO; }),
      montos: historicos.map(function(h) {
        return {
          año: h.AÑO,
          vr: h.VALOR_REFERENCIAL,
          adjudicado: h.MONTO_ADJUDICADO,
          ahorro: (h.VALOR_REFERENCIAL || 0) - (h.MONTO_ADJUDICADO || 0)
        };
      }),
      ganadores: historicos.map(function(h) {
        return {
          año: h.AÑO,
          nombre: h.GANADOR_NOMBRE,
          ruc: h.GANADOR_RUC
        };
      }),
      tendencia: HistoricosDetalle._calcularTendencia(historicos)
    };

    return Utils.successResponse({
      nomenclaturaBase: basePattern.replace('-XXXX-', '-{AÑO}-'),
      totalAños: historicos.length,
      historicos: historicos,
      comparativa: comparativa
    });
  },

  /**
   * Calcula tendencia de montos históricos
   * @private
   */
  _calcularTendencia: function(historicos) {
    if (historicos.length < 2) return 'SIN_DATOS';

    const montos = historicos.map(function(h) {
      return h.MONTO_ADJUDICADO || h.VALOR_REFERENCIAL || 0;
    });

    const primerMonto = montos[0];
    const ultimoMonto = montos[montos.length - 1];

    if (ultimoMonto > primerMonto * 1.1) return 'CRECIENTE';
    if (ultimoMonto < primerMonto * 0.9) return 'DECRECIENTE';
    return 'ESTABLE';
  },

  /**
   * Crea la hoja HISTORICOS_DETALLE con estructura
   * @private
   */
  _crearHoja: function() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.insertSheet(CONFIG.SHEETS.HISTORICOS_DETALLE);

    const headers = [
      'NOMENCLATURA', 'AÑO', 'ENTIDAD', 'ENTIDAD_RUC', 'ENTIDAD_DIRECCION', 'ENTIDAD_TELEFONO',
      'OBJETO', 'VALOR_REFERENCIAL', 'MONTO_ADJUDICADO', 'GANADOR_RUC', 'GANADOR_NOMBRE',
      'FECHA_CONVOCATORIA', 'FECHA_BUENA_PRO', 'NUMERO_CONTRATO', 'TOTAL_POSTORES', 'ESTADO_PROCESO',
      'LINK_SEACE', 'LINK_OSCE', 'CRONOGRAMA_JSON', 'DOCUMENTOS_JSON', 'POSTORES_JSON',
      'COMITE_JSON', 'CONSULTAS_JSON', 'ACCIONES_JSON', 'ACUERDOS_JSON', 'CONTRATO_JSON',
      'DATOS_COMPLETOS_JSON', 'FECHA_EXTRACCION', 'FUENTE'
    ];

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1F4E79')
      .setFontColor('white');
    sheet.setFrozenRows(1);

    // Ajustar anchos
    sheet.setColumnWidth(1, 200); // NOMENCLATURA
    sheet.setColumnWidth(7, 300); // OBJETO

    return sheet;
  }
};

// ==================== MÓDULO: ENLACES RÁPIDOS ====================

const EnlacesRapidos = {
  /**
   * Obtiene los enlaces rápidos configurados en la hoja ENLACES_RAPIDOS.
   * Si la hoja no existe se retorna un arreglo vacío (la hoja se crea
   * perezosamente la primera vez que un usuario la necesite, fuera de este
   * endpoint de solo lectura).
   * Columnas esperadas: ID, NOMBRE, URL, CATEGORIA, ICONO, COLOR, ORDEN, ACTIVO
   */
  getAll: function(params) {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEETS.ENLACES_RAPIDOS);

      if (!sheet) {
        return Utils.successResponse({ enlaces: [] });
      }

      const data = sheet.getDataRange().getValues();
      if (data.length < 2) {
        return Utils.successResponse({ enlaces: [] });
      }

      const headers = data[0];
      const enlaces = Utils.rowsToObjects(data.slice(1), headers)
        .filter(function(e) {
          if (!e.NOMBRE && !e.URL) return false;
          // Sólo enlaces activos (acepta true o 'TRUE')
          return e.ACTIVO === true || e.ACTIVO === 'TRUE' || e.ACTIVO === undefined;
        })
        .sort(function(a, b) {
          return (parseInt(a.ORDEN, 10) || 0) - (parseInt(b.ORDEN, 10) || 0);
        });

      return Utils.successResponse({ enlaces: enlaces });
    } catch (error) {
      Utils.log('EnlacesRapidos.getAll: error', error.toString());
      return Utils.errorResponse(error.message || error.toString());
    }
  }
};

// ==================== MÓDULO: CONSULTA DATOS_SEACE ====================

const DatosSeaceLookup = {
  /**
   * Busca una fila en la hoja DATOS_SEACE por nomenclatura.
   * Retorna { success:true, datos:null } si la hoja o la fila no existen.
   * @param {Object} params - {nomenclatura: string}
   */
  getByNomenclatura: function(params) {
    try {
      const nomenclatura = params && params.nomenclatura ? String(params.nomenclatura).trim() : '';
      if (!nomenclatura) {
        return Utils.errorResponse('Falta parámetro nomenclatura');
      }

      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEETS.DATOS_SEACE);

      if (!sheet) {
        return Utils.successResponse({ datos: null });
      }

      const data = sheet.getDataRange().getValues();
      if (data.length < 2) {
        return Utils.successResponse({ datos: null });
      }

      const headers = data[0];
      const idxNomenclatura = headers.indexOf('NOMENCLATURA');
      if (idxNomenclatura < 0) {
        return Utils.successResponse({ datos: null });
      }

      for (let i = 1; i < data.length; i++) {
        if (data[i][idxNomenclatura] && String(data[i][idxNomenclatura]).trim() === nomenclatura) {
          const registro = {};
          headers.forEach(function(header, idx) {
            registro[header] = data[i][idx];
          });
          return Utils.successResponse({ datos: registro });
        }
      }

      return Utils.successResponse({ datos: null });
    } catch (error) {
      Utils.log('DatosSeaceLookup.getByNomenclatura: error', error.toString());
      return Utils.errorResponse(error.message || error.toString());
    }
  },

  /**
   * Upsert idempotente en la hoja DATOS_SEACE por NOMENCLATURA.
   * Acepta el payload completo y serializa los campos JSON internamente
   * (el caller puede enviar arrays/objetos directamente o strings ya
   * stringifiados — ambos se normalizan).
   *
   * Crea la hoja si no existe y auto-migra el header agregando columnas
   * faltantes (p.ej. FUENTE) sin romper datos previos.
   *
   * @param {Object} params
   * @param {string} params.nomenclatura - PK (requerido)
   * @param {string} [params.fuente] - 'python_scraper' | 'captura_ia' | 'ocds_api'
   * @param {string} [params.estadoScraping] - 'pendiente' | 'en_proceso' | 'completo' | 'error'
   * @param {*} [params.cronograma] - array u objeto
   * @param {*} [params.documentos]
   * @param {*} [params.postores]
   * @param {*} [params.contrato]
   * @param {*} [params.acciones]
   * @param {*} [params.items]
   * @param {*} [params.comite]
   * @param {*} [params.consultas]
   * @param {*} [params.ofertas]
   * @param {string} [params.ocid]
   * @param {string} [params.tenderId]
   * @param {string} [params.urlSeace]
   * @param {string} [params.sourceId]
   * @param {string} [params.errorMensaje]
   */
  guardar: function(params) {
    Utils.validateParams(params, ['nomenclatura']);
    const nomenclatura = String(params.nomenclatura).trim();

    const HEADERS_CANONICOS = [
      'NOMENCLATURA', 'FECHA_SCRAPING', 'OCID', 'TENDER_ID', 'URL_SEACE', 'SOURCE_ID',
      'CRONOGRAMA_JSON', 'DOCUMENTOS_JSON', 'POSTORES_JSON', 'CONTRATO_JSON',
      'ACCIONES_JSON', 'ITEMS_JSON', 'COMITE_JSON', 'CONSULTAS_JSON', 'OFERTAS_JSON',
      'ESTADO_SCRAPING', 'ERROR_MENSAJE', 'FUENTE'
    ];

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEETS.DATOS_SEACE);

    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEETS.DATOS_SEACE);
      sheet.getRange(1, 1, 1, HEADERS_CANONICOS.length).setValues([HEADERS_CANONICOS]);
      sheet.getRange(1, 1, 1, HEADERS_CANONICOS.length)
        .setBackground('#1e40af').setFontColor('white').setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else {
      // Auto-migrar headers faltantes (p.ej. FUENTE en hojas creadas con schema viejo)
      const lastCol = Math.max(1, sheet.getLastColumn());
      const headersActuales = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
        return String(h || '').trim().toUpperCase();
      });
      const faltantes = HEADERS_CANONICOS.filter(function(h) { return headersActuales.indexOf(h) === -1; });
      if (faltantes.length > 0) {
        const inicio = sheet.getLastColumn() + 1;
        sheet.getRange(1, inicio, 1, faltantes.length).setValues([faltantes])
          .setBackground('#1e40af').setFontColor('white').setFontWeight('bold');
      }
    }

    // Releer headers finales tras posible migración
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) {
      return String(h || '').trim().toUpperCase();
    });

    const serializar = function(v) {
      if (v == null) return '';
      if (typeof v === 'string') return v;
      try { return JSON.stringify(v); } catch (e) { return String(v); }
    };

    // Map de campos de entrada -> nombre de columna en la hoja
    const fieldMap = {
      'NOMENCLATURA': nomenclatura,
      'FECHA_SCRAPING': params.fechaScraping || new Date(),
      'OCID': params.ocid || '',
      'TENDER_ID': params.tenderId || '',
      'URL_SEACE': params.urlSeace || '',
      'SOURCE_ID': params.sourceId || '',
      'CRONOGRAMA_JSON': serializar(params.cronograma),
      'DOCUMENTOS_JSON': serializar(params.documentos),
      'POSTORES_JSON': serializar(params.postores),
      'CONTRATO_JSON': serializar(params.contrato),
      'ACCIONES_JSON': serializar(params.acciones),
      'ITEMS_JSON': serializar(params.items),
      'COMITE_JSON': serializar(params.comite),
      'CONSULTAS_JSON': serializar(params.consultas),
      'OFERTAS_JSON': serializar(params.ofertas),
      'ESTADO_SCRAPING': String(params.estadoScraping || 'completo').toLowerCase(),
      'ERROR_MENSAJE': params.errorMensaje || '',
      'FUENTE': params.fuente || 'python_scraper'
    };

    // Buscar fila existente por nomenclatura
    const lastRow = sheet.getLastRow();
    const idxNom = headers.indexOf('NOMENCLATURA');
    let filaExistente = -1;

    if (idxNom >= 0 && lastRow >= 2) {
      const colNom = sheet.getRange(2, idxNom + 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < colNom.length; i++) {
        if (colNom[i][0] && String(colNom[i][0]).trim() === nomenclatura) {
          filaExistente = i + 2;
          break;
        }
      }
    }

    // Construir fila alineada al orden actual de headers. Si update, preserva
    // el valor existente para columnas no presentes en fieldMap (robustez
    // ante headers extra agregados manualmente por el usuario).
    let filaActual = null;
    if (filaExistente > 0) {
      filaActual = sheet.getRange(filaExistente, 1, 1, headers.length).getValues()[0];
    }

    const nuevaFila = headers.map(function(h, idx) {
      if (Object.prototype.hasOwnProperty.call(fieldMap, h)) {
        const valor = fieldMap[h];
        // En update, no pisar con vacío si el caller no lo envió
        if (filaActual && (valor === '' || valor === null || valor === undefined)) {
          // Mantener el valor previo si existía algo no vacío
          const previo = filaActual[idx];
          if (previo !== '' && previo !== null && previo !== undefined) {
            return previo;
          }
        }
        return valor;
      }
      // Columna no manejada: preservar valor existente o vacío
      return filaActual ? filaActual[idx] : '';
    });

    if (filaExistente > 0) {
      sheet.getRange(filaExistente, 1, 1, nuevaFila.length).setValues([nuevaFila]);
      return Utils.successResponse({
        accion: 'actualizado',
        fila: filaExistente,
        nomenclatura: nomenclatura
      }, 'DATOS_SEACE actualizado para ' + nomenclatura);
    } else {
      sheet.appendRow(nuevaFila);
      return Utils.successResponse({
        accion: 'insertado',
        fila: sheet.getLastRow(),
        nomenclatura: nomenclatura
      }, 'DATOS_SEACE insertado para ' + nomenclatura);
    }
  }
};

// ==================== MÓDULO: ESTADO SCRAPING ====================

const EstadoScraping = {
  /**
   * Stub: devuelve el estado del job de scraping en background.
   * Actualmente no existe un trigger real de scraping continuo; el scraping
   * se ejecuta on-demand desde el menú. Este endpoint existe para que el
   * frontend pueda consultarlo sin errores.
   */
  get: function(params) {
    try {
      return Utils.successResponse({
        activo: false,
        ultima_actualizacion: null
      });
    } catch (error) {
      Utils.log('EstadoScraping.get: error', error.toString());
      return Utils.errorResponse(error.message || error.toString());
    }
  }
};

// ==================== MÓDULO: BUSCADOR DE HISTÓRICOS ====================

/**
 * Buscador semi-automatizado de históricos en BD_PROCESOS.
 *
 * Flujo:
 * 1. Usuario pasa nomenclatura target (proceso 2026 que quiere postular).
 * 2. Buscamos el target en BD_PROCESOS para obtener descripción + entidad + clasificación.
 * 3. Extraemos keywords de la descripción.
 * 4. Filtramos BD_PROCESOS por:
 *    - Misma EMPRESA_CORTA (o substring de entidad como fallback).
 *    - Año < año del target.
 * 5. Scoreamos por overlap de keywords + bonus por TIPO_SERVICIO + prefijo de nomenclatura.
 * 6. Retornamos top 30 candidatos ordenados por score.
 *
 * El re-ranking semántico con LLM lo hace el frontend (DeepSeek) para no consumir
 * cuota de UrlFetchApp de Apps Script.
 */
const Historicos = {
  /**
   * @param {Object} params
   * @param {string} params.nomenclatura - Nomenclatura target (obligatorio si no se pasa descripcion/entidad)
   * @param {string} [params.descripcion] - Descripción manual (si no existe nomenclatura en BD)
   * @param {string} [params.entidad] - Entidad manual (si no existe nomenclatura en BD)
   * @param {number} [params.limit=30] - Cantidad máxima de candidatos a retornar
   */
  buscarCandidatos: function(params) {
    const limit = parseInt(params.limit) || 30;
    const nomenclaturaTarget = params.nomenclatura ? String(params.nomenclatura).trim() : '';
    const descManual = params.descripcion ? String(params.descripcion).trim() : '';
    const entManual = params.entidad ? String(params.entidad).trim() : '';

    if (!nomenclaturaTarget && (!descManual || !entManual)) {
      return Utils.errorResponse('Debes pasar "nomenclatura" o bien "descripcion" + "entidad" manualmente');
    }

    const bdSheet = Utils.getSheetSafe(CONFIG.SHEETS.BD);
    if (!bdSheet) return Utils.errorResponse('Hoja BD_PROCESOS no encontrada');

    const data = bdSheet.getDataRange().getValues();
    if (data.length < 2) return Utils.errorResponse('BD_PROCESOS vacía');

    const headers = data[0];
    const colNom = headers.indexOf('NOMENCLATURA');
    const colEnt = headers.indexOf('ENTIDAD');
    const colDesc = headers.indexOf('DESCRIPCION');
    const colVal = headers.indexOf('VALOR');
    const colFecha = headers.indexOf('FECHA_PUB');
    const colEmpCorta = headers.indexOf('EMPRESA_CORTA');
    const colTipoServ = headers.indexOf('TIPO_SERVICIO');

    // Buscar target en BD_PROCESOS
    let target = null;
    let targetRowIdx = -1;

    if (nomenclaturaTarget) {
      const needle = nomenclaturaTarget.toUpperCase().trim();
      for (let i = 1; i < data.length; i++) {
        const nom = String(data[i][colNom] || '').toUpperCase().trim();
        if (nom === needle) {
          target = {
            nomenclatura: data[i][colNom],
            entidad: data[i][colEnt],
            descripcion: data[i][colDesc],
            valor: data[i][colVal],
            fecha: data[i][colFecha],
            empresaCorta: data[i][colEmpCorta],
            tipoServicio: data[i][colTipoServ]
          };
          targetRowIdx = i;
          break;
        }
      }
    }

    // Fallback a descripción manual
    if (!target) {
      if (!descManual || !entManual) {
        return Utils.errorResponse(
          'Proceso ' + nomenclaturaTarget + ' no encontrado en BD_PROCESOS. ' +
          'Pasá "descripcion" y "entidad" manualmente para forzar búsqueda.'
        );
      }
      target = {
        nomenclatura: null,
        entidad: entManual,
        descripcion: descManual,
        empresaCorta: Utils.clasificarEmpresa(entManual),
        tipoServicio: Utils.clasificarTipoServicio(descManual)
      };
    }

    // Año del target (desde nomenclatura)
    const yearMatch = target.nomenclatura
      ? String(target.nomenclatura).match(/-(20\d{2})-/)
      : null;
    const targetYear = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

    // Keywords de la descripción del target
    const keywords = Historicos._extraerKeywords(target.descripcion);

    // Prefijo de nomenclatura target (ej: "CP-SM", "AS-SM", "CP SER-SM")
    const targetPrefix = Historicos._extraerPrefijo(target.nomenclatura);

    // Entidad target como tokens para match flexible
    const entidadTokens = Historicos._tokenizarEntidad(target.entidad);

    const candidatos = [];

    for (let i = 1; i < data.length; i++) {
      if (i === targetRowIdx) continue;

      const nom = String(data[i][colNom] || '');
      const entRaw = String(data[i][colEnt] || '');
      const empCorta = String(data[i][colEmpCorta] || '');
      const descRaw = String(data[i][colDesc] || '');
      const descUpper = descRaw.toUpperCase();
      const fecha = data[i][colFecha];
      const valor = data[i][colVal];
      const tipoServ = data[i][colTipoServ];

      // --- Filtro 1: entidad ---
      let entidadMatch = false;
      if (target.empresaCorta && empCorta === target.empresaCorta) {
        entidadMatch = true; // match perfecto por clasificación
      } else {
        // Fallback: token overlap (al menos 2 tokens significativos en común)
        const candTokens = Historicos._tokenizarEntidad(entRaw);
        let tokenOverlap = 0;
        for (const t of entidadTokens) {
          if (candTokens.indexOf(t) !== -1) tokenOverlap++;
        }
        entidadMatch = tokenOverlap >= 2;
      }
      if (!entidadMatch) continue;

      // --- Filtro 2: año (solo históricos, es decir anteriores al target) ---
      const candYearMatch = nom.match(/-(20\d{2})-/);
      const candYear = candYearMatch ? parseInt(candYearMatch[1]) : 0;
      if (candYear === 0 || candYear >= targetYear || candYear < 2015) continue;

      // --- Scoring ---
      let score = 0;
      const matchedKeywords = [];

      // Keyword overlap (base del score)
      for (const kw of keywords) {
        if (descUpper.indexOf(kw) !== -1) {
          score += 10;
          matchedKeywords.push(kw);
        }
      }

      // Bonus: mismo TIPO_SERVICIO (clasificación automática)
      if (tipoServ && target.tipoServicio && tipoServ === target.tipoServicio) {
        score += 15;
      }

      // Bonus: mismo prefijo de nomenclatura (CP-SM, AS-SM, etc)
      const candPrefix = Historicos._extraerPrefijo(nom);
      if (targetPrefix && candPrefix === targetPrefix) {
        score += 5;
      }

      // Solo guardamos candidatos con al menos 1 keyword match
      if (score >= 10) {
        candidatos.push({
          nomenclatura: nom,
          entidad: entRaw,
          descripcion: descRaw,
          valor: typeof valor === 'number' ? valor : 0,
          fecha: fecha instanceof Date ? fecha.toISOString() : String(fecha || ''),
          año: candYear,
          empresaCorta: empCorta,
          tipoServicio: tipoServ || '',
          score: score,
          matchedKeywords: matchedKeywords
        });
      }
    }

    // Deduplicar por nomenclatura (puede haber duplicados por re-publicaciones)
    const dedupMap = {};
    for (const c of candidatos) {
      const key = c.nomenclatura;
      if (!dedupMap[key] || dedupMap[key].score < c.score) {
        dedupMap[key] = c;
      }
    }
    const unique = Object.keys(dedupMap).map(function(k) { return dedupMap[k]; });

    // Ordenar por score desc, año desc
    unique.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return b.año - a.año;
    });

    return Utils.successResponse({
      target: {
        nomenclatura: target.nomenclatura,
        entidad: target.entidad,
        descripcion: target.descripcion,
        empresaCorta: target.empresaCorta || '',
        tipoServicio: target.tipoServicio || '',
        año: targetYear
      },
      keywordsExtraidos: keywords,
      totalCandidatos: unique.length,
      candidatos: unique.slice(0, limit)
    });
  },

  /**
   * Extrae keywords distintivas de una descripción:
   * - Mayúsculas
   * - Remueve stopwords
   * - Palabras con > 3 letras
   * - Devuelve hasta 10 únicas
   */
  _extraerKeywords: function(descripcion) {
    if (!descripcion) return [];
    const STOPWORDS = new Set([
      'DEL', 'LAS', 'LOS', 'LA', 'EL', 'UN', 'UNA', 'PARA', 'POR', 'CON', 'SIN',
      'SOBRE', 'DESDE', 'HASTA', 'ENTRE', 'ANTE', 'SEGUN', 'TRAS',
      'ESTA', 'ESTE', 'ESTAS', 'ESTOS', 'ESTO', 'ESTO',
      'SERVICIO', 'SERVICIOS', 'CONTRATACION', 'CONTRATACIÓN', 'CONTRATO',
      'EMPRESA', 'REGIONAL', 'NIVEL', 'AREA', 'ÁREA', 'PARTE',
      'QUE', 'CUAL', 'CUAND', 'DOND', 'COMO'
    ]);

    const desc = String(descripcion).toUpperCase()
      .replace(/[^A-ZÁÉÍÓÚÑ0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = desc.split(' ')
      .filter(function(w) { return w.length > 3; })
      .filter(function(w) { return !STOPWORDS.has(w); });

    // Únicas en orden de aparición
    const seen = {};
    const unique = [];
    for (const w of words) {
      if (!seen[w]) {
        seen[w] = true;
        unique.push(w);
        if (unique.length >= 10) break;
      }
    }
    return unique;
  },

  /**
   * Extrae el prefijo de una nomenclatura (parte antes del número-año).
   * Ej: "CP-SM-36-2024-ELSE-1" → "CP-SM"
   *     "CP SER-SM-34-2026-ELSE-1" → "CP SER-SM"
   *     "AS-SM-79-2022-ELSE-1" → "AS-SM"
   */
  _extraerPrefijo: function(nomenclatura) {
    if (!nomenclatura) return '';
    const m = String(nomenclatura).match(/^([A-Z]+(?:[ -][A-Z]+)*?)[- ]\d+[- ]20\d{2}/i);
    return m ? m[1].toUpperCase().replace(/\s+/g, ' ').trim() : '';
  },

  /**
   * Tokeniza un nombre de entidad en palabras significativas.
   * Ej: "EMPRESA REGIONAL DE SERVICIO PÚBLICO DE ELECTRICIDAD ELECTRO SUR ESTE S.A.A."
   *   → ["ELECTRICIDAD", "ELECTRO", "SUR", "ESTE"]
   */
  _tokenizarEntidad: function(entidad) {
    if (!entidad) return [];
    const STOPWORDS = new Set([
      'EMPRESA', 'REGIONAL', 'SERVICIO', 'PUBLICO', 'PÚBLICO', 'SERVICIOS', 'PUBLICOS',
      'PÚBLICOS', 'DEL', 'LAS', 'LOS', 'LA', 'EL', 'DE', 'EN', 'Y', 'O', 'A',
      'S', 'SA', 'SAA', 'SAC', 'EIRL', 'LTDA', 'LTD', 'SOCIEDAD', 'ANONIMA',
      'ANÓNIMA', 'CERRADA', 'LIMITADA'
    ]);
    return String(entidad).toUpperCase()
      .replace(/[^A-ZÁÉÍÓÚÑ\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(function(w) { return w.length >= 4 && !STOPWORDS.has(w); });
  }
};

// ==================== MÓDULO: DIAGNÓSTICO ====================

const Diagnostico = {
  /**
   * Health check general — valida que cada hoja exista y retorna conteo de filas.
   * Usado por la vista /diagnostico del frontend.
   */
  healthCheck: function(params) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const checks = [];
    const inicio = new Date();

    // 1) Info del spreadsheet
    checks.push({
      grupo: 'Sistema',
      nombre: 'Spreadsheet activo',
      ok: true,
      detalle: ss.getName(),
      meta: { id: ss.getId(), url: ss.getUrl() }
    });

    // 2) Verificar cada hoja configurada en CONFIG.SHEETS
    // Hojas opcionales (se crean perezosamente al primer uso)
    const HOJAS_OPCIONALES = { POSTORES: true, ENLACES_RAPIDOS: true };
    const hojasEsperadas = Object.keys(CONFIG.SHEETS);
    hojasEsperadas.forEach(function(key) {
      const nombre = CONFIG.SHEETS[key];
      const sheet = ss.getSheetByName(nombre);
      const esOpcional = !!HOJAS_OPCIONALES[key];
      if (!sheet) {
        checks.push({
          grupo: 'Hojas',
          nombre: nombre,
          ok: esOpcional, // opcionales no bloquean el health check
          detalle: esOpcional ? 'No existe (se crea al primer uso)' : 'No existe',
          meta: { key: key, opcional: esOpcional }
        });
      } else {
        const lastRow = sheet.getLastRow();
        const lastCol = sheet.getLastColumn();
        checks.push({
          grupo: 'Hojas',
          nombre: nombre,
          ok: true,
          detalle: Math.max(0, lastRow - 1) + ' filas · ' + lastCol + ' cols',
          meta: { key: key, filas: lastRow - 1, columnas: lastCol }
        });
      }
    });

    // 3) Validar API OCDS externa — probar MÚLTIPLES endpoints alternativos
    // (el endpoint /files puede estar bloqueado por WAF pero /records o /record suelen responder)
    try {
      const añoActual = new Date().getFullYear();
      const mesActual = (new Date().getMonth() + 1);
      const mesPadded = String(mesActual).padStart(2, '0');

      const candidatos = [
        // Probe 1: endpoint /records paginado (usado por live-fetch) — suele ser el más tolerante
        {
          nombre: '/records',
          url: CONFIG.OCDS_API.BASE_URL + '/records?sourceId=' + CONFIG.OCDS_API.SOURCE_V3 +
               '&dataSegmentationID=' + (añoActual - 1) + '-12&page=1'
        },
        // Probe 2: /files año actual
        {
          nombre: '/files (año actual)',
          url: CONFIG.OCDS_API.BASE_URL + '/files?year=' + añoActual + '&source=' + CONFIG.OCDS_API.SOURCE_V3
        },
        // Probe 3: /files año anterior (fallback)
        {
          nombre: '/files (año anterior)',
          url: CONFIG.OCDS_API.BASE_URL + '/files?year=' + (añoActual - 1) + '&source=' + CONFIG.OCDS_API.SOURCE_V3
        }
      ];

      let ok = false;
      let lastCode = 0;
      let lastLatency = 0;
      let endpointOK = '';
      const intentos = [];

      for (let i = 0; i < candidatos.length && !ok; i++) {
        const t0 = Date.now();
        const response = UrlFetchApp.fetch(candidatos[i].url, {
          muteHttpExceptions: true,
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
            'User-Agent': CONFIG.OCDS_API.BROWSER_UA,
            'Referer': 'https://contratacionesabiertas.oece.gob.pe/'
          }
        });
        lastLatency = Date.now() - t0;
        lastCode = response.getResponseCode();
        intentos.push(candidatos[i].nombre + ':' + lastCode);
        if (lastCode === 200) {
          ok = true;
          endpointOK = candidatos[i].nombre;
        }
      }

      checks.push({
        grupo: 'Integraciones',
        nombre: 'API OCDS (contratacionesabiertas.oece.gob.pe)',
        ok: ok,
        detalle: ok
          ? 'HTTP 200 via ' + endpointOK + ' · ' + lastLatency + 'ms'
          : 'HTTP ' + lastCode + ' · ningún endpoint respondió [' + intentos.join(', ') + ']',
        meta: { latency: lastLatency, status: lastCode, intentos: intentos }
      });
    } catch (e) {
      checks.push({
        grupo: 'Integraciones',
        nombre: 'API OCDS',
        ok: false,
        detalle: 'Error: ' + e.toString()
      });
    }

    // 4) Drive folder
    try {
      const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
      checks.push({
        grupo: 'Integraciones',
        nombre: 'Carpeta Drive',
        ok: true,
        detalle: folder.getName(),
        meta: { id: CONFIG.DRIVE_FOLDER_ID, url: folder.getUrl() }
      });
    } catch (e) {
      checks.push({
        grupo: 'Integraciones',
        nombre: 'Carpeta Drive',
        ok: false,
        detalle: 'Error: ' + e.toString()
      });
    }

    // 5) Esquema: validar columnas clave de BD_PROCESOS
    const bdSheet = ss.getSheetByName(CONFIG.SHEETS.BD);
    if (bdSheet) {
      const headers = bdSheet.getRange(1, 1, 1, Math.max(1, bdSheet.getLastColumn())).getValues()[0];
      const esperadas = ['ID', 'NOMENCLATURA', 'ENTIDAD', 'REGION', 'OBJETO', 'DESCRIPCION', 'VALOR', 'MONEDA', 'FECHA_PUB'];
      const faltantes = esperadas.filter(function(col) { return headers.indexOf(col) === -1; });
      checks.push({
        grupo: 'Esquema',
        nombre: 'BD_PROCESOS columnas',
        ok: faltantes.length === 0,
        detalle: faltantes.length === 0 ? 'Todas presentes' : 'Faltan: ' + faltantes.join(', '),
        meta: { headers: headers }
      });
    }

    // 6) Validar SEGUIMIENTO tiene las 147 columnas esperadas (11 base + 8 etapas × 17)
    const segSheet = ss.getSheetByName(CONFIG.SHEETS.SEGUIMIENTO);
    if (segSheet) {
      const cols = segSheet.getLastColumn();
      const esperadas = 11 + (8 * (2 + 5 * 3));
      checks.push({
        grupo: 'Esquema',
        nombre: 'SEGUIMIENTO columnas',
        ok: cols === esperadas,
        detalle: cols + ' cols (esperadas: ' + esperadas + ')',
        meta: { actual: cols, esperada: esperadas }
      });
    }

    return Utils.successResponse({
      checks: checks,
      totalChecks: checks.length,
      pasadas: checks.filter(function(c) { return c.ok; }).length,
      duracion: (new Date() - inicio) + 'ms'
    });
  },

  /**
   * Debug específico: dado una nomenclatura, muestra qué ve cada estrategia
   * de búsqueda en OCDS_INDEX. Útil para diagnosticar "no se encontró" falsos.
   */
  debugBuscarIndice: function(params) {
    Utils.validateParams(params, ['nomenclatura']);
    const nomenclaturaOriginal = params.nomenclatura;
    const needle = OCDS_API._normalizarNomenclatura(nomenclaturaOriginal);

    const sheet = Utils.getSheetSafe(CONFIG.SHEETS.OCDS_INDEX);
    if (!sheet) {
      return Utils.errorResponse('Hoja OCDS_INDEX no existe');
    }

    const lastRow = sheet.getLastRow();
    const resultado = {
      input: {
        original: nomenclaturaOriginal,
        normalizado: needle,
        chars: needle.split('').map(function(c) { return { char: c, code: c.charCodeAt(0) }; })
      },
      hoja: {
        nombre: CONFIG.SHEETS.OCDS_INDEX,
        filas: lastRow - 1,
        lastRow: lastRow
      },
      estrategias: {}
    };

    if (lastRow < 2) {
      resultado.error = 'Hoja vacía';
      return Utils.successResponse(resultado);
    }

    const colA = sheet.getRange(2, 1, lastRow - 1, 1);

    // Estrategia 1: TextFinder exact
    try {
      const t0 = Date.now();
      const finder = colA.createTextFinder(needle)
        .matchCase(false).matchEntireCell(true).useRegularExpression(false);
      const cell = finder.findNext();
      resultado.estrategias.textFinderExact = {
        ok: !!cell,
        fila: cell ? cell.getRow() : null,
        valor: cell ? cell.getValue() : null,
        ms: Date.now() - t0
      };
    } catch (e) {
      resultado.estrategias.textFinderExact = { error: e.toString() };
    }

    // Estrategia 2: TextFinder substring
    try {
      const t0 = Date.now();
      const finder = colA.createTextFinder(needle)
        .matchCase(false).matchEntireCell(false).useRegularExpression(false);
      const cells = finder.findAll().slice(0, 5);
      resultado.estrategias.textFinderSubstring = {
        ok: cells.length > 0,
        matches: cells.map(function(c) {
          const val = String(c.getValue() || '');
          const normalizado = OCDS_API._normalizarNomenclatura(val);
          return {
            fila: c.getRow(),
            valor: val,
            normalizado: normalizado,
            matchExacto: normalizado === needle,
            longitud: val.length
          };
        }),
        totalMatches: cells.length,
        ms: Date.now() - t0
      };
    } catch (e) {
      resultado.estrategias.textFinderSubstring = { error: e.toString() };
    }

    // Estrategia 3: Búsqueda con _buscarEnIndice real
    try {
      const t0 = Date.now();
      const found = OCDS_API._buscarEnIndice(nomenclaturaOriginal);
      resultado.estrategias.buscarEnIndiceFinal = {
        ok: !!found,
        datos: found,
        ms: Date.now() - t0
      };
    } catch (e) {
      resultado.estrategias.buscarEnIndiceFinal = { error: e.toString() };
    }

    return Utils.successResponse(resultado);
  }
};

/**
 * 🧪 FUNCIÓN DE PRUEBA - Ejecuta esto para verificar la conexión a la API OCDS
 * Ve a Ejecutar > testConexionOCDS en el editor de Apps Script
 */
function testConexionOCDS() {
  const ui = SpreadsheetApp.getUi();

  ui.alert('🔄 Probando conexión...', 'Conectando a la API de Contrataciones Abiertas...', ui.ButtonSet.OK);

  try {
    const url = CONFIG.OCDS_API.BASE_URL + CONFIG.OCDS_API.RELEASES_ENDPOINT;

    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'Accept': 'application/json',
        'User-Agent': CONFIG.OCDS_API.BROWSER_UA
      }
    });

    const statusCode = response.getResponseCode();

    if (statusCode === 200) {
      const data = JSON.parse(response.getContentText());
      const releasesCount = data.releases ? data.releases.length : 0;

      // Mostrar info del primer release como ejemplo
      let ejemploInfo = '';
      if (data.releases && data.releases.length > 0) {
        const primer = data.releases[0];
        ejemploInfo = '\n\n📋 Ejemplo de datos:\n';
        ejemploInfo += '• ID: ' + (primer.tender ? primer.tender.id : 'N/A') + '\n';
        ejemploInfo += '• Título: ' + (primer.tender && primer.tender.title ? primer.tender.title.substring(0, 60) + '...' : 'N/A') + '\n';
        ejemploInfo += '• OCID: ' + (primer.ocid ? primer.ocid : 'N/A');
      }

      ui.alert(
        '✅ Conexión Exitosa',
        '¡La API OCDS está funcionando correctamente!\n\n' +
        '🌐 URL: ' + url + '\n' +
        '📊 Releases encontrados: ' + releasesCount +
        ejemploInfo,
        ui.ButtonSet.OK
      );
    } else {
      ui.alert(
        '⚠️ Error de Conexión',
        'La API respondió con código: ' + statusCode + '\n\n' +
        'URL probada: ' + url,
        ui.ButtonSet.OK
      );
    }

  } catch(error) {
    ui.alert(
      '❌ Error',
      'No se pudo conectar a la API OCDS:\n\n' + error.toString(),
      ui.ButtonSet.OK
    );
  }
}

/**
 * 🧪 Prueba buscar un proceso específico por nomenclatura
 * Modifica la variable 'nomenclatura' antes de ejecutar
 */
function testBuscarProceso() {
  const ui = SpreadsheetApp.getUi();

  // Pide al usuario la nomenclatura a buscar
  const respuesta = ui.prompt(
    '🔍 Buscar Proceso',
    'Ingresa la nomenclatura del proceso (ej: CP-SM-1-2025-ENTIDAD-1):',
    ui.ButtonSet.OK_CANCEL
  );

  if (respuesta.getSelectedButton() !== ui.Button.OK) return;

  const nomenclatura = respuesta.getResponseText().trim();
  if (!nomenclatura) {
    ui.alert('⚠️ Debes ingresar una nomenclatura');
    return;
  }

  ui.alert('🔄 Buscando...', 'Buscando ' + nomenclatura + ' en API OCDS...', ui.ButtonSet.OK);

  const resultado = SeaceScraper.scrapeProceso({ nomenclatura: nomenclatura });

  if (resultado.success) {
    ui.alert(
      '✅ Proceso Encontrado',
      '¡Se encontraron datos para ' + nomenclatura + '!\n\n' +
      '📅 Cronograma: ' + (resultado.datos && resultado.datos.cronograma ? resultado.datos.cronograma.length : 0) + ' etapas\n' +
      '📄 Documentos: ' + (resultado.datos && resultado.datos.documentos ? resultado.datos.documentos.length : 0) + '\n' +
      '👥 Postores: ' + (resultado.datos && resultado.datos.postores ? resultado.datos.postores.length : 0) + '\n\n' +
      'Los datos se guardaron en la hoja DATOS_SEACE',
      ui.ButtonSet.OK
    );
  } else {
    ui.alert(
      '❌ No Encontrado',
      resultado.error || 'El proceso no fue encontrado en la API OCDS.\n\n' +
      'Nota: La API solo contiene procesos recientes de contrataciones abiertas.',
      ui.ButtonSet.OK
    );
  }
}
