# MODIFICACIONES.MD - SEACE Intelligence v2.0

## 📋 RESUMEN EJECUTIVO

Este documento contiene las instrucciones detalladas para que Claude Code implemente las mejoras en la plataforma SEACE Intelligence. Las mejoras se centran en:

1. **Sistema de filtrado mejorado** con empresas eléctricas configurables
2. **Vista de seguimiento revolucionada** con ficha completa por proceso
3. **Sistema de históricos multi-año** con comparativa visual
4. **Extracción de datos por IA** desde capturas del SEACE
5. **Colores por empresa** en una sola hoja (sin múltiples hojas)

---

## 🏢 PARTE 1: LISTA DE EMPRESAS ELÉCTRICAS PARA FILTRO

### 1.1 Crear/Actualizar hoja FILTROS_EMPRESAS_ELECTRICAS

En Google Sheets, crear una nueva hoja llamada `FILTROS_EMPRESAS_ELECTRICAS` con la siguiente estructura:

| ITEM | NOMBRE_COMPLETO | NOMBRE_CORTO | PATRON_BUSQUEDA | COLOR_HEX | ACTIVO |
|------|-----------------|--------------|-----------------|-----------|--------|
| 1 | Consorcio Eléctrico de Villacurí S.A.C. | VILLACURI | VILLACURI | #E3F2FD | TRUE |
| 2 | Electricidad Pangoa S.A. - EGEPSA | EGEPSA | EGEPSA\|PANGOA | #E8F5E9 | TRUE |
| 3 | Electro Dunas S.A.A. | ELECTRO DUNAS | ELECTRO DUNAS\|DUNAS | #FFF3E0 | TRUE |
| 4 | Electro Tocache S.A. | ELECTRO TOCACHE | TOCACHE | #FCE4EC | TRUE |
| 5 | Electrocentro S.A. | ELECTROCENTRO | ELECTROCENTRO\|ELECTRO.*CENTRO | #F3E5F5 | TRUE |
| 6 | Electronoroeste S.A. - ENOSA | ENOSA | ENOSA\|NOR.*OESTE\|ELECTRONOROESTE | #E0F7FA | TRUE |
| 7 | Empresa de Generación Eléctrica de Arequipa S.A. - EGASA | EGASA | EGASA\|GENERACION.*AREQUIPA | #FFF8E1 | TRUE |
| 8 | Empresa Regional de Servicio Público de Electricidad del Sur Este S.A.A. - ELSE | ELSE | ELSE\|SUR.*ESTE | #E8EAF6 | TRUE |
| 9 | Empresa Regional de Servicio Público de Electricidad - ELECTRO ORIENTE | ELECTRO ORIENTE | ELECTRO.*ORIENTE\|ORIENTE | #EFEBE9 | TRUE |
| 10 | Empresa de Administración de Infraestructura Eléctrica S.A. - ADINELSA | ADINELSA | ADINELSA | #ECEFF1 | TRUE |
| 11 | Empresa Regional de Servicio Público de Electricidad ELECTROSUR S.A. | ELECTROSUR | ELECTROSUR | #FBE9E7 | TRUE |
| 12 | Empresa de Servicios Eléctricos Municipal de Pativilca S.A.C. - ESEMPAT S.A.C. | ESEMPAT | ESEMPAT\|PATIVILCA | #F1F8E9 | TRUE |
| 13 | Empresa de Servicios Eléctricos Municipales de Paramonga S.A. - EMSEM S.A. | EMSEM | EMSEM\|PARAMONGA | #E0F2F1 | TRUE |
| 14 | Empresa Municipal de Servicios Eléctricos Utcubamba S.A.C. - EMSEU S.A.C. | EMSEU | EMSEU\|UTCUBAMBA | #FFF9C4 | TRUE |
| 15 | Empresa Regional de Servicio Público de Electricidad de Puno S.A.A. | ELECTRO PUNO | ELECTRO.*PUNO\|PUNO.*ELECTRI | #FFECB3 | TRUE |
| 16 | Empresa Regional de Servicio Público de Electricidad Electronortemedio S.A. - HIDRANDINA | HIDRANDINA | HIDRANDINA\|ELECTRONORTEMEDIO\|NOR.*MEDIO | #B3E5FC | TRUE |
| 17 | Luz del Sur S.A.A. | LUZ DEL SUR | LUZ.*SUR | #DCEDC8 | TRUE |
| 18 | Pluz Energía Perú S.A.A. (antes Enel Distribución Perú S.A.A.) | PLUZ/ENEL | PLUZ\|ENEL | #F0F4C3 | TRUE |
| 19 | Servicios Eléctricos Rioja S.A. - SERSA | SERSA | SERSA\|RIOJA | #FFE0B2 | TRUE |
| 20 | Sociedad Eléctrica del Sur Oeste S.A. - SEAL | SEAL | SEAL\|SUR.*OESTE | #D1C4E9 | TRUE |
| 21 | Empresa de Servicio Público de Electricidad Electronorte S.A. | ELECTRONORTE | ELECTRONORTE | #FFCDD2 | TRUE |
| 22 | Empresa Concesionaria de Electricidad de Ucayali S.A. | ELECTRO UCAYALI | UCAYALI | #C8E6C9 | TRUE |
| 23 | Organismo Supervisor de la Inversión en Energía y Minería | OSINERGMIN | OSINERGMIN | #B2DFDB | TRUE |
| 24 | Empresa de Generación Eléctrica San Gabán S.A. | SAN GABAN | SAN.*GABAN | #FFCCBC | TRUE |
| 25 | Empresa de Generación Eléctrica Machupicchu S.A. | MACHUPICCHU | MACHUPICCHU | #D7CCC8 | TRUE |

### 1.2 Modificar GOOGLE_APPS_SCRIPT.js - Nueva función getEmpresasElectricas()

```javascript
/**
 * Obtiene la lista de empresas eléctricas configuradas para filtrado
 * @returns {Object} Lista de empresas con sus patrones y colores
 */
function getEmpresasElectricas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('FILTROS_EMPRESAS_ELECTRICAS');
  
  // Si no existe la hoja, crearla con datos por defecto
  if (!sheet) {
    sheet = crearHojaEmpresasElectricas_();
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
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
  
  return {
    success: true,
    empresas: empresas,
    total: empresas.length
  };
}

/**
 * Actualiza el estado activo/inactivo de una empresa
 * @param {number} item - Número de item de la empresa
 * @param {boolean} activo - Estado activo/inactivo
 */
function toggleEmpresaElectrica(item, activo) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('FILTROS_EMPRESAS_ELECTRICAS');
  
  if (!sheet) {
    return { success: false, error: 'Hoja FILTROS_EMPRESAS_ELECTRICAS no encontrada' };
  }
  
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === item) {
      sheet.getRange(i + 1, 6).setValue(activo); // Columna ACTIVO
      return { success: true, mensaje: `Empresa ${item} actualizada a ${activo}` };
    }
  }
  
  return { success: false, error: 'Empresa no encontrada' };
}

/**
 * Agrega una nueva empresa eléctrica al filtro
 */
function addEmpresaElectrica(nombreCompleto, nombreCorto, patronBusqueda, colorHex) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('FILTROS_EMPRESAS_ELECTRICAS');
  
  if (!sheet) {
    return { success: false, error: 'Hoja no encontrada' };
  }
  
  const lastRow = sheet.getLastRow();
  const newItem = lastRow; // Siguiente número
  
  sheet.appendRow([newItem, nombreCompleto, nombreCorto, patronBusqueda, colorHex, true]);
  
  return { 
    success: true, 
    mensaje: `Empresa ${nombreCorto} agregada con éxito`,
    item: newItem
  };
}

/**
 * Filtra procesos por empresas eléctricas activas
 * @param {Array} procesos - Array de procesos a filtrar
 * @returns {Array} Procesos filtrados con color asignado
 */
function filtrarPorEmpresasElectricas(procesos) {
  const empresasConfig = getEmpresasElectricas();
  if (!empresasConfig.success) return procesos;
  
  const empresas = empresasConfig.empresas;
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
}

/**
 * Crea la hoja de empresas eléctricas con datos por defecto
 * @private
 */
function crearHojaEmpresasElectricas_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.insertSheet('FILTROS_EMPRESAS_ELECTRICAS');
  
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
```

---

## 📊 PARTE 2: MEJORA DE VISTA DE SEGUIMIENTO

### 2.1 Nueva estructura de hoja SEGUIMIENTO

Agregar las siguientes columnas a la hoja SEGUIMIENTO (después de las columnas de etapas existentes):

```
COLUMNAS ADICIONALES:
- VALOR_REFERENCIAL (número)
- MONTO_ADJUDICADO (número)
- GANADOR_RUC (texto)
- GANADOR_NOMBRE (texto)
- NUMERO_CONTRATO (texto)
- FECHA_CONTRATO (fecha)
- TOTAL_POSTORES (número)
- TIENE_CONSULTAS (boolean)
- TOTAL_DOCUMENTOS (número)
- LINK_SEACE (URL)
- DATOS_COMPLETOS_JSON (texto largo - JSON con todos los datos)
```

### 2.2 Modificar GOOGLE_APPS_SCRIPT.js - Función getSeguimientoDetalle() mejorada

```javascript
/**
 * Obtiene el detalle completo de un proceso en seguimiento
 * Incluye: cronograma, documentos, postores, contrato, comité
 * @param {string} nomenclatura - Nomenclatura del proceso
 * @returns {Object} Detalle completo del proceso
 */
function getSeguimientoDetalleCompleto(nomenclatura) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const seguimientoSheet = ss.getSheetByName('SEGUIMIENTO');
  
  if (!seguimientoSheet) {
    return { success: false, error: 'Hoja SEGUIMIENTO no encontrada' };
  }
  
  // Buscar proceso
  const data = seguimientoSheet.getDataRange().getValues();
  const headers = data[0];
  let procesoRow = null;
  let rowIndex = -1;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === nomenclatura) {
      procesoRow = data[i];
      rowIndex = i;
      break;
    }
  }
  
  if (!procesoRow) {
    return { success: false, error: 'Proceso no encontrado en seguimiento' };
  }
  
  // Construir objeto de respuesta
  const proceso = {};
  headers.forEach((header, idx) => {
    proceso[header] = procesoRow[idx];
  });
  
  // Parsear JSON de datos completos si existe
  let datosCompletos = {};
  const jsonColIndex = headers.indexOf('DATOS_COMPLETOS_JSON');
  if (jsonColIndex !== -1 && procesoRow[jsonColIndex]) {
    try {
      datosCompletos = JSON.parse(procesoRow[jsonColIndex]);
    } catch (e) {
      datosCompletos = {};
    }
  }
  
  // Obtener históricos del proceso
  const historicos = getHistoricosProcesoCompleto_(nomenclatura);
  
  // Obtener documentos asociados
  const documentos = getDocumentosProceso_(nomenclatura);
  
  return {
    success: true,
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
      cronograma: extraerCronograma_(proceso),
      
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
  };
}

/**
 * Extrae el cronograma de las 8 etapas del proceso
 * @private
 */
function extraerCronograma_(proceso) {
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
      estado: proceso[`${etapa}_ESTADO`] || 'PENDIENTE',
      fechaInicio: proceso[`${etapa}_INICIO`],
      fechaFin: proceso[`${etapa}_FIN`],
      notas: proceso[`${etapa}_NOTAS`]
    });
  }
  
  return cronograma;
}

/**
 * Obtiene los históricos completos de un proceso (todos los años)
 * @private
 */
function getHistoricosProcesoCompleto_(nomenclaturaActual) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const historicosSheet = ss.getSheetByName('HISTORICOS_DETALLE');
  
  if (!historicosSheet) {
    return [];
  }
  
  // Extraer base de nomenclatura (sin año)
  const baseNomenclatura = nomenclaturaActual.replace(/-\d{4}-/, '-{AÑO}-');
  const match = nomenclaturaActual.match(/-(\d{4})-/);
  
  if (!match) return [];
  
  const data = historicosSheet.getDataRange().getValues();
  const headers = data[0];
  const historicos = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const nomenclatura = row[0];
    
    // Verificar si pertenece al mismo grupo
    if (nomenclatura && nomenclatura.replace(/-\d{4}-/, '-{AÑO}-') === baseNomenclatura) {
      const historico = {};
      headers.forEach((header, idx) => {
        historico[header] = row[idx];
      });
      historicos.push(historico);
    }
  }
  
  // Ordenar por año descendente
  historicos.sort((a, b) => {
    const añoA = (a.NOMENCLATURA || '').match(/-(\d{4})-/)?.[1] || 0;
    const añoB = (b.NOMENCLATURA || '').match(/-(\d{4})-/)?.[1] || 0;
    return añoB - añoA;
  });
  
  return historicos;
}

/**
 * Obtiene documentos de un proceso
 * @private
 */
function getDocumentosProceso_(nomenclatura) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const docsSheet = ss.getSheetByName('DOCUMENTOS');
  
  if (!docsSheet) return [];
  
  const data = docsSheet.getDataRange().getValues();
  const headers = data[0];
  const documentos = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === nomenclatura) {
      const doc = {};
      headers.forEach((header, idx) => {
        doc[header] = data[i][idx];
      });
      documentos.push(doc);
    }
  }
  
  return documentos;
}
```

---

## 📅 PARTE 3: SISTEMA DE HISTÓRICOS MEJORADO

### 3.1 Crear nueva hoja HISTORICOS_DETALLE

Estructura de la hoja:

| Columna | Tipo | Descripción |
|---------|------|-------------|
| NOMENCLATURA | texto | CP-SM-36-2024-ELSE-1 |
| AÑO | número | 2024 |
| ENTIDAD | texto | Nombre completo |
| OBJETO | texto | Descripción del objeto |
| VALOR_REFERENCIAL | número | Monto VR |
| MONTO_ADJUDICADO | número | Monto final |
| GANADOR_RUC | texto | RUC del ganador |
| GANADOR_NOMBRE | texto | Nombre del ganador |
| FECHA_CONVOCATORIA | fecha | Inicio convocatoria |
| FECHA_BUENA_PRO | fecha | Fecha otorgamiento |
| NUMERO_CONTRATO | texto | Ej: 039-2024 |
| TOTAL_POSTORES | número | Cantidad de postores |
| LINK_SEACE | URL | Link al proceso |
| LINK_OSCE | URL | Link directo OSCE |
| DOCUMENTOS_JSON | texto | JSON con lista de docs |
| POSTORES_JSON | texto | JSON con postores |
| COMITE_JSON | texto | JSON con comité |
| CONSULTAS_JSON | texto | JSON con consultas |
| FECHA_EXTRACCION | fecha | Cuándo se extrajo |
| FUENTE | texto | MANUAL/IA/OCDS |

### 3.2 Función para guardar histórico extraído por IA

```javascript
/**
 * Guarda los datos de un histórico extraídos por IA desde capturas SEACE
 * @param {Object} datosExtraidos - Datos en formato JSON extraídos por IA
 * @returns {Object} Resultado de la operación
 */
function guardarHistoricoExtraidoIA(datosExtraidos) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('HISTORICOS_DETALLE');
  
  // Crear hoja si no existe
  if (!sheet) {
    sheet = crearHojaHistoricosDetalle_();
  }
  
  // Validar datos mínimos
  if (!datosExtraidos.nomenclatura) {
    return { success: false, error: 'Falta nomenclatura en los datos' };
  }
  
  // Extraer año de nomenclatura
  const matchAño = datosExtraidos.nomenclatura.match(/-(\d{4})-/);
  const año = matchAño ? parseInt(matchAño[1]) : new Date().getFullYear();
  
  // Verificar si ya existe
  const data = sheet.getDataRange().getValues();
  let existeRow = -1;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === datosExtraidos.nomenclatura) {
      existeRow = i + 1;
      break;
    }
  }
  
  // Preparar fila de datos
  const nuevaFila = [
    datosExtraidos.nomenclatura,
    año,
    datosExtraidos.entidad || '',
    datosExtraidos.objeto || datosExtraidos.descripcion || '',
    datosExtraidos.valor_referencial || 0,
    datosExtraidos.monto_adjudicado || 0,
    datosExtraidos.ganador?.ruc || datosExtraidos.ganador_ruc || '',
    datosExtraidos.ganador?.nombre || datosExtraidos.ganador_nombre || '',
    datosExtraidos.fecha_convocatoria || datosExtraidos.cronograma?.[0]?.fecha_inicio || '',
    datosExtraidos.fecha_buena_pro || datosExtraidos.cronograma?.[7]?.fecha_fin || '',
    datosExtraidos.numero_contrato || '',
    datosExtraidos.postores?.length || datosExtraidos.total_postores || 0,
    datosExtraidos.link_seace || '',
    datosExtraidos.link_osce || _construirLinkOSCE(datosExtraidos.nomenclatura, datosExtraidos.tender_id),
    JSON.stringify(datosExtraidos.documentos || []),
    JSON.stringify(datosExtraidos.postores || []),
    JSON.stringify(datosExtraidos.comite || []),
    JSON.stringify(datosExtraidos.consultas || []),
    new Date(),
    datosExtraidos.fuente || 'IA'
  ];
  
  if (existeRow > 0) {
    // Actualizar existente
    sheet.getRange(existeRow, 1, 1, nuevaFila.length).setValues([nuevaFila]);
    return { 
      success: true, 
      mensaje: `Histórico ${datosExtraidos.nomenclatura} actualizado`,
      accion: 'actualizado',
      fila: existeRow
    };
  } else {
    // Agregar nuevo
    sheet.appendRow(nuevaFila);
    return { 
      success: true, 
      mensaje: `Histórico ${datosExtraidos.nomenclatura} agregado`,
      accion: 'agregado',
      fila: sheet.getLastRow()
    };
  }
}

/**
 * Crea la hoja HISTORICOS_DETALLE con estructura
 * @private
 */
function crearHojaHistoricosDetalle_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.insertSheet('HISTORICOS_DETALLE');
  
  const headers = [
    'NOMENCLATURA', 'AÑO', 'ENTIDAD', 'OBJETO', 'VALOR_REFERENCIAL',
    'MONTO_ADJUDICADO', 'GANADOR_RUC', 'GANADOR_NOMBRE', 'FECHA_CONVOCATORIA',
    'FECHA_BUENA_PRO', 'NUMERO_CONTRATO', 'TOTAL_POSTORES', 'LINK_SEACE',
    'LINK_OSCE', 'DOCUMENTOS_JSON', 'POSTORES_JSON', 'COMITE_JSON',
    'CONSULTAS_JSON', 'FECHA_EXTRACCION', 'FUENTE'
  ];
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#1F4E79')
    .setFontColor('white');
  sheet.setFrozenRows(1);
  
  // Ajustar anchos
  sheet.setColumnWidth(1, 200); // NOMENCLATURA
  sheet.setColumnWidth(4, 300); // OBJETO
  
  return sheet;
}

/**
 * Obtiene la comparativa de históricos para un proceso
 * @param {string} nomenclaturaActual - Nomenclatura del proceso actual
 * @returns {Object} Comparativa de todos los años
 */
function getComparativaHistoricos(nomenclaturaActual) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('HISTORICOS_DETALLE');
  
  if (!sheet) {
    return { success: false, error: 'Hoja HISTORICOS_DETALLE no encontrada' };
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
      headers.forEach((header, idx) => {
        historico[header] = data[i][idx];
      });
      historicos.push(historico);
    }
  }
  
  // Ordenar por año
  historicos.sort((a, b) => a.AÑO - b.AÑO);
  
  // Calcular estadísticas comparativas
  const comparativa = {
    años: historicos.map(h => h.AÑO),
    montos: historicos.map(h => ({
      año: h.AÑO,
      vr: h.VALOR_REFERENCIAL,
      adjudicado: h.MONTO_ADJUDICADO,
      ahorro: h.VALOR_REFERENCIAL - h.MONTO_ADJUDICADO
    })),
    ganadores: historicos.map(h => ({
      año: h.AÑO,
      nombre: h.GANADOR_NOMBRE,
      ruc: h.GANADOR_RUC
    })),
    tendencia: calcularTendencia_(historicos)
  };
  
  return {
    success: true,
    nomenclaturaBase: basePattern.replace('-XXXX-', '-{AÑO}-'),
    totalAños: historicos.length,
    historicos: historicos,
    comparativa: comparativa
  };
}

/**
 * Calcula tendencia de montos históricos
 * @private
 */
function calcularTendencia_(historicos) {
  if (historicos.length < 2) return 'SIN_DATOS';
  
  const montos = historicos.map(h => h.MONTO_ADJUDICADO || h.VALOR_REFERENCIAL || 0);
  const primerMonto = montos[0];
  const ultimoMonto = montos[montos.length - 1];
  
  if (ultimoMonto > primerMonto * 1.1) return 'CRECIENTE';
  if (ultimoMonto < primerMonto * 0.9) return 'DECRECIENTE';
  return 'ESTABLE';
}
```

---

## 🖥️ PARTE 4: MODIFICACIONES EN FRONTEND (React)

### 4.1 Crear nuevo componente SeguimientoDetalleCompleto.tsx

Ubicación: `src/components/seguimiento/SeguimientoDetalleCompleto.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { 
  FileText, Users, DollarSign, Calendar, Building, 
  ChevronDown, ChevronUp, ExternalLink, Upload, RefreshCw,
  Award, AlertCircle, CheckCircle, Clock
} from 'lucide-react';

interface ProcesoDetalle {
  nomenclatura: string;
  entidad: string;
  objeto: string;
  region: string;
  valorReferencial: number;
  montoAdjudicado: number;
  ganador: {
    ruc: string;
    nombre: string;
    contrato: string;
    fechaContrato: string;
  };
  cronograma: CronogramaEtapa[];
  postores: Postor[];
  comite: MiembroComite[];
  consultas: Consulta[];
  documentos: Documento[];
  historicos: Historico[];
  linkSeace: string;
}

interface CronogramaEtapa {
  etapa: string;
  estado: 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADO' | 'VENCIDO';
  fechaInicio: string;
  fechaFin: string;
  notas: string;
}

interface Historico {
  NOMENCLATURA: string;
  AÑO: number;
  MONTO_ADJUDICADO: number;
  GANADOR_NOMBRE: string;
  LINK_OSCE: string;
}

// ... más interfaces

const SeguimientoDetalleCompleto: React.FC<{ nomenclatura: string }> = ({ nomenclatura }) => {
  const [proceso, setProceso] = useState<ProcesoDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'cronograma' | 'documentos' | 'postores' | 'historicos'>('cronograma');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    info: true,
    cronograma: true,
    historicos: false
  });

  useEffect(() => {
    cargarDetalleCompleto();
  }, [nomenclatura]);

  const cargarDetalleCompleto = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}?action=getSeguimientoDetalleCompleto&nomenclatura=${nomenclatura}`
      );
      const data = await response.json();
      if (data.success) {
        setProceso(data.proceso);
      }
    } catch (error) {
      console.error('Error cargando detalle:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const getEstadoIcon = (estado: string) => {
    switch (estado) {
      case 'COMPLETADO': return <CheckCircle className="text-green-500" size={16} />;
      case 'EN_CURSO': return <Clock className="text-yellow-500" size={16} />;
      case 'VENCIDO': return <AlertCircle className="text-red-500" size={16} />;
      default: return <Clock className="text-gray-400" size={16} />;
    }
  };

  if (loading) {
    return <div className="animate-pulse p-4">Cargando detalle completo...</div>;
  }

  if (!proceso) {
    return <div className="p-4 text-red-500">No se pudo cargar el proceso</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header con información principal */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold">{proceso.nomenclatura}</h2>
            <p className="text-blue-100 text-sm mt-1">{proceso.entidad}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">
              S/ {proceso.montoAdjudicado?.toLocaleString() || proceso.valorReferencial?.toLocaleString()}
            </div>
            <div className="text-blue-200 text-xs">
              {proceso.montoAdjudicado ? 'Monto Adjudicado' : 'Valor Referencial'}
            </div>
          </div>
        </div>
        <p className="mt-2 text-sm text-blue-100">{proceso.objeto}</p>
      </div>

      {/* Tabs de navegación */}
      <div className="border-b flex">
        {['cronograma', 'documentos', 'postores', 'historicos'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-3 text-sm font-medium capitalize transition-colors ${
              activeTab === tab 
                ? 'border-b-2 border-blue-500 text-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'cronograma' && <Calendar className="inline mr-1" size={14} />}
            {tab === 'documentos' && <FileText className="inline mr-1" size={14} />}
            {tab === 'postores' && <Users className="inline mr-1" size={14} />}
            {tab === 'historicos' && <RefreshCw className="inline mr-1" size={14} />}
            {tab}
          </button>
        ))}
      </div>

      {/* Contenido de tabs */}
      <div className="p-4">
        {/* Tab: Cronograma */}
        {activeTab === 'cronograma' && (
          <div className="space-y-2">
            {proceso.cronograma.map((etapa, idx) => (
              <div 
                key={etapa.etapa}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  etapa.estado === 'COMPLETADO' ? 'bg-green-50' :
                  etapa.estado === 'EN_CURSO' ? 'bg-yellow-50' :
                  etapa.estado === 'VENCIDO' ? 'bg-red-50' : 'bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                    {idx + 1}
                  </span>
                  <div>
                    <div className="font-medium text-sm">
                      {etapa.etapa.replace(/_/g, ' ')}
                    </div>
                    <div className="text-xs text-gray-500">
                      {etapa.fechaInicio} - {etapa.fechaFin}
                    </div>
                  </div>
                </div>
                {getEstadoIcon(etapa.estado)}
              </div>
            ))}
          </div>
        )}

        {/* Tab: Documentos */}
        {activeTab === 'documentos' && (
          <div className="space-y-2">
            {proceso.documentos.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No hay documentos registrados</p>
            ) : (
              proceso.documentos.map((doc, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                  <div className="flex items-center gap-3">
                    <FileText className="text-blue-500" size={20} />
                    <div>
                      <div className="font-medium text-sm">{doc.NOMBRE || doc.nombre}</div>
                      <div className="text-xs text-gray-500">{doc.ETAPA || doc.etapa}</div>
                    </div>
                  </div>
                  {doc.URL && (
                    <a href={doc.URL} target="_blank" rel="noopener noreferrer" 
                       className="text-blue-500 hover:text-blue-700">
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab: Postores */}
        {activeTab === 'postores' && (
          <div className="space-y-2">
            {proceso.ganador?.nombre && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
                <div className="flex items-center gap-2 text-green-700 font-bold">
                  <Award size={20} />
                  GANADOR
                </div>
                <div className="mt-2">
                  <div className="font-medium">{proceso.ganador.nombre}</div>
                  <div className="text-sm text-gray-600">RUC: {proceso.ganador.ruc}</div>
                  <div className="text-sm text-gray-600">
                    Contrato: {proceso.ganador.contrato} | {proceso.ganador.fechaContrato}
                  </div>
                </div>
              </div>
            )}
            
            {proceso.postores.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-gray-700">Otros Participantes:</h4>
                {proceso.postores.map((postor, idx) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                    <div className="font-medium text-sm">{postor.nombre || postor.NOMBRE}</div>
                    <div className="text-xs text-gray-500">RUC: {postor.ruc || postor.RUC}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Históricos - COMPARATIVA MULTI-AÑO */}
        {activeTab === 'historicos' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-medium text-gray-700">Comparativa Multi-Año</h4>
              <button 
                className="flex items-center gap-1 px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                onClick={() => {/* Sincronizar con OCDS */}}
              >
                <RefreshCw size={14} />
                Sincronizar OCDS
              </button>
            </div>
            
            {/* Tabla comparativa por años */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-2 text-left">Año</th>
                    <th className="p-2 text-right">Monto</th>
                    <th className="p-2 text-left">Ganador</th>
                    <th className="p-2 text-center">Ver</th>
                  </tr>
                </thead>
                <tbody>
                  {[2021, 2022, 2023, 2024, 2025].map(año => {
                    const hist = proceso.historicos.find(h => h.AÑO === año);
                    return (
                      <tr key={año} className={hist ? 'bg-white' : 'bg-gray-50 text-gray-400'}>
                        <td className="p-2 font-medium">{año}</td>
                        <td className="p-2 text-right">
                          {hist?.MONTO_ADJUDICADO 
                            ? `S/ ${hist.MONTO_ADJUDICADO.toLocaleString()}`
                            : '-'}
                        </td>
                        <td className="p-2 truncate max-w-[200px]">
                          {hist?.GANADOR_NOMBRE || '-'}
                        </td>
                        <td className="p-2 text-center">
                          {hist?.LINK_OSCE ? (
                            <a href={hist.LINK_OSCE} target="_blank" rel="noopener noreferrer"
                               className="text-blue-500 hover:text-blue-700">
                              <ExternalLink size={14} />
                            </a>
                          ) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {/* Botón para agregar histórico con IA */}
            <div className="mt-4 p-4 border-2 border-dashed border-gray-300 rounded-lg text-center">
              <Upload className="mx-auto text-gray-400 mb-2" size={24} />
              <p className="text-sm text-gray-500">
                Arrastra capturas del SEACE o haz clic para agregar histórico
              </p>
              <button className="mt-2 px-4 py-2 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200">
                📸 Extraer datos con IA
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SeguimientoDetalleCompleto;
```

### 4.2 Actualizar src/services/api.ts

Agregar las siguientes funciones:

```typescript
// ============================================
// NUEVAS FUNCIONES PARA FILTRO DE EMPRESAS
// ============================================

/**
 * Obtiene la lista de empresas eléctricas configuradas
 */
export const getEmpresasElectricas = async (): Promise<EmpresaElectrica[]> => {
  const response = await fetch(`${API_URL}?action=getEmpresasElectricas`);
  const data = await response.json();
  return data.success ? data.empresas : [];
};

/**
 * Activa o desactiva una empresa en el filtro
 */
export const toggleEmpresaElectrica = async (item: number, activo: boolean): Promise<boolean> => {
  const response = await fetch(
    `${API_URL}?action=toggleEmpresaElectrica&item=${item}&activo=${activo}`
  );
  const data = await response.json();
  return data.success;
};

/**
 * Agrega una nueva empresa al filtro
 */
export const addEmpresaElectrica = async (
  nombreCompleto: string,
  nombreCorto: string,
  patronBusqueda: string,
  colorHex: string
): Promise<boolean> => {
  const params = new URLSearchParams({
    action: 'addEmpresaElectrica',
    nombreCompleto,
    nombreCorto,
    patronBusqueda,
    colorHex
  });
  const response = await fetch(`${API_URL}?${params.toString()}`);
  const data = await response.json();
  return data.success;
};

// ============================================
// NUEVAS FUNCIONES PARA SEGUIMIENTO MEJORADO
// ============================================

/**
 * Obtiene el detalle completo de un proceso en seguimiento
 */
export const getSeguimientoDetalleCompleto = async (
  nomenclatura: string
): Promise<ProcesoDetalleCompleto | null> => {
  const response = await fetch(
    `${API_URL}?action=getSeguimientoDetalleCompleto&nomenclatura=${encodeURIComponent(nomenclatura)}`
  );
  const data = await response.json();
  return data.success ? data.proceso : null;
};

/**
 * Obtiene la comparativa de históricos multi-año
 */
export const getComparativaHistoricos = async (
  nomenclatura: string
): Promise<ComparativaHistoricos | null> => {
  const response = await fetch(
    `${API_URL}?action=getComparativaHistoricos&nomenclatura=${encodeURIComponent(nomenclatura)}`
  );
  const data = await response.json();
  return data.success ? data : null;
};

/**
 * Guarda datos de histórico extraídos por IA
 */
export const guardarHistoricoExtraidoIA = async (
  datosExtraidos: DatosHistoricoExtraido
): Promise<{ success: boolean; mensaje: string }> => {
  const response = await fetch(`${API_URL}?action=guardarHistoricoExtraidoIA`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datosExtraidos)
  });
  return await response.json();
};

// ============================================
// TIPOS TYPESCRIPT
// ============================================

export interface EmpresaElectrica {
  item: number;
  nombreCompleto: string;
  nombreCorto: string;
  patronBusqueda: string;
  colorHex: string;
  activo: boolean;
}

export interface ProcesoDetalleCompleto {
  nomenclatura: string;
  entidad: string;
  objeto: string;
  region: string;
  valorReferencial: number;
  montoAdjudicado: number;
  ganador: {
    ruc: string;
    nombre: string;
    contrato: string;
    fechaContrato: string;
  };
  cronograma: CronogramaEtapa[];
  postores: Postor[];
  comite: MiembroComite[];
  consultas: Consulta[];
  documentos: Documento[];
  historicos: Historico[];
  linkSeace: string;
}

export interface CronogramaEtapa {
  etapa: string;
  estado: 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADO' | 'VENCIDO' | 'NO_APLICA';
  fechaInicio: string;
  fechaFin: string;
  notas: string;
}

export interface Historico {
  NOMENCLATURA: string;
  AÑO: number;
  VALOR_REFERENCIAL: number;
  MONTO_ADJUDICADO: number;
  GANADOR_RUC: string;
  GANADOR_NOMBRE: string;
  FECHA_CONVOCATORIA: string;
  FECHA_BUENA_PRO: string;
  LINK_OSCE: string;
}

export interface ComparativaHistoricos {
  nomenclaturaBase: string;
  totalAños: number;
  historicos: Historico[];
  comparativa: {
    años: number[];
    montos: { año: number; vr: number; adjudicado: number; ahorro: number }[];
    ganadores: { año: number; nombre: string; ruc: string }[];
    tendencia: 'CRECIENTE' | 'DECRECIENTE' | 'ESTABLE' | 'SIN_DATOS';
  };
}

export interface DatosHistoricoExtraido {
  nomenclatura: string;
  entidad?: string;
  objeto?: string;
  descripcion?: string;
  valor_referencial?: number;
  monto_adjudicado?: number;
  ganador?: { ruc: string; nombre: string };
  ganador_ruc?: string;
  ganador_nombre?: string;
  cronograma?: { etapa: string; fecha_inicio: string; fecha_fin: string }[];
  fecha_convocatoria?: string;
  fecha_buena_pro?: string;
  numero_contrato?: string;
  postores?: { ruc: string; nombre: string; monto?: number }[];
  total_postores?: number;
  documentos?: { nombre: string; tipo: string; fecha: string; url?: string }[];
  comite?: { nombre: string; cargo: string }[];
  consultas?: { ruc: string; empresa: string; fecha: string; tipo: string }[];
  link_seace?: string;
  tender_id?: string;
  fuente?: 'MANUAL' | 'IA' | 'OCDS';
}
```

---

## 🤖 PARTE 5: PROMPT PARA EXTRACCIÓN CON IA

### 5.1 Prompt para Claude/GPT - Extractor de Capturas SEACE

Guardar este prompt en un archivo o usar directamente:

```markdown
# EXTRACTOR DE DATOS SEACE - PROMPT PARA IA

Eres un extractor especializado de datos del portal SEACE (Sistema Electrónico de Contrataciones del Estado de Perú). Analiza las capturas de pantalla proporcionadas y extrae TODA la información visible en formato JSON estructurado.

## INSTRUCCIONES:

1. Analiza cada captura cuidadosamente
2. Identifica el tipo de vista (Ficha Principal, Documentos, Postores, Contratos, etc.)
3. Extrae TODOS los datos visibles
4. Devuelve un JSON único consolidado con toda la información

## ESTRUCTURA JSON REQUERIDA:

```json
{
  "nomenclatura": "CP-SM-36-2024-ELSE-1",
  "año": 2024,
  "entidad": {
    "nombre": "EMPRESA REGIONAL DE SERVICIO PÚBLICO DE ELECTRICIDAD ELECTRO SUR ESTE S.A.A.",
    "ruc": "20116544289",
    "direccion": "MARISCAL SUCRE N° 400...",
    "telefono": "953759805"
  },
  "proceso": {
    "tipo": "Servicio",
    "objeto": "GESTIÓN DE PÉRDIDAS CUSCO, MADRE DE DIOS Y APURÍMAC",
    "valor_referencial": 1333022.13,
    "moneda": "Soles",
    "normativa": "Ley N° 30225",
    "version_seace": 3
  },
  "cronograma": [
    {
      "etapa": "Convocatoria",
      "fecha_inicio": "08/02/2024",
      "fecha_fin": "08/02/2024"
    },
    {
      "etapa": "Registro de participantes(Electrónica)",
      "fecha_inicio": "09/02/2024 00:01",
      "fecha_fin": "14/03/2024 23:59"
    },
    {
      "etapa": "Formulación de consultas y observaciones(Electrónica)",
      "fecha_inicio": "09/02/2024 00:01",
      "fecha_fin": "22/02/2024 23:59"
    },
    {
      "etapa": "Absolución de consultas y observaciones(Electrónica)",
      "fecha_inicio": "23/02/2024",
      "fecha_fin": "23/02/2024"
    },
    {
      "etapa": "Integración de las Bases",
      "fecha_inicio": "23/02/2024",
      "fecha_fin": "23/02/2024"
    },
    {
      "etapa": "Presentación de ofertas(Electrónica)",
      "fecha_inicio": "15/03/2024 00:01",
      "fecha_fin": "15/03/2024 23:59"
    },
    {
      "etapa": "Evaluación y calificación de ofertas",
      "fecha_inicio": "18/03/2024",
      "fecha_fin": "19/03/2024"
    },
    {
      "etapa": "Otorgamiento de la Buena Pro",
      "fecha_inicio": "02/04/2024 15:00",
      "fecha_fin": "02/04/2024"
    }
  ],
  "documentos": [
    {
      "nro": 1,
      "etapa": "Convocatoria",
      "documento": "Bases Administrativas",
      "tipo": "DOC",
      "tamaño": "3463 KB",
      "fecha": "08/02/2024 12:19"
    },
    {
      "nro": 2,
      "etapa": "Convocatoria",
      "documento": "Resumen ejecutivo",
      "tipo": "PDF",
      "tamaño": "135 KB",
      "fecha": "08/02/2024 12:19"
    }
  ],
  "postores": [
    {
      "ruc": "20608415964",
      "nombre": "CONSORCIO ILLAPAY",
      "fecha_presentacion": "15/03/2024",
      "hora_presentacion": "23:13:10",
      "monto_ofertado": 898627.50,
      "es_ganador": true
    },
    {
      "ruc": "20601442664",
      "nombre": "LJE INGENIERIA Y CONSTRUCCION E.I.R.L.",
      "fecha_presentacion": null,
      "monto_ofertado": null,
      "es_ganador": false
    }
  ],
  "contrato": {
    "numero": "039-2024",
    "contratista_ruc": "20608415964",
    "contratista_nombre": "CONSORCIO ILLAPAY",
    "monto": 898627.50,
    "moneda": "Soles"
  },
  "comite_seleccion": {
    "tipo": "Comité de Selección",
    "documento": "F-027-2024",
    "fecha_emision": "05/02/2024",
    "integrantes": [
      { "nro": 4, "nombre": "ALFREDO ABARCA ANCORI", "cargo": "Titular Presidente" },
      { "nro": 5, "nombre": "WASHINGTON AYMA COILA", "cargo": "Titular Miembro 1" },
      { "nro": 6, "nombre": "RUTH JIBAJA SOTOMAYOR", "cargo": "Titular Miembro 2" },
      { "nro": 1, "nombre": "JOSE YABAR SALAS", "cargo": "Suplente Presidente" },
      { "nro": 2, "nombre": "WILSON BRAVO GONZALES", "cargo": "Suplente Miembro 1" },
      { "nro": 3, "nombre": "FERNANDO MERCADO ZAMALLOA", "cargo": "Suplente Miembro 2" }
    ]
  },
  "consultas_observaciones": [
    {
      "ruc": "20602162274",
      "empresa": "P & C INGENIEROS CONTRATISTAS Y CONSULTORES SOCIEDAD ANONIMA CERRADA",
      "nro_formulacion": 1,
      "tipo": "Consulta",
      "seccion": "Específico",
      "numeral": "3.2",
      "literal": "c",
      "pagina": 60,
      "fecha_envio": "2024-02-15 17:03:27.0",
      "fecha_registro": "2024-02-15 17:02:14.0",
      "estado": "Enviado"
    }
  ],
  "acciones_procedimiento": [
    {
      "nro": 1,
      "accion": "Publicación de convocatoria",
      "fecha": "2024-02-08 12:19:00.0",
      "motivo": "Publicacion de Convocatoria"
    },
    {
      "nro": 2,
      "accion": "Publicación de Presupuesto",
      "fecha": "2024-02-08 12:19:00.0",
      "motivo": "Registro de Presupuesto"
    },
    {
      "nro": 3,
      "accion": "Integracion de bases",
      "fecha": "2024-02-23 11:33:16.0",
      "motivo": "Integración de Bases"
    },
    {
      "nro": 4,
      "accion": "Postergación",
      "fecha": "2024-03-20 08:56:33.0",
      "motivo": "Según documento CS-CP-036-2024-ELSE 003..."
    }
  ],
  "acuerdos_comerciales": [
    "Acuerdo de Promoción Comercial Perú-Estados Unidos",
    "Acuerdo de Alianza del Pacífico Perú-México",
    "Acuerdo de Asociación Económica Perú-Japón",
    "Acuerdo de Libre Comercio Perú-Panamá",
    "Acuerdo de Libre Comercio Perú - Honduras",
    "Tratado Integral y Progresista de Asociación Transpacífico-CPTPP",
    "Acuerdo de Alianza del Pacífico Perú -Colombia y Chile"
  ],
  "items": [
    {
      "nro": 1,
      "descripcion": "GESTIÓN DE PÉRDIDAS CUSCO, MADRE DE DIOS Y APURÍMAC",
      "codigo_cubso": "721515020036277",
      "cantidad": 1,
      "unidad": "Servicio",
      "valor_estimado": 1333022.13,
      "reserva_mype": false,
      "paquete": false,
      "estado": "Contratado"
    }
  ]
}
```

## NOTAS IMPORTANTES:

1. **Fechas:** Mantener el formato exacto como aparece (DD/MM/YYYY o YYYY-MM-DD HH:MM:SS)
2. **Montos:** Convertir a número sin separadores de miles
3. **Datos faltantes:** Usar `null` si no está visible en las capturas
4. **RUC:** Extraer exactamente como aparece (11 dígitos)
5. **Nomenclatura:** Formato estándar tipo "XX-XXX-##-####-XXXX-#"

## VALIDACIONES:

- El año extraído de la nomenclatura debe coincidir con las fechas del cronograma
- El monto del contrato debe ser menor o igual al valor referencial
- Si hay ganador, debe estar en la lista de postores

Analiza las capturas y devuelve el JSON estructurado.
```

---

## 📋 PARTE 6: RESUMEN DE ARCHIVOS A MODIFICAR

### 6.1 Google Apps Script (GOOGLE_APPS_SCRIPT.js)

| Función | Acción | Descripción |
|---------|--------|-------------|
| `getEmpresasElectricas()` | NUEVA | Obtiene lista de empresas eléctricas |
| `toggleEmpresaElectrica()` | NUEVA | Activa/desactiva empresa en filtro |
| `addEmpresaElectrica()` | NUEVA | Agrega nueva empresa al filtro |
| `filtrarPorEmpresasElectricas()` | NUEVA | Filtra procesos con colores |
| `crearHojaEmpresasElectricas_()` | NUEVA | Crea hoja con datos default |
| `getSeguimientoDetalleCompleto()` | NUEVA | Detalle completo con históricos |
| `guardarHistoricoExtraidoIA()` | NUEVA | Guarda datos extraídos por IA |
| `getComparativaHistoricos()` | NUEVA | Comparativa multi-año |
| `crearHojaHistoricosDetalle_()` | NUEVA | Crea hoja HISTORICOS_DETALLE |
| `doGet()` | MODIFICAR | Agregar nuevas acciones |

### 6.2 Frontend React

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `src/components/seguimiento/SeguimientoDetalleCompleto.tsx` | NUEVO | Componente de detalle completo |
| `src/components/empresas/FiltroEmpresas.tsx` | NUEVO | UI para gestionar filtro empresas |
| `src/services/api.ts` | MODIFICAR | Agregar nuevas funciones API |
| `src/types/index.ts` | MODIFICAR | Agregar nuevos tipos TypeScript |
| `src/App.tsx` | MODIFICAR | Integrar nuevo componente en vista Seguimiento |

### 6.3 Google Sheets (Nuevas Hojas)

| Hoja | Columnas | Descripción |
|------|----------|-------------|
| `FILTROS_EMPRESAS_ELECTRICAS` | 6 cols | Configuración de empresas |
| `HISTORICOS_DETALLE` | 20 cols | Datos completos por año |

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### Fase 1: Backend (Google Apps Script)
- [ ] Crear hoja FILTROS_EMPRESAS_ELECTRICAS con 25 empresas
- [ ] Implementar getEmpresasElectricas()
- [ ] Implementar toggleEmpresaElectrica()
- [ ] Implementar addEmpresaElectrica()
- [ ] Implementar filtrarPorEmpresasElectricas()
- [ ] Crear hoja HISTORICOS_DETALLE
- [ ] Implementar getSeguimientoDetalleCompleto()
- [ ] Implementar guardarHistoricoExtraidoIA()
- [ ] Implementar getComparativaHistoricos()
- [ ] Actualizar doGet() con nuevas acciones

### Fase 2: Frontend (React)
- [ ] Crear SeguimientoDetalleCompleto.tsx
- [ ] Crear FiltroEmpresas.tsx
- [ ] Actualizar api.ts con nuevas funciones
- [ ] Actualizar types/index.ts
- [ ] Integrar en App.tsx vista Seguimiento
- [ ] Agregar estilos Tailwind necesarios

### Fase 3: Testing
- [ ] Probar filtro de empresas
- [ ] Probar vista de seguimiento completa
- [ ] Probar extracción con IA (manual)
- [ ] Probar comparativa de históricos
- [ ] Verificar colores por empresa

### Fase 4: Documentación
- [ ] Actualizar README.md
- [ ] Documentar nuevas funciones API
- [ ] Crear guía de uso del prompt IA

---

## 📞 NOTAS PARA CLAUDE CODE

1. **Prioridad:** Implementar primero el backend (Apps Script) y luego el frontend
2. **Testing:** Probar cada función en el editor de Apps Script antes de integrar
3. **Colores:** Los colores HEX están en tonos pastel para no cansar la vista
4. **JSON:** Los campos JSON (DOCUMENTOS_JSON, etc.) permiten almacenar datos estructurados sin crear más columnas
5. **Compatibilidad:** Mantener las funciones existentes, solo agregar nuevas
6. **Errores:** Manejar casos donde las hojas no existen (crearlas automáticamente)

---

*Documento generado el 31/12/2025 para SEACE Intelligence v2.0*