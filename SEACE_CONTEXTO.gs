/**
 * =====================================================
 * SEACE INTELLIGENCE - CONTEXTO Y ESTRUCTURA DE DATOS
 * =====================================================
 *
 * Google Sheets: https://docs.google.com/spreadsheets/d/1iugkHMAW40jLYeYxkbwC4_pox2tdRTqt4bclJzjN1iM/edit
 *
 * Este archivo documenta la estructura completa de las hojas,
 * columnas, tipos de datos y flujo del sistema SEACE Intelligence.
 *
 * INSTRUCCIONES:
 * 1. Copia este código en tu Apps Script
 * 2. Ejecuta "verContextoCompleto()" para ver el resumen
 * 3. Ejecuta "validarEstructura()" para verificar que todo esté correcto
 */

// ==================== CONFIGURACIÓN DEL SPREADSHEET ====================

const CONFIG = {
  SPREADSHEET_ID: '1iugkHMAW40jLYeYxkbwC4_pox2tdRTqt4bclJzjN1iM',
  SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1iugkHMAW40jLYeYxkbwC4_pox2tdRTqt4bclJzjN1iM/edit',
  DRIVE_FOLDER_ID: '1L1mzM6mTtALDN5waUPIbEhj2zEq7RBZH',
  DRIVE_FOLDER_URL: 'https://drive.google.com/drive/folders/1L1mzM6mTtALDN5waUPIbEhj2zEq7RBZH'
};

// ==================== ESTRUCTURA DE HOJAS ====================

/**
 * HOJA 1: SEACE_IMPORT
 * ---------------------
 * Propósito: Datos crudos copiados directamente desde el portal SEACE
 * Flujo: Usuario pega datos manualmente → Se procesan con "procesarImportSEACE()"
 *
 * Columnas:
 * | # | Columna                              | Tipo     | Descripción                                    |
 * |---|--------------------------------------|----------|------------------------------------------------|
 * | A | N°                                   | Number   | Número de fila original de SEACE               |
 * | B | Nombre o Sigla de la Entidad         | String   | Nombre completo de la entidad contratante      |
 * | C | Fecha y Hora de Publicacion          | DateTime | Fecha de publicación del proceso               |
 * | D | Nomenclatura                         | String   | ID único del proceso (ej: CP-SM-15-2025-...)   |
 * | E | Reiniciado Desde                     | String   | Nomenclatura del proceso anterior si reinició  |
 * | F | Objeto de Contratación               | String   | Tipo: Servicio, Bien, Obra, Consultoría        |
 * | G | Descripción de Objeto                | String   | Descripción detallada del proceso              |
 * | H | VR / VE / Cuantía de la contratación | Number   | Valor referencial en moneda                    |
 * | I | Moneda                               | String   | "Soles" o "Dólar"                              |
 * | J | Versión SEACE                        | String   | Versión del sistema SEACE usado                |
 */
const HOJA_SEACE_IMPORT = {
  nombre: 'SEACE_IMPORT',
  descripcion: 'Datos crudos pegados desde el portal SEACE',
  columnas: [
    { indice: 0, nombre: 'N°', tipo: 'Number', requerido: false },
    { indice: 1, nombre: 'Nombre o Sigla de la Entidad', tipo: 'String', requerido: true },
    { indice: 2, nombre: 'Fecha y Hora de Publicacion', tipo: 'DateTime', requerido: true },
    { indice: 3, nombre: 'Nomenclatura', tipo: 'String', requerido: true, unico: true },
    { indice: 4, nombre: 'Reiniciado Desde', tipo: 'String', requerido: false },
    { indice: 5, nombre: 'Objeto de Contratación', tipo: 'String', requerido: true },
    { indice: 6, nombre: 'Descripción de Objeto', tipo: 'String', requerido: true },
    { indice: 7, nombre: 'VR / VE / Cuantía de la contratación', tipo: 'Number', requerido: true },
    { indice: 8, nombre: 'Moneda', tipo: 'String', requerido: true },
    { indice: 9, nombre: 'Versión SEACE', tipo: 'String', requerido: false }
  ]
};

/**
 * HOJA 2: BD_PROCESOS
 * -------------------
 * Propósito: Base de datos procesada y normalizada de todos los procesos
 * Flujo: Se llena automáticamente desde SEACE_IMPORT
 *
 * Columnas:
 * | # | Columna      | Tipo     | Descripción                                    |
 * |---|--------------|----------|------------------------------------------------|
 * | A | ID           | Number   | ID autoincremental único                       |
 * | B | NOMENCLATURA | String   | ID único del proceso (clave primaria)          |
 * | C | ENTIDAD      | String   | Nombre de la entidad contratante               |
 * | D | REGION       | String   | Región detectada automáticamente               |
 * | E | OBJETO       | String   | Servicio|Bien|Obra|Consultoría de Obra         |
 * | F | DESCRIPCION  | String   | Descripción del objeto de contratación         |
 * | G | VALOR        | Number   | Valor referencial numérico                     |
 * | H | MONEDA       | String   | PEN (Soles) o USD (Dólares)                    |
 * | I | FECHA_PUB    | Date     | Fecha de publicación                           |
 * | J | VERSION      | String   | Versión SEACE                                  |
 * | K | REINICIADO   | String   | Nomenclatura del proceso anterior              |
 * | L | URL          | String   | URL directa al proceso en SEACE (opcional)     |
 */
const HOJA_BD_PROCESOS = {
  nombre: 'BD_PROCESOS',
  descripcion: 'Base de datos normalizada de procesos',
  clavePrimaria: 'NOMENCLATURA',
  columnas: [
    { indice: 0, nombre: 'ID', tipo: 'Number', requerido: true, autoIncrement: true },
    { indice: 1, nombre: 'NOMENCLATURA', tipo: 'String', requerido: true, unico: true },
    { indice: 2, nombre: 'ENTIDAD', tipo: 'String', requerido: true },
    { indice: 3, nombre: 'REGION', tipo: 'String', requerido: true, valores: ['AMAZONAS', 'ANCASH', 'APURIMAC', 'AREQUIPA', 'AYACUCHO', 'CAJAMARCA', 'CALLAO', 'CUSCO', 'HUANCAVELICA', 'HUANUCO', 'ICA', 'JUNIN', 'LA LIBERTAD', 'LAMBAYEQUE', 'LIMA', 'LORETO', 'MADRE DE DIOS', 'MOQUEGUA', 'PASCO', 'PIURA', 'PUNO', 'SAN MARTIN', 'TACNA', 'TUMBES', 'UCAYALI'] },
    { indice: 4, nombre: 'OBJETO', tipo: 'String', requerido: true, valores: ['Servicio', 'Bien', 'Obra', 'Consultoría de Obra'] },
    { indice: 5, nombre: 'DESCRIPCION', tipo: 'String', requerido: true },
    { indice: 6, nombre: 'VALOR', tipo: 'Number', requerido: true },
    { indice: 7, nombre: 'MONEDA', tipo: 'String', requerido: true, valores: ['PEN', 'USD'] },
    { indice: 8, nombre: 'FECHA_PUB', tipo: 'Date', requerido: true },
    { indice: 9, nombre: 'VERSION', tipo: 'String', requerido: false },
    { indice: 10, nombre: 'REINICIADO', tipo: 'String', requerido: false },
    { indice: 11, nombre: 'URL', tipo: 'String', requerido: false }
  ]
};

/**
 * HOJA 3: SEGUIMIENTO
 * -------------------
 * Propósito: Procesos que el usuario está siguiendo activamente
 * Flujo: Usuario agrega proceso → Se crean las 8 etapas → Se crea carpeta en Drive
 *
 * ESTRUCTURA ESPECIAL: Tiene 11 columnas base + 32 columnas de etapas (4 por cada 8 etapas)
 *
 * Columnas Base (A-K):
 * | # | Columna        | Tipo     | Descripción                                    |
 * |---|----------------|----------|------------------------------------------------|
 * | A | NOMENCLATURA   | String   | ID único del proceso (FK a BD_PROCESOS)        |
 * | B | ENTIDAD        | String   | Nombre de la entidad                           |
 * | C | OBJETO         | String   | Tipo de contratación                           |
 * | D | VALOR          | Number   | Valor referencial                              |
 * | E | REGION         | String   | Región del proceso                             |
 * | F | ESTADO_INTERES | String   | PENDIENTE|INSCRITO|DESCARTADO                  |
 * | G | PRIORIDAD      | String   | ALTA|MEDIA|BAJA                               |
 * | H | RESPONSABLE    | String   | Nombre del responsable asignado                |
 * | I | NOTAS          | String   | Notas generales del proceso                    |
 * | J | FECHA_AGREGADO | DateTime | Fecha en que se agregó a seguimiento           |
 * | K | CARPETA_DRIVE  | String   | URL de la carpeta en Google Drive              |
 *
 * Columnas de Etapas (L-AQ) - 4 columnas por cada una de las 8 etapas:
 * Patrón: {ETAPA}_ESTADO, {ETAPA}_INICIO, {ETAPA}_FIN, {ETAPA}_NOTAS
 */
const HOJA_SEGUIMIENTO = {
  nombre: 'SEGUIMIENTO',
  descripcion: 'Procesos en seguimiento activo con 8 etapas SEACE',
  clavePrimaria: 'NOMENCLATURA',
  columnasBase: [
    { indice: 0, nombre: 'NOMENCLATURA', tipo: 'String', requerido: true, unico: true },
    { indice: 1, nombre: 'ENTIDAD', tipo: 'String', requerido: true },
    { indice: 2, nombre: 'OBJETO', tipo: 'String', requerido: false },
    { indice: 3, nombre: 'VALOR', tipo: 'Number', requerido: false },
    { indice: 4, nombre: 'REGION', tipo: 'String', requerido: false },
    { indice: 5, nombre: 'ESTADO_INTERES', tipo: 'String', requerido: true, valores: ['PENDIENTE', 'INSCRITO', 'DESCARTADO'], default: 'PENDIENTE' },
    { indice: 6, nombre: 'PRIORIDAD', tipo: 'String', requerido: true, valores: ['ALTA', 'MEDIA', 'BAJA'], default: 'MEDIA' },
    { indice: 7, nombre: 'RESPONSABLE', tipo: 'String', requerido: false },
    { indice: 8, nombre: 'NOTAS', tipo: 'String', requerido: false },
    { indice: 9, nombre: 'FECHA_AGREGADO', tipo: 'DateTime', requerido: true },
    { indice: 10, nombre: 'CARPETA_DRIVE', tipo: 'String', requerido: false }
  ],
  etapas: [
    'CONVOCATORIA',
    'REGISTRO_PARTICIPANTES',
    'CONSULTAS_OBSERVACIONES',
    'ABSOLUCION_CONSULTAS',
    'INTEGRACION_BASES',
    'PRESENTACION_PROPUESTAS',
    'CALIFICACION_EVALUACION',
    'BUENA_PRO'
  ],
  columnasEtapa: ['_ESTADO', '_INICIO', '_FIN', '_NOTAS'],
  estadosEtapa: ['PENDIENTE', 'EN_CURSO', 'COMPLETADO', 'VENCIDO', 'NO_APLICA']
};

/**
 * HOJA 4: CRONOGRAMA
 * ------------------
 * Propósito: Fechas detalladas de cada etapa de cada proceso
 * Flujo: Se actualiza automáticamente al modificar etapas en SEGUIMIENTO
 *
 * Columnas:
 * | # | Columna      | Tipo   | Descripción                                    |
 * |---|--------------|--------|------------------------------------------------|
 * | A | NOMENCLATURA | String | ID del proceso (FK a SEGUIMIENTO)              |
 * | B | ETAPA        | String | Nombre de la etapa SEACE                       |
 * | C | FECHA_INICIO | Date   | Fecha de inicio de la etapa                    |
 * | D | FECHA_FIN    | Date   | Fecha de fin de la etapa                       |
 * | E | ESTADO       | String | PENDIENTE|EN_CURSO|COMPLETADO|VENCIDO          |
 */
const HOJA_CRONOGRAMA = {
  nombre: 'CRONOGRAMA',
  descripcion: 'Cronograma detallado de etapas por proceso',
  claveCompuesta: ['NOMENCLATURA', 'ETAPA'],
  columnas: [
    { indice: 0, nombre: 'NOMENCLATURA', tipo: 'String', requerido: true },
    { indice: 1, nombre: 'ETAPA', tipo: 'String', requerido: true, valores: HOJA_SEGUIMIENTO.etapas },
    { indice: 2, nombre: 'FECHA_INICIO', tipo: 'Date', requerido: false },
    { indice: 3, nombre: 'FECHA_FIN', tipo: 'Date', requerido: false },
    { indice: 4, nombre: 'ESTADO', tipo: 'String', requerido: true, valores: ['PENDIENTE', 'EN_CURSO', 'COMPLETADO', 'VENCIDO'], default: 'PENDIENTE' }
  ]
};

/**
 * HOJA 5: DOCUMENTOS
 * ------------------
 * Propósito: Archivos asociados a cada proceso/etapa
 * Flujo: Usuario sube documento → Se guarda en Drive → Se registra aquí
 *
 * Columnas:
 * | # | Columna        | Tipo     | Descripción                                    |
 * |---|----------------|----------|------------------------------------------------|
 * | A | NOMENCLATURA   | String   | ID del proceso (FK)                            |
 * | B | NOMBRE         | String   | Nombre del archivo                             |
 * | C | TIPO           | String   | PDF|DOCX|XLSX|ZIP|JPG|PNG|etc                  |
 * | D | ETAPA          | String   | Etapa a la que pertenece el documento          |
 * | E | URL_DRIVE      | String   | URL del archivo en Google Drive                |
 * | F | FECHA_AGREGADO | DateTime | Fecha en que se subió                          |
 */
const HOJA_DOCUMENTOS = {
  nombre: 'DOCUMENTOS',
  descripcion: 'Documentos asociados a procesos y etapas',
  columnas: [
    { indice: 0, nombre: 'NOMENCLATURA', tipo: 'String', requerido: true },
    { indice: 1, nombre: 'NOMBRE', tipo: 'String', requerido: true },
    { indice: 2, nombre: 'TIPO', tipo: 'String', requerido: true, valores: ['PDF', 'DOCX', 'XLSX', 'ZIP', 'JPG', 'PNG', 'OTRO'] },
    { indice: 3, nombre: 'ETAPA', tipo: 'String', requerido: false, valores: HOJA_SEGUIMIENTO.etapas },
    { indice: 4, nombre: 'URL_DRIVE', tipo: 'String', requerido: true },
    { indice: 5, nombre: 'FECHA_AGREGADO', tipo: 'DateTime', requerido: true }
  ]
};

/**
 * HOJA 6: FILTROS_ENTIDADES
 * -------------------------
 * Propósito: Entidades favoritas para filtrado rápido
 * Flujo: Usuario marca entidad → Aparece en filtros de la UI
 *
 * Columnas:
 * | # | Columna | Tipo    | Descripción                                    |
 * |---|---------|---------|------------------------------------------------|
 * | A | ENTIDAD | String  | Nombre de la entidad                           |
 * | B | ACTIVO  | Boolean | Si está activo en los filtros                  |
 */
const HOJA_FILTROS_ENTIDADES = {
  nombre: 'FILTROS_ENTIDADES',
  descripcion: 'Entidades favoritas para filtrado rápido',
  columnas: [
    { indice: 0, nombre: 'ENTIDAD', tipo: 'String', requerido: true, unico: true },
    { indice: 1, nombre: 'ACTIVO', tipo: 'Boolean', requerido: true, default: true }
  ]
};

/**
 * HOJA 7: FILTROS_PALABRAS
 * ------------------------
 * Propósito: Palabras clave para filtrar procesos por descripción
 * Flujo: Usuario agrega palabra → Se usa para buscar en DESCRIPCION
 *
 * Columnas:
 * | # | Columna | Tipo    | Descripción                                    |
 * |---|---------|---------|------------------------------------------------|
 * | A | PALABRA | String  | Palabra clave para buscar                      |
 * | B | ACTIVO  | Boolean | Si está activa en los filtros                  |
 */
const HOJA_FILTROS_PALABRAS = {
  nombre: 'FILTROS_PALABRAS',
  descripcion: 'Palabras clave para filtrar procesos',
  columnas: [
    { indice: 0, nombre: 'PALABRA', tipo: 'String', requerido: true, unico: true },
    { indice: 1, nombre: 'ACTIVO', tipo: 'Boolean', requerido: true, default: true }
  ]
};

/**
 * HOJA 8: REGIONES
 * ----------------
 * Propósito: Patrones para detectar automáticamente la región de una entidad
 * Flujo: Se usa en procesarImportSEACE() para asignar región
 *
 * Columnas:
 * | # | Columna | Tipo   | Descripción                                    |
 * |---|---------|--------|------------------------------------------------|
 * | A | PATRON  | String | Texto a buscar en el nombre de la entidad      |
 * | B | REGION  | String | Región asignada si se encuentra el patrón      |
 */
const HOJA_REGIONES = {
  nombre: 'REGIONES',
  descripcion: 'Patrones de texto para detectar regiones',
  columnas: [
    { indice: 0, nombre: 'PATRON', tipo: 'String', requerido: true },
    { indice: 1, nombre: 'REGION', tipo: 'String', requerido: true, valores: HOJA_BD_PROCESOS.columnas[3].valores }
  ]
};

// ==================== FLUJO DE DATOS ====================

/**
 * FLUJO PRINCIPAL DEL SISTEMA
 * ===========================
 *
 * 1. INGESTA DE DATOS
 *    ┌──────────────────┐
 *    │   Portal SEACE   │ ──(copiar/pegar)──► SEACE_IMPORT
 *    └──────────────────┘
 *           │
 *           ▼
 *    ┌──────────────────┐
 *    │procesarImportSEACE│ ──(normaliza + detecta región)──► BD_PROCESOS
 *    └──────────────────┘
 *
 * 2. SEGUIMIENTO DE PROCESOS
 *    ┌──────────────────┐
 *    │   BD_PROCESOS    │ ──(usuario selecciona)──► SEGUIMIENTO
 *    └──────────────────┘
 *           │
 *           ├──► Crea carpeta en Google Drive
 *           │    └── 8 subcarpetas (una por etapa)
 *           │
 *           └──► Inicializa 8 etapas en estado PENDIENTE
 *
 * 3. GESTIÓN DE ETAPAS
 *    ┌──────────────────┐
 *    │   SEGUIMIENTO    │ ◄──► CRONOGRAMA (sincronizado)
 *    └──────────────────┘
 *           │
 *           └──► DOCUMENTOS (archivos por etapa)
 *
 * 4. FILTROS PERSONALIZADOS
 *    ┌──────────────────┐
 *    │ FILTROS_ENTIDADES│ ──► Filtros UI
 *    │ FILTROS_PALABRAS │ ──► Filtros UI
 *    │ REGIONES         │ ──► Detección automática
 *    └──────────────────┘
 */

const FLUJO_DATOS = {
  descripcion: 'Flujo de datos del sistema SEACE Intelligence',
  pasos: [
    {
      paso: 1,
      nombre: 'Ingesta',
      origen: 'Portal SEACE (manual)',
      destino: 'SEACE_IMPORT',
      accion: 'Copiar y pegar datos del portal'
    },
    {
      paso: 2,
      nombre: 'Procesamiento',
      origen: 'SEACE_IMPORT',
      destino: 'BD_PROCESOS',
      accion: 'procesarImportSEACE() - Normaliza datos y detecta región'
    },
    {
      paso: 3,
      nombre: 'Seguimiento',
      origen: 'BD_PROCESOS',
      destino: 'SEGUIMIENTO',
      accion: 'addSeguimiento() - Usuario agrega proceso a seguir'
    },
    {
      paso: 4,
      nombre: 'Drive',
      origen: 'SEGUIMIENTO',
      destino: 'Google Drive',
      accion: 'crearCarpetaProcesoEnDrive() - Crea estructura de carpetas'
    },
    {
      paso: 5,
      nombre: 'Cronograma',
      origen: 'SEGUIMIENTO',
      destino: 'CRONOGRAMA',
      accion: 'updateEtapaSeguimiento() - Sincroniza fechas de etapas'
    },
    {
      paso: 6,
      nombre: 'Documentos',
      origen: 'Usuario',
      destino: 'DOCUMENTOS + Drive',
      accion: 'addDocumento() - Registra archivos subidos'
    }
  ]
};

// ==================== ETAPAS SEACE DETALLADAS ====================

/**
 * LAS 8 ETAPAS DEL PROCESO SEACE
 * ==============================
 *
 * Cada proceso de contratación pública pasa por estas 8 etapas obligatorias:
 */
const ETAPAS_DETALLE = [
  {
    numero: 1,
    nombre: 'CONVOCATORIA',
    descripcion: 'Publicación del proceso de contratación en el portal SEACE',
    acciones: ['Publicar bases', 'Definir cronograma', 'Establecer valor referencial'],
    documentos: ['Bases del proceso', 'Resumen ejecutivo', 'Anexos técnicos'],
    carpetaDrive: '01_CONVOCATORIA'
  },
  {
    numero: 2,
    nombre: 'REGISTRO_PARTICIPANTES',
    descripcion: 'Inscripción electrónica de proveedores interesados',
    acciones: ['Registrarse en el proceso', 'Pagar derechos', 'Obtener credenciales'],
    documentos: ['Constancia de inscripción', 'Comprobante de pago'],
    carpetaDrive: '02_BASES'
  },
  {
    numero: 3,
    nombre: 'CONSULTAS_OBSERVACIONES',
    descripcion: 'Formulación de consultas y observaciones a las bases',
    acciones: ['Enviar consultas', 'Plantear observaciones', 'Solicitar aclaraciones'],
    documentos: ['Formato de consultas', 'Observaciones técnicas'],
    carpetaDrive: '03_CONSULTAS_OBSERVACIONES'
  },
  {
    numero: 4,
    nombre: 'ABSOLUCION_CONSULTAS',
    descripcion: 'Respuesta de la entidad a las consultas y observaciones',
    acciones: ['Revisar respuestas', 'Analizar aclaraciones'],
    documentos: ['Pliego de absolución', 'Respuestas oficiales'],
    carpetaDrive: '03_CONSULTAS_OBSERVACIONES'
  },
  {
    numero: 5,
    nombre: 'INTEGRACION_BASES',
    descripcion: 'Publicación de las bases integradas finales',
    acciones: ['Descargar bases finales', 'Verificar cambios', 'Preparar propuesta'],
    documentos: ['Bases integradas', 'Anexos finales'],
    carpetaDrive: '04_BASES_INTEGRADAS'
  },
  {
    numero: 6,
    nombre: 'PRESENTACION_PROPUESTAS',
    descripcion: 'Envío electrónico de propuestas técnicas y económicas',
    acciones: ['Subir propuesta técnica', 'Subir propuesta económica', 'Confirmar envío'],
    documentos: ['Propuesta técnica', 'Propuesta económica', 'Documentos habilitantes'],
    carpetaDrive: '05_PROPUESTA_TECNICA,06_PROPUESTA_ECONOMICA'
  },
  {
    numero: 7,
    nombre: 'CALIFICACION_EVALUACION',
    descripcion: 'Evaluación de propuestas por el comité de selección',
    acciones: ['Revisar actas', 'Verificar puntajes', 'Presentar recursos (si aplica)'],
    documentos: ['Acta de evaluación', 'Cuadro comparativo'],
    carpetaDrive: '07_CALIFICACION'
  },
  {
    numero: 8,
    nombre: 'BUENA_PRO',
    descripcion: 'Otorgamiento de la buena pro al postor ganador',
    acciones: ['Verificar resultado', 'Presentar apelación (si aplica)', 'Firmar contrato'],
    documentos: ['Acta de buena pro', 'Contrato', 'Garantías'],
    carpetaDrive: '08_DOCUMENTOS_ADICIONALES'
  }
];

// ==================== ESTADOS DEL SISTEMA ====================

const ESTADOS = {
  // Estados de interés del proceso
  INTERES: {
    PENDIENTE: 'Proceso identificado, aún no se decide participar',
    INSCRITO: 'Decisión de participar, en proceso de inscripción o inscrito',
    DESCARTADO: 'Se decidió no participar en este proceso'
  },

  // Prioridad del proceso
  PRIORIDAD: {
    ALTA: 'Proceso prioritario, requiere atención inmediata',
    MEDIA: 'Proceso importante, seguimiento regular',
    BAJA: 'Proceso de bajo interés, seguimiento ocasional'
  },

  // Estados de cada etapa
  ETAPA: {
    PENDIENTE: 'Etapa aún no iniciada',
    EN_CURSO: 'Etapa actualmente en ejecución',
    COMPLETADO: 'Etapa finalizada exitosamente',
    VENCIDO: 'Etapa cuya fecha límite ya pasó',
    NO_APLICA: 'Etapa que no aplica para este proceso'
  }
};

// ==================== REGIONES DEL PERÚ ====================

const REGIONES_PERU = {
  'AMAZONAS': { patrones: ['AMAZONAS', 'CHACHAPOYAS', 'BAGUA'] },
  'ANCASH': { patrones: ['ANCASH', 'HUARAZ', 'CHIMBOTE'] },
  'APURIMAC': { patrones: ['APURIMAC', 'ABANCAY', 'ANDAHUAYLAS'] },
  'AREQUIPA': { patrones: ['AREQUIPA', 'ELECTROSUR', 'SEAL', 'AUTODEMA'] },
  'AYACUCHO': { patrones: ['AYACUCHO', 'HUAMANGA'] },
  'CAJAMARCA': { patrones: ['CAJAMARCA', 'JAEN'] },
  'CALLAO': { patrones: ['CALLAO'] },
  'CUSCO': { patrones: ['CUSCO', 'ELECTRO SUR ESTE'] },
  'HUANCAVELICA': { patrones: ['HUANCAVELICA'] },
  'HUANUCO': { patrones: ['HUANUCO'] },
  'ICA': { patrones: ['ICA', 'NAZCA', 'PISCO'] },
  'JUNIN': { patrones: ['JUNIN', 'HUANCAYO', 'ELECTROCENTRO'] },
  'LA LIBERTAD': { patrones: ['LA LIBERTAD', 'TRUJILLO', 'HIDRANDINA'] },
  'LAMBAYEQUE': { patrones: ['LAMBAYEQUE', 'CHICLAYO', 'ELECTRONORTE'] },
  'LIMA': { patrones: ['LIMA', 'ENEL', 'LUZ DEL SUR', 'SEDAPAL', 'MINISTERIO'] },
  'LORETO': { patrones: ['LORETO', 'IQUITOS', 'ELECTRO ORIENTE'] },
  'MADRE DE DIOS': { patrones: ['MADRE DE DIOS', 'PUERTO MALDONADO'] },
  'MOQUEGUA': { patrones: ['MOQUEGUA', 'ILO'] },
  'PASCO': { patrones: ['PASCO', 'CERRO DE PASCO'] },
  'PIURA': { patrones: ['PIURA', 'ENOSA', 'SULLANA'] },
  'PUNO': { patrones: ['PUNO', 'JULIACA', 'ELECTRO PUNO'] },
  'SAN MARTIN': { patrones: ['SAN MARTIN', 'TARAPOTO', 'MOYOBAMBA'] },
  'TACNA': { patrones: ['TACNA', 'ELECTROSUR'] },
  'TUMBES': { patrones: ['TUMBES'] },
  'UCAYALI': { patrones: ['UCAYALI', 'PUCALLPA'] }
};

// ==================== FUNCIONES DE UTILIDAD ====================

/**
 * Muestra el contexto completo del sistema en un diálogo
 */
function verContextoCompleto() {
  const hojas = [
    HOJA_SEACE_IMPORT,
    HOJA_BD_PROCESOS,
    HOJA_SEGUIMIENTO,
    HOJA_CRONOGRAMA,
    HOJA_DOCUMENTOS,
    HOJA_FILTROS_ENTIDADES,
    HOJA_FILTROS_PALABRAS,
    HOJA_REGIONES
  ];

  let msg = '📊 ESTRUCTURA DE HOJAS SEACE INTELLIGENCE\n';
  msg += '=' .repeat(50) + '\n\n';

  hojas.forEach((hoja, i) => {
    msg += `${i + 1}. ${hoja.nombre}\n`;
    msg += `   ${hoja.descripcion}\n`;
    if (hoja.columnas) {
      msg += `   Columnas: ${hoja.columnas.length}\n`;
    }
    if (hoja.columnasBase) {
      msg += `   Columnas base: ${hoja.columnasBase.length}\n`;
      msg += `   Etapas: ${hoja.etapas.length} (x4 cols c/u = ${hoja.etapas.length * 4})\n`;
    }
    msg += '\n';
  });

  msg += '\n📁 CARPETA DRIVE: ' + CONFIG.DRIVE_FOLDER_URL;

  SpreadsheetApp.getUi().alert(msg);
}

/**
 * Valida que la estructura de las hojas coincida con la esperada
 */
function validarEstructura() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let errores = [];
  let correctos = [];

  const hojas = [
    { config: HOJA_SEACE_IMPORT, esperadas: HOJA_SEACE_IMPORT.columnas.length },
    { config: HOJA_BD_PROCESOS, esperadas: HOJA_BD_PROCESOS.columnas.length },
    { config: HOJA_SEGUIMIENTO, esperadas: 11 + (8 * 4) }, // 11 base + 32 etapas
    { config: HOJA_CRONOGRAMA, esperadas: HOJA_CRONOGRAMA.columnas.length },
    { config: HOJA_DOCUMENTOS, esperadas: HOJA_DOCUMENTOS.columnas.length },
    { config: HOJA_FILTROS_ENTIDADES, esperadas: HOJA_FILTROS_ENTIDADES.columnas.length },
    { config: HOJA_FILTROS_PALABRAS, esperadas: HOJA_FILTROS_PALABRAS.columnas.length },
    { config: HOJA_REGIONES, esperadas: HOJA_REGIONES.columnas.length }
  ];

  hojas.forEach(h => {
    const sheet = ss.getSheetByName(h.config.nombre);
    if (!sheet) {
      errores.push(`❌ Hoja "${h.config.nombre}" no existe`);
      return;
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const colCount = headers.filter(h => h !== '').length;

    if (colCount !== h.esperadas) {
      errores.push(`⚠️ ${h.config.nombre}: ${colCount} cols (esperadas: ${h.esperadas})`);
    } else {
      correctos.push(`✅ ${h.config.nombre}: ${colCount} columnas OK`);
    }
  });

  let msg = '🔍 VALIDACIÓN DE ESTRUCTURA\n';
  msg += '=' .repeat(40) + '\n\n';

  if (correctos.length > 0) {
    msg += 'CORRECTOS:\n' + correctos.join('\n') + '\n\n';
  }

  if (errores.length > 0) {
    msg += 'ERRORES:\n' + errores.join('\n');
  } else {
    msg += '🎉 ¡Todas las hojas tienen la estructura correcta!';
  }

  SpreadsheetApp.getUi().alert(msg);
}

/**
 * Obtiene los headers de la hoja SEGUIMIENTO con todas las etapas
 */
function getHeadersSeguimiento() {
  const base = HOJA_SEGUIMIENTO.columnasBase.map(c => c.nombre);

  HOJA_SEGUIMIENTO.etapas.forEach(etapa => {
    HOJA_SEGUIMIENTO.columnasEtapa.forEach(sufijo => {
      base.push(etapa + sufijo);
    });
  });

  return base;
}

/**
 * Genera un reporte JSON con toda la estructura
 */
function exportarEstructuraJSON() {
  const estructura = {
    config: CONFIG,
    hojas: {
      SEACE_IMPORT: HOJA_SEACE_IMPORT,
      BD_PROCESOS: HOJA_BD_PROCESOS,
      SEGUIMIENTO: HOJA_SEGUIMIENTO,
      CRONOGRAMA: HOJA_CRONOGRAMA,
      DOCUMENTOS: HOJA_DOCUMENTOS,
      FILTROS_ENTIDADES: HOJA_FILTROS_ENTIDADES,
      FILTROS_PALABRAS: HOJA_FILTROS_PALABRAS,
      REGIONES: HOJA_REGIONES
    },
    flujo: FLUJO_DATOS,
    etapas: ETAPAS_DETALLE,
    estados: ESTADOS,
    regiones: REGIONES_PERU
  };

  Logger.log(JSON.stringify(estructura, null, 2));

  SpreadsheetApp.getUi().alert(
    '📋 Estructura exportada a Logger.\n\n' +
    'Ve a Ver > Registros para copiar el JSON completo.'
  );

  return estructura;
}

/**
 * Muestra un resumen de datos actuales
 */
function verResumenDatos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const hojas = ['SEACE_IMPORT', 'BD_PROCESOS', 'SEGUIMIENTO', 'CRONOGRAMA', 'DOCUMENTOS', 'FILTROS_ENTIDADES', 'FILTROS_PALABRAS', 'REGIONES'];

  let msg = '📈 RESUMEN DE DATOS\n';
  msg += '=' .repeat(40) + '\n\n';

  hojas.forEach(nombre => {
    const sheet = ss.getSheetByName(nombre);
    if (sheet) {
      const filas = Math.max(0, sheet.getLastRow() - 1); // -1 por header
      msg += `${nombre}: ${filas} registros\n`;
    } else {
      msg += `${nombre}: ⚠️ No existe\n`;
    }
  });

  SpreadsheetApp.getUi().alert(msg);
}

/**
 * Crea menú de contexto
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📚 Contexto SEACE')
    .addItem('Ver estructura completa', 'verContextoCompleto')
    .addItem('Validar estructura', 'validarEstructura')
    .addItem('Ver resumen de datos', 'verResumenDatos')
    .addSeparator()
    .addItem('Exportar estructura JSON', 'exportarEstructuraJSON')
    .addItem('Ver headers SEGUIMIENTO', 'mostrarHeadersSeguimiento')
    .addToUi();
}

function mostrarHeadersSeguimiento() {
  const headers = getHeadersSeguimiento();
  let msg = 'HEADERS HOJA SEGUIMIENTO (' + headers.length + ' columnas)\n\n';

  headers.forEach((h, i) => {
    msg += `${String.fromCharCode(65 + (i % 26))}${i >= 26 ? String.fromCharCode(65 + Math.floor(i / 26) - 1) : ''}: ${h}\n`;
  });

  Logger.log(msg);
  SpreadsheetApp.getUi().alert('Headers exportados a Logger.\n\nTotal: ' + headers.length + ' columnas');
}
