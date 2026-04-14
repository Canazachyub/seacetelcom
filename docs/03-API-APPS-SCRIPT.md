# API Reference - SEACE Google Apps Script Backend

Este documento describe todas las acciones expuestas por el backend Google Apps Script de SEACE Intelligence (v3.0), implementado en `GOOGLE_APPS_SCRIPT.js` en la raíz del proyecto. El despliegue público actual se encuentra en:

```
https://script.google.com/macros/s/AKfycbxw1LhTtAzr75TmjPjfhxGG1x3F66YWa5qEtkrFVc-aS-J39bZe9YxjdfQfQr89ndiu/exec
```

## 1. Arquitectura general

- El Web App expone dos entry points: `doGet(e)` (`GOOGLE_APPS_SCRIPT.js:590`) y `doPost(e)` (`GOOGLE_APPS_SCRIPT.js:615`).
- Ambos delegan en el `Router.handle(action, params, method)` (`GOOGLE_APPS_SCRIPT.js:657`), que selecciona un handler desde el objeto `routes` (`GOOGLE_APPS_SCRIPT.js:676`).
- Cada ruta define un `method` entre `'GET'`, `'POST'` o `'ANY'`. Si el método no coincide, el router lanza `'Método no permitido para esta acción'`.
- Si el request trae un parámetro `data` con JSON serializado (modo usado por el helper `fetchAPI` del frontend para payloads complejos), el router lo parsea y lo fusiona con `params` antes de llamar al handler (`GOOGLE_APPS_SCRIPT.js:660-673`).
- El cliente frontend (`src/services/api.ts:45-121`) **siempre** usa HTTP GET hacia Apps Script para evitar problemas de CORS. Los datos que lógicamente serían POST se envían como query params o dentro de `data=<json>`. Por eso la mayoría de handlers de escritura están registrados como `method: 'ANY'`.
- Respuestas estándar de éxito (`Utils.successResponse`, `GOOGLE_APPS_SCRIPT.js:298-305`):

```json
{
  "success": true,
  "mensaje": "...",
  "timestamp": "ISO-8601",
  "...campos específicos del handler..."
}
```

- Respuestas estándar de error (`Utils.errorResponse`, `GOOGLE_APPS_SCRIPT.js:309-317`):

```json
{
  "success": false,
  "error": "mensaje",
  "detalles": null,
  "timestamp": "ISO-8601"
}
```

- **Importante**: varios handlers de lectura (por ejemplo `Seguimiento.getAll`, `Cronograma.get`, `Documentos.get`, `Filtros.getEntidades`, `Filtros.getPalabras`, `Estadisticas.getRegiones`) devuelven **arreglos u objetos crudos** en lugar del envoltorio `{success, ...}`. Ver cada sección para el detalle.

## 2. Tabla de contenidos (acciones en orden alfabético)

| # | Acción | Método | Handler | Archivo:línea |
|---|--------|--------|---------|---------------|
| 1 | `actualizarIndiceOCDS` | ANY | `OCDS_INDEX.actualizar` | `GOOGLE_APPS_SCRIPT.js:741` |
| 2 | `addDocumento` | ANY | `Documentos.add` | `GOOGLE_APPS_SCRIPT.js:711` |
| 3 | `addEmpresaElectrica` | ANY | `EmpresasElectricas.add` | `GOOGLE_APPS_SCRIPT.js:746` |
| 4 | `addFiltroEntidad` | ANY | `Filtros.addEntidad` | `GOOGLE_APPS_SCRIPT.js:720` |
| 5 | `addFiltroPalabra` | ANY | `Filtros.addPalabra` | `GOOGLE_APPS_SCRIPT.js:721` |
| 6 | `addPostor` | ANY | `Postores.add` | `GOOGLE_APPS_SCRIPT.js:716` |
| 7 | `addSeguimiento` | ANY | `Seguimiento.add` | `GOOGLE_APPS_SCRIPT.js:707` |
| 8 | `crearCarpetaDrive` | ANY | `Drive.crearCarpetaProceso` | `GOOGLE_APPS_SCRIPT.js:724` |
| 9 | `crearCarpetaGrupoHistorico` | ANY | `Drive.crearCarpetaGrupoHistorico` | `GOOGLE_APPS_SCRIPT.js:737` |
| 10 | `crearGrupoHistorico` | ANY | `GruposHistoricos.crear` | `GOOGLE_APPS_SCRIPT.js:732` |
| 11 | `deleteGrupoHistorico` | ANY | `GruposHistoricos.delete` | `GOOGLE_APPS_SCRIPT.js:734` |
| 12 | `deletePostor` | ANY | `Postores.delete` | `GOOGLE_APPS_SCRIPT.js:718` |
| 13 | `deleteSeguimiento` | ANY | `Seguimiento.delete` | `GOOGLE_APPS_SCRIPT.js:709` |
| 14 | `getByOcid` | GET | `OCDS_API.getByOcid` | `GOOGLE_APPS_SCRIPT.js:698` |
| 15 | `getByTenderId` | GET | `OCDS_API.getByTenderId` | `GOOGLE_APPS_SCRIPT.js:697` |
| 16 | `getComparativaHistoricos` | GET | `HistoricosDetalle.getComparativa` | `GOOGLE_APPS_SCRIPT.js:753` |
| 17 | `getCronograma` | GET | `Cronograma.get` | `GOOGLE_APPS_SCRIPT.js:680` |
| 18 | `getCronogramaOCDS` | GET | `OCDS_API.getCronograma` | `GOOGLE_APPS_SCRIPT.js:701` |
| 19 | `getDocumentos` | GET | `Documentos.get` | `GOOGLE_APPS_SCRIPT.js:683` |
| 20 | `getDocumentosOCDS` | GET | `OCDS_API.getDocumentos` | `GOOGLE_APPS_SCRIPT.js:700` |
| 21 | `getEmpresasElectricas` | GET | `EmpresasElectricas.getAll` | `GOOGLE_APPS_SCRIPT.js:744` |
| 22 | `getEntidadesUnicas` | GET | `Estadisticas.getEntidadesUnicas` | `GOOGLE_APPS_SCRIPT.js:688` |
| 23 | `getEstadisticas` | GET | `Estadisticas.get` | `GOOGLE_APPS_SCRIPT.js:686` |
| 24 | `getFiltrosEntidades` | GET | `Filtros.getEntidades` | `GOOGLE_APPS_SCRIPT.js:684` |
| 25 | `getFiltrosPalabras` | GET | `Filtros.getPalabras` | `GOOGLE_APPS_SCRIPT.js:685` |
| 26 | `getGrupoByNomenclatura` | GET | `GruposHistoricos.getByNomenclatura` | `GOOGLE_APPS_SCRIPT.js:693` |
| 27 | `getGrupoHistorico` | GET | `GruposHistoricos.get` | `GOOGLE_APPS_SCRIPT.js:692` |
| 28 | `getGruposHistoricos` | GET | `GruposHistoricos.getAll` | `GOOGLE_APPS_SCRIPT.js:691` |
| 29 | `getPostores` | GET | `Postores.get` | `GOOGLE_APPS_SCRIPT.js:715` |
| 30 | `getPostoresOCDS` | GET | `OCDS_API.getPostores` | `GOOGLE_APPS_SCRIPT.js:699` |
| 31 | `getProcesoByNomenclatura` | GET | `Procesos.getByNomenclatura` | `GOOGLE_APPS_SCRIPT.js:679` |
| 32 | `getProcesoOCDS` | GET | `OCDS_API.getProceso` | `GOOGLE_APPS_SCRIPT.js:696` |
| 33 | `getProcesos` | GET | `Procesos.getAll` | `GOOGLE_APPS_SCRIPT.js:678` |
| 34 | `getRegiones` | GET | `Estadisticas.getRegiones` | `GOOGLE_APPS_SCRIPT.js:687` |
| 35 | `getSeguimiento` | GET | `Seguimiento.getAll` | `GOOGLE_APPS_SCRIPT.js:681` |
| 36 | `getSeguimientoDetalle` | GET | `Seguimiento.getDetalle` | `GOOGLE_APPS_SCRIPT.js:682` |
| 37 | `getSeguimientoDetalleCompleto` | GET | `SeguimientoV2.getDetalleCompleto` | `GOOGLE_APPS_SCRIPT.js:749` |
| 38 | `guardarHistoricoExtraidoIA` | ANY | `HistoricosDetalle.guardarExtraidoIA` | `GOOGLE_APPS_SCRIPT.js:752` |
| 39 | `listarArchivosDrive` | GET | `Drive.listarArchivos` | `GOOGLE_APPS_SCRIPT.js:725` |
| 40 | `listarProcesosOCDS` | GET | `OCDS_API.listarProcesos` | `GOOGLE_APPS_SCRIPT.js:702` |
| 41 | `migrarCarpetaExistente` | ANY | `Drive.migrarCarpetaExistente` | `GOOGLE_APPS_SCRIPT.js:738` |
| 42 | `procesarImport` | ANY | `Import.procesar` | `GOOGLE_APPS_SCRIPT.js:723` |
| 43 | `sincronizarGrupoHistorico` | ANY | `OCDS_API.sincronizarGrupoHistorico` | `GOOGLE_APPS_SCRIPT.js:704` |
| 44 | `sincronizarHistoricoIndividual` | ANY | `OCDS_API.sincronizarHistoricoIndividual` | `GOOGLE_APPS_SCRIPT.js:703` |
| 45 | `toggleEmpresaElectrica` | ANY | `EmpresasElectricas.toggle` | `GOOGLE_APPS_SCRIPT.js:745` |
| 46 | `toggleFiltro` | ANY | `Filtros.toggle` | `GOOGLE_APPS_SCRIPT.js:722` |
| 47 | `updateDocumentoUrl` | ANY | `Documentos.updateUrl` | `GOOGLE_APPS_SCRIPT.js:712` |
| 48 | `updateEtapaSeguimiento` | ANY | `Seguimiento.updateEtapa` | `GOOGLE_APPS_SCRIPT.js:710` |
| 49 | `updateGrupoHistorico` | ANY | `GruposHistoricos.update` | `GOOGLE_APPS_SCRIPT.js:733` |
| 50 | `updatePostor` | ANY | `Postores.update` | `GOOGLE_APPS_SCRIPT.js:717` |
| 51 | `updateSeguimiento` | ANY | `Seguimiento.update` | `GOOGLE_APPS_SCRIPT.js:708` |
| 52 | `uploadAndRegisterDocument` | ANY | `Documentos.uploadAndRegister` | `GOOGLE_APPS_SCRIPT.js:729` |
| 53 | `uploadFileToDrive` | ANY | `Drive.uploadFileToDrive` | `GOOGLE_APPS_SCRIPT.js:728` |

**Total: 53 acciones registradas en el router.**

Acciones llamadas por el frontend que **NO** existen en el backend (confirmado vía curl, ver seccion final):

- `getDatosSeace` (llamada desde `src/services/api.ts:812`)
- `getEstadoScraping` (llamada desde `src/services/api.ts:825`)
- `getEnlacesRapidos` (llamada desde `src/services/api.ts:1511`)

Handlers existen en el backend que **no** tienen caller frontend conocido: ninguno crítico (`getProcesoByNomenclatura` y `updateDocumentoUrl` son utilizados internamente por otros handlers, no expuestos directamente al frontend).

---

## 3. Especificación detallada por acción

### 3.1 Módulo: PROCESOS

#### `getProcesos`
- **Método**: GET
- **Handler**: `Procesos.getAll` (`GOOGLE_APPS_SCRIPT.js:777`)
- **Parámetros** (todos opcionales):

| Nombre | Tipo | Descripción |
|---|---|---|
| `region` | string | Coincidencia exacta con `REGION` de `BD_PROCESOS`. |
| `entidad` | string | Substring case-insensitive sobre `ENTIDAD`. |
| `objeto` | string | Coincidencia exacta con `OBJETO`. |
| `busqueda` | string | Substring global sobre `DESCRIPCION`, `ENTIDAD` o `NOMENCLATURA`. |
| `palabrasClave` | string | Lista separada por comas; coincide si alguna palabra aparece en `DESCRIPCION`. |
| `fechaDesde` | string (ISO) | Filtra `FECHA_PUB >= fechaDesde`. |
| `fechaHasta` | string (ISO) | Filtra `FECHA_PUB <= fechaHasta`. |
| `valorMin` | number | Filtra `VALOR >= valorMin`. |
| `valorMax` | number | Filtra `VALOR <= valorMax`. |

- **Respuesta exitosa**:

```json
{
  "success": true,
  "total": 2840,
  "procesos": [
    {
      "ID": 2840,
      "NOMENCLATURA": "AS-SM-2-2022-EMSEU SAC-1",
      "ENTIDAD": "EMPRESA MUNICIPAL DE SERVICIOS ELECTRICOS UTCUBAMBA - BAGUA GRANDE",
      "REGION": "AMAZONAS",
      "OBJETO": "Servicio",
      "DESCRIPCION": "SERVICIO DE CONTRASTE DE MEDIDORES...",
      "VALOR": 81315.87,
      "MONEDA": "PEN",
      "FECHA_PUB": "2022-04-20T13:44:00.000Z",
      "VERSION": 3,
      "REINICIADO": "",
      "URL": "",
      "EMPRESA_CORTA": "EMSEU",
      "ESTADO_FECHA": "ANTIGUO",
      "TIPO_SERVICIO": "ELECTRIFICACIÓN"
    }
  ]
}
```

- **Side effects**: solo lectura sobre la hoja `BD_PROCESOS`.
- **Caller**: `getProcesos()` en `src/services/api.ts:142`.
- **Quirks**:
  - No existe paginación: siempre devuelve **todos** los procesos filtrados. El parámetro `limit` no existe en el backend aunque se pase. Esto hace respuestas grandes (miles de procesos).
  - El filtro de fecha hace un `new Date(p.FECHA_PUB)` por registro, frágil cuando la hoja mezcla strings con objetos Date.

#### `getProcesoByNomenclatura`
- **Método**: GET
- **Handler**: `Procesos.getByNomenclatura` (`GOOGLE_APPS_SCRIPT.js:798`)
- **Parámetros**: `nomenclatura` (string, requerido).
- **Respuesta**: `{success, mensaje, proceso: {...}}` o `{success: false, error}`.
- **Side effects**: ninguno (lectura).
- **Caller**: ningún método exportado en `api.ts` lo invoca directamente (es utilizado internamente por `Seguimiento.add`). Ver sección 4.
- **Quirks**: internamente llama a `Procesos.getAll({busqueda: nomenclatura})` y luego hace `.find`, por lo que es O(n) sobre toda la base.

---

### 3.2 Módulo: SEGUIMIENTO

#### `getSeguimiento`
- **Método**: GET
- **Handler**: `Seguimiento.getAll` (`GOOGLE_APPS_SCRIPT.js:1071`)
- **Parámetros**: ninguno.
- **Respuesta**: **arreglo crudo** (no envuelto en `success`), cada item es un objeto con todas las columnas de la hoja `SEGUIMIENTO`. Las 8 etapas del proceso SEACE (`CONVOCATORIA`, `REGISTRO_PARTICIPANTES`, ..., `BUENA_PRO`) se transforman desde columnas planas a objetos anidados con `{ESTADO, NOTAS, AÑOS: {2021..2025: {INICIO, FIN, LINK}}}`. Ejemplo abreviado:

```json
[
  {
    "NOMENCLATURA": "LP-SM-1-2025-ELECTROCENTRO-1",
    "ENTIDAD": "ELECTROCENTRO S.A.",
    "ESTADO_INTERES": "PREPARANDO",
    "CONVOCATORIA": {
      "ESTADO": "COMPLETADO",
      "NOTAS": "",
      "AÑOS": {
        "2024": {"INICIO": "2024-01-15", "FIN": "2024-01-20", "LINK": "..."},
        "2025": {"INICIO": "2025-01-10", "FIN": null, "LINK": ""}
      }
    }
  }
]
```

- **Side effects**: ninguno.
- **Caller**: `getSeguimiento()` en `src/services/api.ts:150`.
- **Quirks**: el helper **no** envuelve la respuesta en `successResponse`. Filtra registros que no tengan `NOMENCLATURA`.

#### `getSeguimientoDetalle`
- **Método**: GET
- **Handler**: `Seguimiento.getDetalle` (`GOOGLE_APPS_SCRIPT.js:1131`)
- **Parámetros**: `nomenclatura` (requerido).
- **Respuesta**: `{success, seguimiento: {..., CRONOGRAMA: [...], DOCUMENTOS: [...]}}`. Internamente llama a `Cronograma.get` y `Documentos.get` para anidarlos.
- **Side effects**: ninguno.
- **Caller**: `getSeguimientoDetalle()` en `src/services/api.ts:256`.

#### `addSeguimiento`
- **Método**: ANY (en la práctica GET con query params vía `fetchAPI`).
- **Handler**: `Seguimiento.add` (`GOOGLE_APPS_SCRIPT.js:1153`)
- **Parámetros**:

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `nomenclatura` | string | Sí | Clave primaria. |
| `entidad` | string | No | Fallback si no se encuentra en `BD_PROCESOS`. |
| `estado` | string | No | Default `PENDIENTE`. |
| `prioridad` | string | No | `ALTA` / `MEDIA` / `BAJA`. Default `MEDIA`. |
| `responsable` | string | No | |
| `notas` | string | No | |
| `objeto`, `valor`, `region` | varios | No | Fallbacks si `BD_PROCESOS` no tiene el registro. |

- **Respuesta**: `{success: true, carpetaUrl, driveError?}` o `{success: false, error, detalles: {exists: true}}` si ya existía.
- **Side effects**:
  1. Escribe nueva fila en la hoja `SEGUIMIENTO` con estados iniciales de las 8 etapas en `PENDIENTE`.
  2. Crea carpeta en Google Drive (via `Drive.crearCarpetaProceso`, usando el folder root `1L1mzM6mTtALDN5waUPIbEhj2zEq7RBZH`). Si falla, lo reporta en `driveError` pero igual persiste el seguimiento.
  3. Hace lookup en `BD_PROCESOS` para rellenar metadata.
- **Caller**: `addSeguimiento()` en `src/services/api.ts:175` y `addSeguimientoCompleto` en `src/services/api.ts:259`.

#### `updateSeguimiento`
- **Método**: ANY
- **Handler**: `Seguimiento.update` (`GOOGLE_APPS_SCRIPT.js:1229`)
- **Parámetros**: `nomenclatura` (req.), más opcionales: `estado`, `prioridad`, `notas`, `responsable`.
- **Respuesta**: `{success, mensaje}`.
- **Side effects**: actualiza celdas individuales en la hoja `SEGUIMIENTO`.
- **Caller**: `updateSeguimiento()` en `src/services/api.ts:189`.
- **Quirks**: únicamente actualiza las 4 columnas listadas; otros campos como `VALOR`, `ENTIDAD` no son editables por esta vía.

#### `deleteSeguimiento`
- **Método**: ANY
- **Handler**: `Seguimiento.delete` (`GOOGLE_APPS_SCRIPT.js:1269`)
- **Parámetros**: `nomenclatura` (req.).
- **Respuesta**: `{success, nomenclatura, mensaje}` o error.
- **Side effects**: elimina la fila completa de `SEGUIMIENTO`. **No** borra la carpeta de Drive asociada.
- **Caller**: `deleteSeguimiento()` en `src/services/api.ts:203`.

#### `updateEtapaSeguimiento`
- **Método**: ANY
- **Handler**: `Seguimiento.updateEtapa` (`GOOGLE_APPS_SCRIPT.js:1292`)
- **Parámetros**:

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `nomenclatura` | string | Sí | |
| `etapa` | string | Sí | Debe estar en `ETAPAS_SEACE` (`CONVOCATORIA`, `REGISTRO_PARTICIPANTES`, `CONSULTAS_OBSERVACIONES`, `ABSOLUCION_CONSULTAS`, `INTEGRACION_BASES`, `PRESENTACION_PROPUESTAS`, `CALIFICACION_EVALUACION`, `BUENA_PRO`). |
| `estado` | string | No | |
| `notas` | string | No | |
| `año` | number | No | Si se pasa, habilita actualización de fechas/link históricos. |
| `fechaInicio` / `fechaFin` / `link` | varios | No | Requieren `año`. |

- **Respuesta**: `{success, mensaje}` o error si no se encontró o la etapa es inválida.
- **Side effects**: actualiza columnas `{ETAPA}_ESTADO`, `{ETAPA}_NOTAS` y `{ETAPA}_{AÑO}_INICIO|FIN|LINK` en `SEGUIMIENTO`. Además llama a `Cronograma.updateEtapa` que escribe/actualiza la hoja `CRONOGRAMA` (compatibilidad legacy).
- **Caller**: `updateEtapaSeguimiento()` y `actualizarCronogramaDesdeOCDS()` en `src/services/api.ts:454, 381`.

---

### 3.3 Módulo: CRONOGRAMA

#### `getCronograma`
- **Método**: GET
- **Handler**: `Cronograma.get` (`GOOGLE_APPS_SCRIPT.js:1354`)
- **Parámetros**: `nomenclatura` (req.).
- **Respuesta**: **arreglo crudo** de filas de la hoja `CRONOGRAMA` que coincidan con la nomenclatura. Cada elemento lleva añadidos dos campos calculados:
  - `ESTADO_CALC`: `VENCIDO` / `EN_CURSO` / `PENDIENTE` según comparar fechas con `new Date()`.
  - `DIAS_RESTANTES`: int, ceiling de `(FECHA_FIN - hoy)` en días.
- **Side effects**: lectura.
- **Caller**: `getCronograma()` en `src/services/api.ts:146`.

---

### 3.4 Módulo: DOCUMENTOS

#### `getDocumentos`
- **Método**: GET
- **Handler**: `Documentos.get` (`GOOGLE_APPS_SCRIPT.js:1428`)
- **Parámetros**: `nomenclatura` (req.).
- **Respuesta**: **arreglo crudo**, filas de `DOCUMENTOS` filtradas por la nomenclatura. Headers típicos: `NOMENCLATURA, NOMBRE, TIPO, ETAPA, URL_DRIVE, FECHA_AGREGADO, AÑO_PROCESO, ES_HISTORICO, NOMENCLATURA_GRUPO`.
- **Caller**: `getDocumentos()` en `src/services/api.ts:486`.

#### `addDocumento`
- **Método**: ANY
- **Handler**: `Documentos.add` (`GOOGLE_APPS_SCRIPT.js:1451`)
- **Parámetros**: `nomenclatura` (req.), `nombre` (req.), `tipo` (opt, default `PDF`), `etapa` (opt), `url` (opt).
- **Respuesta**: `{success, mensaje}`.
- **Side effects**: inserta fila en `DOCUMENTOS`.
- **Caller**: `addDocumento()` en `src/services/api.ts:489`.

#### `updateDocumentoUrl`
- **Método**: ANY
- **Handler**: `Documentos.updateUrl` (`GOOGLE_APPS_SCRIPT.js:1471`)
- **Parámetros**: `nomenclatura` (req.), `nombre` (req.), `url` (req.).
- **Respuesta**: `{success, updated, row}` o error.
- **Side effects**: busca por `NOMENCLATURA + NOMBRE` en `DOCUMENTOS` y actualiza `URL_DRIVE` y `FECHA_AGREGADO`.
- **Caller**: no se llama directamente desde el frontend. Es invocado internamente por `Documentos.uploadAndRegister` (`GOOGLE_APPS_SCRIPT.js:1536`).

#### `uploadAndRegisterDocument`
- **Método**: ANY (frontend envía el archivo como base64 en el body).
- **Handler**: `Documentos.uploadAndRegister` (`GOOGLE_APPS_SCRIPT.js:1512`)
- **Parámetros**:

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `nomenclatura` | string | Sí | |
| `fileName` | string | Sí | |
| `fileData` | string base64 | Sí | |
| `mimeType` | string | Sí | |
| `entidad` | string | No | Fallback para nombre de carpeta. |
| `documentoDestino` | string | No | Si se pasa, actualiza la URL del documento existente con ese nombre. |
| `esHistorico` | bool | No | Si es true, sube a `HISTORICOS/{año}/{nomenclatura}/`. |
| `añoProceso` | string | No | Requerido cuando `esHistorico=true`. |
| `etapa` | string | No | Se guarda en la fila. |

- **Respuesta**: `{success, fileId, fileUrl, viewUrl, downloadUrl, tipo, documentoActualizado, registradoEnSheets, mensaje}`.
- **Side effects**:
  1. Llama a `Drive.uploadFileToDrive` → crea archivo en Drive (ver acción `uploadFileToDrive`).
  2. Inserta o actualiza fila en la hoja `DOCUMENTOS`.
  3. Si `esHistorico=true`, también actualiza el campo `DOCUMENTOS_JSON` de la fila correspondiente en `HISTORICOS_DETALLE`.
- **Caller**: `uploadDocument()` en `src/services/api.ts:1190` (usa POST real con body JSON en ese caso, ver `src/services/api.ts:1219-1260`).
- **Quirks**: límite duro de 50 MB (`GOOGLE_APPS_SCRIPT.js:2349`).

---

### 3.5 Módulo: FILTROS

#### `getFiltrosEntidades`
- **Método**: GET
- **Handler**: `Filtros.getEntidades` (`GOOGLE_APPS_SCRIPT.js:1849`)
- **Parámetros**: ninguno.
- **Respuesta**: **arreglo crudo** `[{entidad, activo}]`. En ausencia de la hoja, devuelve `[]`. Respuesta real observada: `[]`.
- **Caller**: `getFiltrosEntidades()` en `src/services/api.ts:154`.

#### `getFiltrosPalabras`
- **Método**: GET
- **Handler**: `Filtros.getPalabras` (`GOOGLE_APPS_SCRIPT.js:1867`)
- **Parámetros**: ninguno.
- **Respuesta**: **arreglo crudo** `[{palabra, activo}]`.
- **Caller**: `getFiltrosPalabras()` en `src/services/api.ts:158`.

#### `addFiltroEntidad`
- **Método**: ANY
- **Handler**: `Filtros.addEntidad` (`GOOGLE_APPS_SCRIPT.js:1885`)
- **Parámetros**: `entidad` (req.).
- **Side effects**: appendRow sobre `FILTROS_ENTIDADES`.
- **Caller**: `addFiltroEntidad()` en `src/services/api.ts:214`.

#### `addFiltroPalabra`
- **Método**: ANY
- **Handler**: `Filtros.addPalabra` (`GOOGLE_APPS_SCRIPT.js:1897`)
- **Parámetros**: `palabra` (req.).
- **Side effects**: appendRow sobre `FILTROS_PALABRAS`.
- **Caller**: `addFiltroPalabra()` en `src/services/api.ts:223`.

#### `toggleFiltro`
- **Método**: ANY
- **Handler**: `Filtros.toggle` (`GOOGLE_APPS_SCRIPT.js:1909`)
- **Parámetros**: `tipo` (`'entidad'` o `'palabra'`), `valor` (string), `activo` (bool/string).
- **Side effects**: cambia columna `ACTIVO` en `FILTROS_ENTIDADES` o `FILTROS_PALABRAS`.
- **Caller**: `toggleFiltro()` en `src/services/api.ts:232`.

---

### 3.6 Módulo: ESTADÍSTICAS

#### `getEstadisticas`
- **Método**: GET
- **Handler**: `Estadisticas.get` (`GOOGLE_APPS_SCRIPT.js:1937`)
- **Parámetros**: ninguno.
- **Respuesta**: objeto (sin wrapper `success`) con `{totalProcesos, porRegion, porObjeto, porEntidad, valorTotal, porMoneda, porAnio, topEntidades}`.
- **Side effects**: recorre toda `BD_PROCESOS`.
- **Caller**: `getEstadisticas()` en `src/services/api.ts:162`.

#### `getRegiones`
- **Método**: GET
- **Handler**: `Estadisticas.getRegiones` (`GOOGLE_APPS_SCRIPT.js:1990`)
- **Parámetros**: ninguno.
- **Respuesta**: objeto plano, clave = región, valor = `{count, valor}`. Ejemplo curl real:

```json
{
  "ICA": {"count": 748, "valor": 1263645822.27},
  "AREQUIPA": {"count": 293, "valor": 244514345.44},
  "LIMA": {"count": 1991, "valor": 7420105839.28},
  "PUNO": {"count": 128, "valor": 465902844.77},
  "UCAYALI": {"count": 236, "valor": 214429584.18},
  "JUNIN": {"count": 415, "valor": 937981110.81},
  "LAMBAYEQUE": {"count": 250, "valor": 361046264.19},
  "CUSCO": {"count": 313, "valor": 740489591.32},
  "AMAZONAS": {"count": 6, "valor": 734274.07},
  "LA LIBERTAD": {"count": 465, "valor": 1539104590.03}
}
```

- **Caller**: `getRegionesConProcesos()` en `src/services/api.ts:166`.
- **Quirks**: no devuelve wrapper `success`.

#### `getEntidadesUnicas`
- **Método**: GET
- **Handler**: `Estadisticas.getEntidadesUnicas` (`GOOGLE_APPS_SCRIPT.js:2013`)
- **Parámetros**: ninguno.
- **Respuesta**: **arreglo crudo** `[{entidad, count, valor, regiones: [...]}]` ordenado por `count` descendente.
- **Caller**: `getEntidadesUnicas()` en `src/services/api.ts:170`.

---

### 3.7 Módulo: DRIVE

#### `crearCarpetaDrive`
- **Método**: ANY
- **Handler**: `Drive.crearCarpetaProceso` (`GOOGLE_APPS_SCRIPT.js:2068`)
- **Parámetros**: `nomenclatura` (req.), `entidad` (opt).
- **Respuesta**: `{success, url, id, existe?, mensaje}` o error.
- **Side effects**: crea carpeta dentro del folder raíz `1L1mzM6mTtALDN5waUPIbEhj2zEq7RBZH` si no existía ya una que comience con la nomenclatura.
- **Caller**: `crearCarpetaDrive()` en `src/services/api.ts:508`.

#### `listarArchivosDrive`
- **Método**: GET
- **Handler**: `Drive.listarArchivos` (`GOOGLE_APPS_SCRIPT.js:2240`)
- **Parámetros**: `carpetaUrl` (req., URL de Drive de la forma `https://drive.google.com/drive/folders/{ID}`).
- **Respuesta**: `{success, archivos: [...], total, mensaje}`. Cada archivo incluye `nombre, url, id, tipo, tamaño, fechaCreacion, fechaModificacion, subcarpeta`.
- **Caller**: `listarArchivosDrive()` en `src/services/api.ts:532`.

#### `uploadFileToDrive`
- **Método**: ANY
- **Handler**: `Drive.uploadFileToDrive` (`GOOGLE_APPS_SCRIPT.js:2312`)
- **Parámetros**: `nomenclatura` (req.), `fileName` (req.), `fileData` (base64, req.), `mimeType` (req.), `entidad` (opt), `esHistorico` (opt), `añoProceso` (opt).
- **Respuesta**: `{success, fileId, fileUrl, downloadUrl, viewUrl, fileName, mimeType, size, carpetaUrl, mensaje}` o error.
- **Side effects**: crea carpeta si no existe, sube el archivo, configura permisos `ANYONE_WITH_LINK / VIEW`.
- **Caller**: `uploadFileToDrive()` en `src/services/api.ts:1284` (POST con body JSON).
- **Quirks**: límite 50 MB.

#### `crearCarpetaGrupoHistorico`
- **Método**: ANY
- **Handler**: `Drive.crearCarpetaGrupoHistorico` (`GOOGLE_APPS_SCRIPT.js:2113`)
- **Parámetros**: `nomenclaturaActual` (req.), `historicosPorAño` (req., JSON serializado `{"2023": ["N-1","N-2"], ...}`), `entidad` (opt).
- **Respuesta**: `{success, url, id, carpetaHistoricos, carpetasHistoricosPorAño, mensaje}`.
- **Side effects**: crea estructura `{NOM_ACTUAL}/` y `HISTORICOS/{año}/{nomenclatura_historica}/` en Drive.
- **Caller**: `crearCarpetaGrupoHistorico()` en `src/services/api.ts:781`.

#### `migrarCarpetaExistente`
- **Método**: ANY
- **Handler**: `Drive.migrarCarpetaExistente` (`GOOGLE_APPS_SCRIPT.js:2170`)
- **Parámetros**: `nomenclatura` (req.).
- **Respuesta**: `{success, url, id, existe, mensaje}` o error si no encuentra la carpeta.
- **Side effects**: no migra nada (versión simplificada post-refactor), solo verifica existencia y devuelve la URL.
- **Caller**: `migrarCarpetaExistente()` en `src/services/api.ts:798`.

---

### 3.8 Módulo: GRUPOS HISTÓRICOS

#### `getGruposHistoricos`
- **Método**: GET
- **Handler**: `GruposHistoricos.getAll` (`GOOGLE_APPS_SCRIPT.js:2392`)
- **Parámetros**: ninguno.
- **Respuesta**: **arreglo crudo** de grupos con columnas: `ID_GRUPO, NOMENCLATURA_ACTUAL, NOMENCLATURAS_HISTORICOS (parseado de JSON), FECHA_CREACION, NOTAS, CARPETA_DRIVE`.
- **Caller**: `getGruposHistoricos()` en `src/services/api.ts:720`.

#### `getGrupoHistorico`
- **Método**: GET
- **Handler**: `GruposHistoricos.get` (`GOOGLE_APPS_SCRIPT.js:2421`)
- **Parámetros**: `idGrupo` (req.).
- **Respuesta**: `{success, grupo: {...}}` o error.
- **Caller**: `getGrupoHistorico()` en `src/services/api.ts:725`.

#### `getGrupoByNomenclatura`
- **Método**: GET
- **Handler**: `GruposHistoricos.getByNomenclatura` (`GOOGLE_APPS_SCRIPT.js:2439`)
- **Parámetros**: `nomenclatura` (req.).
- **Respuesta**: `{success, grupo: {...} | null}`. No devuelve error si no existe.
- **Caller**: `getGrupoByNomenclatura()` en `src/services/api.ts:730`.

#### `crearGrupoHistorico`
- **Método**: ANY
- **Handler**: `GruposHistoricos.crear` (`GOOGLE_APPS_SCRIPT.js:2457`)
- **Parámetros**: `nomenclaturaActual` (req.), `nomenclaturasHistoricos` (req., array o JSON o string separado por comas), `entidad` (opt), `notas` (opt).
- **Respuesta**: `{success, idGrupo, carpetaUrl, driveError?, mensaje}` o error si ya existe grupo.
- **Side effects**:
  1. Genera `ID_GRUPO = 'GH-' + timestamp`.
  2. Crea carpeta Drive con subestructura por años (`Drive.crearCarpetaGrupoHistorico`).
  3. Inserta fila en `GRUPOS_HISTORICOS`.
  4. Escribe el `idGrupo` en la columna `ID_GRUPO_HISTORICO` de `SEGUIMIENTO` si existe.
- **Caller**: `crearGrupoHistorico()` en `src/services/api.ts:734`.

#### `updateGrupoHistorico`
- **Método**: ANY
- **Handler**: `GruposHistoricos.update` (`GOOGLE_APPS_SCRIPT.js:2534`)
- **Parámetros**: `idGrupo` (req.), `nomenclaturasHistoricos` (opt), `notas` (opt).
- **Side effects**: actualiza columnas en `GRUPOS_HISTORICOS`.
- **Caller**: `updateGrupoHistorico()` en `src/services/api.ts:753`.

#### `deleteGrupoHistorico`
- **Método**: ANY
- **Handler**: `GruposHistoricos.delete` (`GOOGLE_APPS_SCRIPT.js:2566`)
- **Parámetros**: `idGrupo` (req.).
- **Side effects**: elimina fila de `GRUPOS_HISTORICOS`. **No** borra la carpeta Drive asociada.
- **Caller**: `deleteGrupoHistorico()` en `src/services/api.ts:770`.

---

### 3.9 Módulo: OCDS API (consulta en tiempo real)

Estos handlers llaman en tiempo real al API de Contrataciones Abiertas (`https://contratacionesabiertas.oece.gob.pe/api/v1`). Todos aplican un `Utilities.sleep(1000)` antes de cada fetch (`RATE_LIMIT_MS`).

#### `getProcesoOCDS`
- **Método**: GET
- **Handler**: `OCDS_API.getProceso` (`GOOGLE_APPS_SCRIPT.js:2641`)
- **Parámetros**: `nomenclatura` (req.).
- **Flujo**: busca en la hoja `OCDS_INDEX` (`NOMENCLATURA → TENDER_ID → OCID`). Si no encuentra, retorna error. Si encuentra, llama a `getByTenderId`.
- **Respuesta**: `{success, datos: {...record transformado...}, fuente: 'API_TIEMPO_REAL'}` o error.
- **Side effects**: 1 request HTTP saliente al API OCDS.
- **Caller**: `getProcesoOCDS()` en `src/services/api.ts:925`.

#### `getByTenderId`
- **Método**: GET
- **Handler**: `OCDS_API.getByTenderId` (`GOOGLE_APPS_SCRIPT.js:2663`)
- **Parámetros**: `tenderId` (req.), `source` (opt, default `'seace_v3'`).
- **Respuesta**: `{success, datos, fuente}` o error.
- **Caller**: `getByTenderId()` en `src/services/api.ts:934`.

#### `getByOcid`
- **Método**: GET
- **Handler**: `OCDS_API.getByOcid` (`GOOGLE_APPS_SCRIPT.js:2685`)
- **Parámetros**: `ocid` (req.). Si no empieza con `'ocds-'` se prefija con `ocds-dgv273-`.
- **Respuesta**: `{success, datos, fuente}` o error.
- **Caller**: `getByOcid()` en `src/services/api.ts:943`.

#### `getPostoresOCDS`
- **Método**: GET
- **Handler**: `OCDS_API.getPostores` (`GOOGLE_APPS_SCRIPT.js:2709`)
- **Parámetros**: `nomenclatura` (req.).
- **Respuesta**: `{success, postores: [...], total}`.
- **Caller**: `getPostoresOCDS()` en `src/services/api.ts:954`.
- **Quirks**: internamente llama a `getProceso` y extrae solo `datos.postores`, por lo que es una consulta completa.

#### `getDocumentosOCDS`
- **Método**: GET
- **Handler**: `OCDS_API.getDocumentos` (`GOOGLE_APPS_SCRIPT.js:2721`)
- **Parámetros**: `nomenclatura` (req.).
- **Respuesta**: `{success, documentos: [...], total}`.
- **Caller**: `getDocumentosOCDS()` en `src/services/api.ts:963`.

#### `getCronogramaOCDS`
- **Método**: GET
- **Handler**: `OCDS_API.getCronograma` (`GOOGLE_APPS_SCRIPT.js:2733`)
- **Parámetros**: `nomenclatura` (req.).
- **Respuesta**: `{success, cronograma: {convocatoriaInicio, convocatoriaFin, consultasInicio, consultasFin, buenaPro}}`.
- **Caller**: `getCronogramaOCDS()` en `src/services/api.ts:972`.

#### `listarProcesosOCDS`
- **Método**: GET
- **Handler**: `OCDS_API.listarProcesos` (`GOOGLE_APPS_SCRIPT.js:2742`)
- **Parámetros**: `entidad` (opt, substring case-insensitive).
- **Respuesta**: `{success, total, procesos: [{nomenclatura, tenderId, ocid, entidad, valor}]}`.
- **Side effects**: solo lectura sobre la hoja `OCDS_INDEX`.
- **Caller**: `listarProcesosOCDS()` en `src/services/api.ts:979`.

#### `sincronizarHistoricoIndividual`
- **Método**: ANY
- **Handler**: `OCDS_API.sincronizarHistoricoIndividual` (`GOOGLE_APPS_SCRIPT.js:2932`)
- **Parámetros**: `nomenclatura` (req.).
- **Respuesta**: `{success, etapasActualizadas, año, linkOSCE, mensaje}` o error.
- **Side effects**:
  1. Busca tender_id en `OCDS_INDEX`.
  2. Hace fetch a OCDS API por el tender_id.
  3. Actualiza las etapas `CONVOCATORIA`, `CONSULTAS_OBSERVACIONES`, `BUENA_PRO` en `SEGUIMIENTO` (columnas por año) y en `CRONOGRAMA`.
- **Caller**: `sincronizarHistoricoIndividual()` en `src/services/api.ts:1007`.

#### `sincronizarGrupoHistorico`
- **Método**: ANY
- **Handler**: `OCDS_API.sincronizarGrupoHistorico` (`GOOGLE_APPS_SCRIPT.js:3014`)
- **Parámetros**: `nomenclaturaActual` (req.).
- **Respuesta**: `{success, totalHistoricos, totalEtapasActualizadas, resultados: [...]}`.
- **Side effects**: itera sobre el grupo obtenido vía `GruposHistoricos.getByNomenclatura`, y llama a `sincronizarHistoricoIndividual` para cada nomenclatura (actual + históricos). Genera N requests HTTP + N escrituras a `SEGUIMIENTO`/`CRONOGRAMA`. Puede ser lento.
- **Caller**: `sincronizarGrupoHistorico()` en `src/services/api.ts:1026`.

---

### 3.10 Módulo: OCDS INDEX (generador de índice)

#### `actualizarIndiceOCDS`
- **Método**: ANY
- **Handler**: `OCDS_INDEX.actualizar` (`GOOGLE_APPS_SCRIPT.js:3103`)
- **Parámetros**: `year` (opt, default año actual), `entidad` (opt, filtro por substring).
- **Respuesta**: `{success, procesados, meses, errores, mensaje}`.
- **Side effects**:
  1. Consulta `/api/v1/files?year=...` para obtener meses disponibles.
  2. Para cada mes, itera páginas (`/api/v1/records?...`) hasta 100 páginas con sleep 1s entre cada una → puede tomar **varios minutos** por año.
  3. Crea/actualiza hoja `OCDS_INDEX` con columnas `NOMENCLATURA, TENDER_ID, OCID, ENTIDAD, VALOR, FECHA_ACTUALIZACION`.
- **Caller**: `actualizarIndiceOCDS()` en `src/services/api.ts:991`.
- **Quirks**: riesgo de timeout del Web App (~6 min). El frontend no muestra progreso.

---

### 3.11 Módulo: POSTORES (v3.0)

#### `getPostores`
- **Método**: GET
- **Handler**: `Postores.get` (`GOOGLE_APPS_SCRIPT.js:1699`)
- **Parámetros**: `nomenclatura` (req.).
- **Respuesta**: **arreglo crudo** con columnas `NOMENCLATURA, RUC, RAZON_SOCIAL, REPRESENTANTE, ESTADO, TIPO_POSTOR, ES_MYPE, MONTO_OFERTADO, PUNTAJE, NOTAS, FECHA_REGISTRO`.
- **Caller**: `getPostores()` en `src/services/api.ts:1387`.

#### `addPostor`
- **Método**: ANY
- **Handler**: `Postores.add` (`GOOGLE_APPS_SCRIPT.js:1722`)
- **Parámetros**: `nomenclatura` (req.), `ruc` (req.), `razonSocial` (req.), y opcionales `representante, estado, tipoPostor, esMYPE, montoOfertado, puntaje, notas`.
- **Side effects**: crea la hoja `POSTORES` si no existe; rechaza duplicados `(nomenclatura, ruc)`.
- **Caller**: `addPostor()` en `src/services/api.ts:1393`.

#### `updatePostor`
- **Método**: ANY
- **Handler**: `Postores.update` (`GOOGLE_APPS_SCRIPT.js:1761`)
- **Parámetros**: `nomenclatura` (req.), `ruc` (req.), más campos opcionales.
- **Caller**: `updatePostor()` en `src/services/api.ts:1427`.

#### `deletePostor`
- **Método**: ANY
- **Handler**: `Postores.delete` (`GOOGLE_APPS_SCRIPT.js:1799`)
- **Parámetros**: `nomenclatura` (req.), `ruc` (req.).
- **Caller**: `deletePostor()` en `src/services/api.ts:1447`.

---

### 3.12 Módulo: EMPRESAS ELÉCTRICAS (v2.0)

#### `getEmpresasElectricas`
- **Método**: GET
- **Handler**: `EmpresasElectricas.getAll` (`GOOGLE_APPS_SCRIPT.js:3634`)
- **Parámetros**: ninguno.
- **Respuesta real (curl verificado)**:

```json
{
  "success": true,
  "mensaje": "Operación exitosa",
  "timestamp": "...",
  "empresas": [
    {"item":1,"nombreCompleto":"Consorcio Eléctrico de Villacurí S.A.C.","nombreCorto":"VILLACURI","patronBusqueda":"VILLACURI","colorHex":"#E3F2FD","activo":true},
    {"item":2,"nombreCompleto":"Electricidad Pangoa S.A. - EGEPSA","nombreCorto":"EGEPSA","patronBusqueda":"EGEPSA|PANGOA","colorHex":"#E8F5E9","activo":true}
  ],
  "total": 25
}
```

- **Side effects**: si la hoja `FILTROS_EMPRESAS_ELECTRICAS` no existe, la crea con las 25 empresas por defecto.
- **Caller**: `getEmpresasElectricas()` en `src/services/api.ts:1052`.

#### `toggleEmpresaElectrica`
- **Método**: ANY
- **Handler**: `EmpresasElectricas.toggle` (`GOOGLE_APPS_SCRIPT.js:3670`)
- **Parámetros**: `item` (number/string, req.), `activo` (bool/string, req.).
- **Caller**: `toggleEmpresaElectrica()` en `src/services/api.ts:1059`.

#### `addEmpresaElectrica`
- **Método**: ANY
- **Handler**: `EmpresasElectricas.add` (`GOOGLE_APPS_SCRIPT.js:3699`)
- **Parámetros**: `nombreCompleto`, `nombreCorto`, `patronBusqueda`, `colorHex`.
- **Caller**: `addEmpresaElectrica()` en `src/services/api.ts:1071`.

---

### 3.13 Módulo: SEGUIMIENTO V2 (Detalle completo)

#### `getSeguimientoDetalleCompleto`
- **Método**: GET
- **Handler**: `SeguimientoV2.getDetalleCompleto` (`GOOGLE_APPS_SCRIPT.js:3827`)
- **Parámetros**: `nomenclatura` (req.).
- **Respuesta**: `{success, proceso: {..., cronograma: [...8 etapas], postores, comite, consultas, acciones, documentos, historicos: [...], linkSeace, carpetaDrive}}`.
- **Side effects**: lee `SEGUIMIENTO`, `HISTORICOS_DETALLE`, `DOCUMENTOS`, `GRUPOS_HISTORICOS`.
- **Caller**: `getSeguimientoDetalleCompleto()` en `src/services/api.ts:1087`.

---

### 3.14 Módulo: HISTÓRICOS DETALLE (v2.0)

#### `guardarHistoricoExtraidoIA`
- **Método**: ANY (frontend usa GET con `data=<json>`).
- **Handler**: `HistoricosDetalle.guardarExtraidoIA` (`GOOGLE_APPS_SCRIPT.js:4093`)
- **Parámetros**: objeto con estructura libre extraído por IA desde capturas SEACE. Soporta formatos anidados y planos; se valida mínimamente la presencia de `nomenclatura`. Campos reconocidos incluyen `entidad` (string u objeto `{nombre, ruc, direccion, telefono}`), `objeto`, `valorReferencial`, `montoAdjudicado`, `ganador {ruc, nombre, montoAdjudicado}`, `cronograma[]`, `documentos[]`, `postores[]`, `comiteSeleccion[]`, `consultasObservaciones[]`, `contrato`, `linkSeace`, `linkOsce`, etc.
- **Respuesta**: `{success, accion: 'actualizado'|'agregado', fila, mensaje}`.
- **Side effects**: escribe fila en `HISTORICOS_DETALLE` (upsert por nomenclatura). Preserva el payload completo como JSON en `DATOS_COMPLETOS_JSON`.
- **Caller**: `guardarHistoricoExtraidoIA()` en `src/services/api.ts:1098`.

#### `getComparativaHistoricos`
- **Método**: GET
- **Handler**: `HistoricosDetalle.getComparativa` (`GOOGLE_APPS_SCRIPT.js:4215`)
- **Parámetros**: `nomenclatura` (req.).
- **Respuesta**: `{success, nomenclaturaBase, totalAños, historicos: [...], comparativa: {años, montos, ganadores, tendencia}}`. Tendencia = `CRECIENTE`/`DECRECIENTE`/`ESTABLE`/`SIN_DATOS`.
- **Side effects**: solo lectura sobre `HISTORICOS_DETALLE`.
- **Caller**: `getComparativaHistoricos()` en `src/services/api.ts:1110`.

---

### 3.15 Módulo: IMPORT

#### `procesarImport`
- **Método**: ANY
- **Handler**: `Import.procesar` (`GOOGLE_APPS_SCRIPT.js:904`)
- **Parámetros**: ninguno.
- **Respuesta**: `{success, nuevos, saltados, sinNomenclatura, duplicadosExactos, errores, totalEnBD, mensaje}`.
- **Side effects**:
  1. Lee toda la hoja `SEACE_IMPORT`.
  2. Construye set de claves únicas `(nomenclatura + fecha)` desde `BD_PROCESOS`.
  3. Inserta en batch (`setValues`) todas las filas nuevas normalizando fecha/valor/moneda y calculando `EMPRESA_CORTA`, `ESTADO_FECHA`, `TIPO_SERVICIO` con clasificadores internos (v3.1).
- **Caller**: `procesarImport()` en `src/services/api.ts:245`.

---

## 4. Acciones del frontend sin handler en el backend

Confirmado con `curl` contra el deploy actual (14 de abril 2026):

| Acción | Llamada desde | Resultado real del curl |
|---|---|---|
| `getDatosSeace` | `src/services/api.ts:812` | `{"success":false,"error":"Acción no válida: getDatosSeace"}` |
| `getEstadoScraping` | `src/services/api.ts:825` | `{"success":false,"error":"Acción no válida: getEstadoScraping"}` |
| `getEnlacesRapidos` | `src/services/api.ts:1511` | `{"success":false,"error":"Acción no válida: getEnlacesRapidos"}` |

Las tres funciones residen en `api.ts` probablemente como stubs para una integración futura (scraping SEACE y enlaces rápidos). El frontend maneja los errores con fallbacks: `getEnlacesRapidos` cae a un array local por defecto (`src/services/api.ts:1517`), y `getDatosSeace`/`getEstadoScraping` simplemente devuelven `null` cuando la llamada falla.

Funciones exportadas en `api.ts` que llaman a acciones reales pero **no aparecen directamente** en el router (son wrappers):

- `addSeguimientoCompleto` → usa `addSeguimiento` con payload ampliado.
- `addSeguimientoConOCDS` → combina `addSeguimiento` + `sincronizarHistoricoIndividual`.
- `actualizarCronogramaDesdeOCDS` → usa `updateEtapaSeguimiento`.
- `scrapeProceso` → usa `getProcesoOCDS`.
- `uploadDocument` / `uploadMultipleDocuments` → usan `uploadAndRegisterDocument`.

---

## 5. Verificación HTTP (llamadas curl realizadas)

Todas las llamadas siguientes se ejecutaron sobre el deploy actual el 2026-04-14. Solo se hicieron lecturas.

| Acción | Resultado | Observación |
|---|---|---|
| `getEnlacesRapidos` | FALLO (acción no válida) | Confirma que la acción no existe en el backend. |
| `getRegiones` | OK | Devuelve objeto plano `{REGION: {count, valor}}`. |
| `getEmpresasElectricas` | OK | Devuelve `{success, empresas: [...], total}` con 25 empresas por defecto. |
| `getProcesos?region=AMAZONAS` | OK | Devuelve `{success, total: 6, procesos: [...]}` (6 registros reales, todos de EMSEU/Amazonas). |
| `getFiltrosEntidades` | OK | Devuelve arreglo vacío `[]` porque la hoja no tiene filtros activos. |
| `getDatosSeace?nomenclatura=TEST` | FALLO | Acción no registrada. |
| `getEstadoScraping?nomenclatura=TEST` | FALLO | Acción no registrada. |

---

## 6. Notas operativas

- **Autenticación**: el Web App está desplegado como `Anyone` (acceso anónimo). Cualquier cliente con la URL puede invocar las acciones. No hay token ni firma.
- **CORS**: el helper del frontend usa siempre GET (incluso para mutaciones) para evitar los headers preflight que Google Apps Script no maneja bien. Los payloads complejos se envían como `data=<json>` o se codifican en query params.
- **Rate limit externo**: las acciones OCDS respetan 1 segundo entre llamadas al endpoint oficial (`CONFIG.OCDS_API.RATE_LIMIT_MS`).
- **Caching**: no se usa `CacheService`; cada request vuelve a leer `getDataRange().getValues()`, lo que significa que acciones como `getProcesos`, `getEstadisticas` y `getEntidadesUnicas` son O(N) sobre toda la hoja `BD_PROCESOS`.
- **Timeouts**: acciones pesadas como `actualizarIndiceOCDS` y `sincronizarGrupoHistorico` pueden acercarse al límite de 6 minutos de ejecución de Apps Script.
- **Folder Drive raíz**: `1L1mzM6mTtALDN5waUPIbEhj2zEq7RBZH` (constante `CONFIG.DRIVE_FOLDER_ID` en `GOOGLE_APPS_SCRIPT.js:44`).
- **Nombres de hojas usadas** (`CONFIG.SHEETS`, `GOOGLE_APPS_SCRIPT.js:26-41`): `SEACE_IMPORT`, `BD_PROCESOS`, `CRONOGRAMA`, `SEGUIMIENTO`, `DOCUMENTOS`, `FILTROS_ENTIDADES`, `FILTROS_PALABRAS`, `REGIONES`, `GRUPOS_HISTORICOS`, `DATOS_SEACE`, `OCDS_INDEX`, `FILTROS_EMPRESAS_ELECTRICAS`, `HISTORICOS_DETALLE`, `POSTORES`.
