# Estructura de Google Sheets - SEACE Intelligence

Documento de inventario de todas las hojas del Google Spreadsheet usado como almacenamiento backend del proyecto SEACE Intelligence.

- **Spreadsheet ID:** `1iugkHMAW40jLYeYxkbwC4_pox2tdRTqt4bclJzjN1iM` (ver `SEACE_CONTEXTO.gs:20`)
- **URL:** https://docs.google.com/spreadsheets/d/1iugkHMAW40jLYeYxkbwC4_pox2tdRTqt4bclJzjN1iM/edit
- **Backend Apps Script:** `GOOGLE_APPS_SCRIPT.js` (módulo `CONFIG.SHEETS` en `GOOGLE_APPS_SCRIPT.js:24-41`)
- **Contexto y validación:** `SEACE_CONTEXTO.gs`
- **Tipos TypeScript:** `src/types/index.ts`

Notas previas:

- El inventario de nombres canónicos vive en `GOOGLE_APPS_SCRIPT.js:24-41` dentro de `CONFIG.SHEETS`. El archivo `SEACE_CONTEXTO.gs` mantiene una descripción paralela (parcial, solo las 8 hojas originales).
- La rutina `menuCrearHojasBase()` en `GOOGLE_APPS_SCRIPT.js:3402-3553` crea/actualiza los encabezados de todas las hojas declaradas en `CONFIG.SHEETS` y constituye la fuente canónica de columnas.
- No existen en el código las hojas `ENLACES_RAPIDOS`, `CONFIG`/`CONFIGURACION` ni `LOGS`. El tipo `EnlaceRapido` en `src/types/index.ts:622-631` existe, y el endpoint `getEnlacesRapidos` se invoca desde `src/services/api.ts:1509-1519`, pero no hay handler registrado en Apps Script ni hoja asociada: el frontend cae al arreglo estático `ENLACES_DEFAULT` (`src/services/api.ts:1462`).
- El módulo Python (`python/export_sheets.py`) no escribe a Google Sheets directamente: genera CSVs que el usuario pega manualmente. El único otro productor externo es la API OCDS (`GOOGLE_APPS_SCRIPT.js:52-67`).

## Tabla de contenidos

1. [Hoja: SEACE_IMPORT](#hoja-seace_import)
2. [Hoja: BD_PROCESOS](#hoja-bd_procesos)
3. [Hoja: CRONOGRAMA](#hoja-cronograma)
4. [Hoja: SEGUIMIENTO](#hoja-seguimiento)
5. [Hoja: DOCUMENTOS](#hoja-documentos)
6. [Hoja: FILTROS_ENTIDADES](#hoja-filtros_entidades)
7. [Hoja: FILTROS_PALABRAS](#hoja-filtros_palabras)
8. [Hoja: REGIONES](#hoja-regiones)
9. [Hoja: GRUPOS_HISTORICOS](#hoja-grupos_historicos)
10. [Hoja: DATOS_SEACE](#hoja-datos_seace)
11. [Hoja: OCDS_INDEX](#hoja-ocds_index)
12. [Hoja: FILTROS_EMPRESAS_ELECTRICAS](#hoja-filtros_empresas_electricas)
13. [Hoja: HISTORICOS_DETALLE](#hoja-historicos_detalle)
14. [Hoja: POSTORES](#hoja-postores)
15. [Hojas referenciadas pero no implementadas](#hojas-referenciadas-pero-no-implementadas)

---

## Hoja: SEACE_IMPORT

**Proposito.** Hoja de staging (buffer) donde el usuario pega directamente las filas crudas copiadas del buscador publico del portal SEACE. Se usa como zona de entrada antes de normalizar. La funcion `procesarImportSEACE()` / `Import.procesar({})` (ver alias legacy en `GOOGLE_APPS_SCRIPT.js:3599`) lee este buffer, normaliza fechas/valores y mueve cada fila a `BD_PROCESOS`, eliminando duplicados.

**Columnas** (definidas en `GOOGLE_APPS_SCRIPT.js:3429-3434` y `SEACE_CONTEXTO.gs:48-63`; indices en `IMPORT_COLS` `GOOGLE_APPS_SCRIPT.js:91-102`):

| # | Columna | Tipo | Descripcion |
|---|---------|------|-------------|
| A | N° | number | Numero de fila original de SEACE |
| B | Nombre o Sigla de la Entidad | string | Nombre completo de la entidad contratante |
| C | Fecha y Hora de Publicacion | date | Fecha/hora de publicacion del proceso |
| D | Nomenclatura | string | ID unico del proceso (p.ej. `CP-SM-15-2025-...`) |
| E | Reiniciado Desde | string | Nomenclatura del proceso anterior (si fue reiniciado) |
| F | Objeto de Contratación | string | Servicio / Bien / Obra / Consultoria de Obra |
| G | Descripción de Objeto | string | Descripcion detallada |
| H | VR / VE / Cuantía de la contratación | number | Valor referencial numerico |
| I | Moneda | string | "Soles" o "Dólar" |
| J | Versión SEACE | string | Version del sistema SEACE usado |

**Fuente.** Entrada manual (copy/paste desde el buscador web del SEACE).

**Consumidores.** Leido por `Import.procesar` (legacy `procesarImportSEACE`, `GOOGLE_APPS_SCRIPT.js:905`). Vaciado tras la ingesta. No se expone al frontend: es exclusivamente un buffer de backend.

**Volumen/crecimiento.** Se procesa en batches de `CONFIG.BATCH_SIZE = 100` (`GOOGLE_APPS_SCRIPT.js:50`); se rellena y vacia en cada ingesta, por lo que su tamano es transitorio (decenas a algunos cientos de filas por carga).

**Frescura.** Manual, cuando el usuario copia datos nuevos del portal SEACE.

---

## Hoja: BD_PROCESOS

**Proposito.** Base de datos normalizada de todos los procesos SEACE. Es la tabla central del sistema, la que alimenta la tabla principal del frontend, el dashboard y las estadisticas. Contiene tanto datos normalizados procedentes de `SEACE_IMPORT` como tres columnas de clasificacion automatica (v3.1) anadidas por el scraper/clasificador Python.

**Columnas** (definidas en `GOOGLE_APPS_SCRIPT.js:3436-3439`; indices `BD_COLS` en `GOOGLE_APPS_SCRIPT.js:71-88`; tipado en `src/types/index.ts:3-20`):

| # | Columna | Tipo | Descripcion |
|---|---------|------|-------------|
| A | ID | number | ID autoincremental unico |
| B | NOMENCLATURA | string | Clave primaria del proceso |
| C | ENTIDAD | string | Nombre de la entidad contratante |
| D | REGION | string | Una de las 25 regiones del Peru; detectada con `REGIONES_PERU` (`GOOGLE_APPS_SCRIPT.js:147-173`) |
| E | OBJETO | string | Servicio / Bien / Obra / Consultoría de Obra |
| F | DESCRIPCION | string | Descripcion del objeto |
| G | VALOR | number | Valor referencial |
| H | MONEDA | string | `PEN` o `USD` |
| I | FECHA_PUB | date | Fecha de publicacion en SEACE |
| J | VERSION | string | Version SEACE del proceso |
| K | REINICIADO | string | Nomenclatura del proceso reiniciado |
| L | URL | string | URL directa al proceso en SEACE |
| M | EMPRESA_CORTA | string | v3.1: Clasificacion corta de empresa electrica (ver `FILTROS_EMPRESAS_ELECTRICAS`) |
| N | ESTADO_FECHA | string | v3.1: `ESTA SEMANA` / `ESTE MES` / `ULTIMO TRIMESTRE` / `ANTIGUO` (ver `src/types/index.ts:23-27`) |
| O | TIPO_SERVICIO | string | v3.1: Categoria normalizada (MANTENIMIENTO, SUPERVISION, etc.) |

Nota: `SEACE_CONTEXTO.gs:87-105` solo documenta las 12 primeras columnas; las tres ultimas (v3.1) solo aparecen en `GOOGLE_APPS_SCRIPT.js`.

**Fuente.**

1. Derivada de `SEACE_IMPORT` por `Import.procesar` (normalizacion y deteccion de region).
2. Columnas M-O (EMPRESA_CORTA, ESTADO_FECHA, TIPO_SERVICIO) son escritas por el clasificador Python (ver rama `python/` y comentario "script Python" en `GOOGLE_APPS_SCRIPT.js:85`).
3. Tambien puede recibir filas importadas desde los CSV `procesos.csv` generados por `python/export_sheets.py:38-80`.

**Consumidores.**

- Apps Script: `Procesos.getAll` (`GOOGLE_APPS_SCRIPT.js:778`, endpoint `getProcesos` en `GOOGLE_APPS_SCRIPT.js:678`), `Procesos.getByNomenclatura`, `Estadisticas.get` / `Estadisticas.getRegiones` / `Estadisticas.getEntidadesUnicas` (`GOOGLE_APPS_SCRIPT.js:2014-2020`, `2393+`), `OCDS Index`.
- Frontend: consumido via `api.getProcesos` (`src/services/api.ts:125-142`) que alimenta el store (`src/store/useStore.ts:203`, `src/hooks/useCachedData.ts:132-133`) y se muestra en `ProcesosTable.tsx`, `Dashboard.tsx`, mapa, vistas OCDS y filtros de empresa.

**Volumen/crecimiento.** Crece linealmente con cada ingesta; no tiene tope. El procesamiento usa `BATCH_SIZE = 100`. El codigo no declara un limite de filas.

**Frescura.** Se actualiza cuando el usuario ejecuta `procesarImportSEACE` desde el menu, o cuando el pipeline Python sube nuevos CSVs. No hay un cron automatico en el proyecto.

---

## Hoja: CRONOGRAMA

**Proposito.** Cronograma detallado de cada etapa SEACE por proceso: almacena las fechas reales de las 8 etapas (`ETAPAS_SEACE` en `GOOGLE_APPS_SCRIPT.js:105-114`) para cada proceso en seguimiento. Se sincroniza con SEGUIMIENTO: cuando el usuario actualiza una etapa en SEGUIMIENTO, `Cronograma.updateEtapa` lo replica aqui.

**Columnas** (definidas en `GOOGLE_APPS_SCRIPT.js:3442-3444` y `SEACE_CONTEXTO.gs:179-190`):

| # | Columna | Tipo | Descripcion |
|---|---------|------|-------------|
| A | NOMENCLATURA | string | FK a SEGUIMIENTO / BD_PROCESOS |
| B | ETAPA | string | Una de las 8 etapas SEACE |
| C | FECHA_INICIO | date | Fecha de inicio de la etapa |
| D | FECHA_FIN | date | Fecha de fin de la etapa |
| E | ESTADO | string | `PENDIENTE` / `EN_CURSO` / `COMPLETADO` / `VENCIDO` (default `PENDIENTE`) |

Clave compuesta `(NOMENCLATURA, ETAPA)`.

**Fuente.** Derivada automaticamente de los cambios en `SEGUIMIENTO`. Tambien puede recibir datos desde la API OCDS (modulo `Cronograma`) y del CSV `sheets_cronograma.csv` de Python (`python/export_sheets.py:83-102`).

**Consumidores.**

- Apps Script: `Cronograma.get` (endpoint `getCronograma`, `GOOGLE_APPS_SCRIPT.js:680, 1355`), `Cronograma.updateEtapa` (`GOOGLE_APPS_SCRIPT.js:1394`). Tambien usado en `actualizarEstadosCronograma` (`GOOGLE_APPS_SCRIPT.js:3367-3396`).
- Frontend: `api.getCronograma` (`src/services/api.ts:145-146`) consumido por `SeguimientoDetalleCompleto.tsx` y vistas de detalle de proceso.

**Volumen/crecimiento.** Aproximadamente `N_SEGUIMIENTO * 8` filas. Crece linealmente con el numero de procesos en seguimiento.

**Frescura.** Cada vez que se modifica una etapa en SEGUIMIENTO, o cuando se ejecuta el job manual `actualizarEstadosCronograma`.

---

## Hoja: SEGUIMIENTO

**Proposito.** Registro de procesos que el usuario esta siguiendo activamente, con estado de interes, prioridad, responsable, notas, carpeta Drive y una matriz densa de etapas con tracking **multi-ano** (2021-2025) para comparativas historicas. Cada fila corresponde a una nomenclatura con su "estado de interes" (PENDIENTE / INSCRITO / DESCARTADO).

**Columnas base** (definidas en `GOOGLE_APPS_SCRIPT.js:3406-3409`; tipos en `src/types/index.ts:75-96`):

| # | Columna | Tipo | Descripcion |
|---|---------|------|-------------|
| 1 | NOMENCLATURA | string | Clave primaria, FK a BD_PROCESOS |
| 2 | ENTIDAD | string | Copia denormalizada desde BD_PROCESOS |
| 3 | OBJETO | string | Tipo de contratacion |
| 4 | VALOR | number | Valor referencial |
| 5 | REGION | string | Region |
| 6 | ESTADO_INTERES | string | `PENDIENTE` / `INSCRITO` / `DESCARTADO` (default `PENDIENTE`) |
| 7 | PRIORIDAD | string | `ALTA` / `MEDIA` / `BAJA` (default `MEDIA`) |
| 8 | RESPONSABLE | string | Nombre del responsable |
| 9 | NOTAS | string | Notas libres |
| 10 | FECHA_AGREGADO | date | Fecha en que se agrego |
| 11 | CARPETA_DRIVE | string | URL de carpeta Google Drive creada por `Drive.crearCarpetaProceso` |

**Columnas de etapas.** Generadas dinamicamente por `menuCrearHojasBase()` en `GOOGLE_APPS_SCRIPT.js:3412-3425`. Para cada etapa en `ETAPAS_SEACE` (8 etapas):

- `{ETAPA}_ESTADO` (string: uno de `ESTADOS_ETAPA` `GOOGLE_APPS_SCRIPT.js:120-126`)
- `{ETAPA}_NOTAS` (string)

Y **por cada ano historico** en `AÑOS_HISTORICOS = [2021, 2022, 2023, 2024, 2025]` (`GOOGLE_APPS_SCRIPT.js:117`):

- `{ETAPA}_{AÑO}_INICIO` (date)
- `{ETAPA}_{AÑO}_FIN` (date)
- `{ETAPA}_{AÑO}_LINK` (string - URL OSCE/SEACE)

Total: 11 base + 8 etapas * (2 + 5*3) = **11 + 136 = 147 columnas** cuando se usa el esquema v2.0.

Nota: `SEACE_CONTEXTO.gs:554` usa una formula antigua `11 + (8 * 4) = 43` que solo cuenta el esquema pre-multiano. La estructura actual creada por `menuCrearHojasBase` es la de 147 columnas.

**Fuente.** Manual/semi-automatica: se agrega desde el frontend mediante `Seguimiento.add` (`GOOGLE_APPS_SCRIPT.js:1156-1199`), que copia campos de BD_PROCESOS y crea una carpeta en Drive (`DRIVE_FOLDER_ID` `GOOGLE_APPS_SCRIPT.js:44`). Las etapas arrancan en `PENDIENTE`.

**Consumidores.**

- Apps Script: `Seguimiento.getAll` (`GOOGLE_APPS_SCRIPT.js:1072, 681`), `Seguimiento.getDetalle`, `Seguimiento.add`, `Seguimiento.update` (`1232`), `Seguimiento.updateEtapa` (`1300`), `Seguimiento.delete`. Tambien leida por `GruposHistoricos._actualizarSeguimiento` (`2605+`) para asociar ID_GRUPO.
- Frontend: `api.getSeguimiento` / `api.getSeguimientoDetalle` (`src/services/api.ts:149-150, 255-256`), consumida en `SeguimientoDetalleCompleto.tsx`, `useStore.ts:307`, `useCachedData.ts:168`.

**Volumen/crecimiento.** Crece manualmente segun los procesos que el usuario "sigue". Suele ser una fraccion pequena (decenas, maximo cientos) del total de `BD_PROCESOS`. No hay limite codificado.

**Frescura.** Actualizada en vivo por la UI (cada edicion de etapa, prioridad, nota, etc.).

---

## Hoja: DOCUMENTOS

**Proposito.** Registro de archivos (PDF, DOCX, XLSX, ZIP, imagenes, etc.) asociados a cada proceso y etapa. El archivo fisico se almacena en Google Drive (subcarpetas de `DRIVE_FOLDER_ID`), y esta hoja guarda la metadata y el link Drive.

**Columnas** (definidas en `GOOGLE_APPS_SCRIPT.js:3450-3452`):

| # | Columna | Tipo | Descripcion |
|---|---------|------|-------------|
| A | NOMENCLATURA | string | FK al proceso |
| B | NOMBRE | string | Nombre del archivo |
| C | TIPO | string | PDF / DOCX / XLSX / ZIP / JPG / PNG / OTRO |
| D | ETAPA | string | Etapa SEACE a la que pertenece (opcional) |
| E | URL_DRIVE | string | URL del archivo en Google Drive |
| F | FECHA_AGREGADO | date | Fecha de subida |
| G | AÑO_PROCESO | number | Ano del proceso al que se vincula (para agrupar historicos) |
| H | ES_HISTORICO | boolean | Si pertenece a un grupo historico |
| I | NOMENCLATURA_GRUPO | string | FK a `GRUPOS_HISTORICOS.NOMENCLATURA_ACTUAL` |

Nota: `SEACE_CONTEXTO.gs:208-219` solo documenta las primeras 6 columnas; las 3 ultimas son del esquema v2.0 y solo aparecen en `GOOGLE_APPS_SCRIPT.js:3451-3452`.

**Fuente.** Creada por el flujo de upload del frontend: `Documentos.uploadAndRegister` -> `Drive.uploadFileToDrive` (`GOOGLE_APPS_SCRIPT.js:1517`, `1532`, `1536`) -> `Documentos.add` / `Documentos.updateUrl`. Tambien se registra automaticamente al descargar/adjuntar desde OCDS (`GOOGLE_APPS_SCRIPT.js:1454-1565`). El CSV `sheets_documentos.csv` del exportador Python (`python/export_sheets.py:125-142`) usa un schema distinto (NOMENCLATURA, TITULO, TIPO, FORMATO, URL, FECHA) y se importa a mano.

**Consumidores.**

- Apps Script: `Documentos.get` (endpoint `getDocumentos`), `Documentos.add`, `Documentos.updateUrl`, `Documentos.uploadAndRegister`, `Documentos._actualizarDocumentoEnHistorico` (`1557`).
- Frontend: `api.getDocumentos` (`src/services/api.ts:483-486`) usado en la vista de detalle de proceso y en `SeguimientoDetalleCompleto.tsx`.

**Volumen/crecimiento.** Lineal con cantidad de archivos adjuntados; varios por proceso. Sin tope.

**Frescura.** Cada vez que el usuario adjunta o renombra documentos desde la UI.

---

## Hoja: FILTROS_ENTIDADES

**Proposito.** Lista curada de entidades "favoritas" que el usuario quiere usar como filtros rapidos en la UI (chips/pills del panel de filtros). Permite activar/desactivar cada una sin eliminarlas.

**Columnas** (definidas en `GOOGLE_APPS_SCRIPT.js:3455-3456` y `SEACE_CONTEXTO.gs:233-240`):

| # | Columna | Tipo | Descripcion |
|---|---------|------|-------------|
| A | ENTIDAD | string | Nombre exacto de la entidad (clave unica) |
| B | ACTIVO | boolean | Si se muestra en los filtros |

**Fuente.** Manual desde la UI: `Filtros.addEntidad` (`GOOGLE_APPS_SCRIPT.js:1888-1889`) y `Filtros.toggle` (`1913+`).

**Consumidores.**

- Apps Script: `Filtros.getEntidades` (`GOOGLE_APPS_SCRIPT.js:1849, 684`), `Filtros.addEntidad` (endpoint `addFiltroEntidad`), `Filtros.toggle`.
- Frontend: `api.getFiltrosEntidades` (`src/services/api.ts:153-154`), usado en `FilterPanel.tsx` y `useCachedData.ts:200`.

**Volumen/crecimiento.** Decenas de filas maximo (entidades favoritas del usuario).

**Frescura.** Manual, bajo demanda.

---

## Hoja: FILTROS_PALABRAS

**Proposito.** Lista curada de palabras clave que se usan para filtrar procesos por su campo `DESCRIPCION`. Es el equivalente de `FILTROS_ENTIDADES` pero para filtros de texto.

**Columnas** (definidas en `GOOGLE_APPS_SCRIPT.js:3459-3460` y `SEACE_CONTEXTO.gs:254-261`):

| # | Columna | Tipo | Descripcion |
|---|---------|------|-------------|
| A | PALABRA | string | Palabra clave (unica) |
| B | ACTIVO | boolean | Si esta activa en filtros |

**Fuente.** Manual: `Filtros.addPalabra` (`GOOGLE_APPS_SCRIPT.js:1900-1901`), `Filtros.toggle`.

**Consumidores.**

- Apps Script: `Filtros.getPalabras` (`GOOGLE_APPS_SCRIPT.js:1867, 685`), `Filtros.addPalabra`, `Filtros.toggle`.
- Frontend: `api.getFiltrosPalabras` (`src/services/api.ts:157-158`), `FilterPanel.tsx`, `useCachedData.ts:212`.

**Volumen/crecimiento.** Decenas de filas, manual.

**Frescura.** Manual.

---

## Hoja: REGIONES

**Proposito.** Tabla de patrones de texto usada para detectar automaticamente la region peruana a partir del nombre de una entidad (p.ej. "HIDRANDINA" -> "LA LIBERTAD"). Fallback editable para la logica codificada en `REGIONES_PERU` (`GOOGLE_APPS_SCRIPT.js:147-173`).

**Columnas** (definidas en `GOOGLE_APPS_SCRIPT.js:3463-3464` y `SEACE_CONTEXTO.gs:275-282`):

| # | Columna | Tipo | Descripcion |
|---|---------|------|-------------|
| A | PATRON | string | Substring a buscar en el nombre de la entidad |
| B | REGION | string | Region asignada (una de las 25) |

**Fuente.** Manual (edicion directa en la hoja). Complementa el mapeo hardcodeado `REGIONES_PERU`.

**Consumidores.** Usada en `procesarImportSEACE` / `Import.procesar` para resolver `BD_PROCESOS.REGION` cuando el patron hardcodeado no coincide. No tiene endpoint REST ni lectura desde frontend.

**Volumen/crecimiento.** Del orden de 25-100 filas (un patron o mas por region).

**Frescura.** Editada manualmente cuando aparece una nueva entidad que no se clasifica bien.

---

## Hoja: GRUPOS_HISTORICOS

**Proposito.** Agrupa varias nomenclaturas de distintos anos que corresponden al mismo proceso recurrente (p.ej. "Mantenimiento de redes AR" convocado cada ano). Permite hacer comparativas multianuales (tendencia de VR, ganadores, montos) y centralizar la carpeta Drive del grupo.

**Columnas** (definidas en `GOOGLE_APPS_SCRIPT.js:3467-3469`; tipado en `src/types/index.ts:211-217`):

| # | Columna | Tipo | Descripcion |
|---|---------|------|-------------|
| A | ID_GRUPO | string | ID unico `GH-<timestamp>` (`GOOGLE_APPS_SCRIPT.js:2474`) |
| B | NOMENCLATURA_ACTUAL | string | Nomenclatura del proceso "vigente" que lidera el grupo |
| C | NOMENCLATURAS_HISTORICOS | json (string) | Array JSON de nomenclaturas historicas (`GOOGLE_APPS_SCRIPT.js:2511`) |
| D | FECHA_CREACION | date | Fecha de creacion del grupo |
| E | NOTAS | string | Notas libres |
| F | CARPETA_DRIVE | string | URL de carpeta Drive creada con subcarpetas por ano |

**Fuente.** Creada desde la UI via `GruposHistoricos.crear` (`GOOGLE_APPS_SCRIPT.js:2460-2529`, endpoint `crearGrupoHistorico`).

**Consumidores.**

- Apps Script: `GruposHistoricos.getAll` (`2393+`, endpoint `getGruposHistoricos`), `GruposHistoricos.get`, `GruposHistoricos.getByNomenclatura`, `GruposHistoricos.update` (`2534+`), `GruposHistoricos.delete` (`2569+`), `_agruparPorAño`, `_actualizarSeguimiento`.
- Frontend: `api.getGruposHistoricos` (`src/services/api.ts:720-721`).

**Volumen/crecimiento.** Del orden de los procesos recurrentes seguidos (decenas). Crece manualmente.

**Frescura.** Manual.

---

## Hoja: DATOS_SEACE

**Proposito.** Resultado crudo del scraping de la ficha SEACE/OCDS para cada proceso. Almacena bloques JSON por cada seccion de la ficha (cronograma, documentos, postores, contrato, acciones, items, comite, consultas, ofertas) para evitar tener muchas hojas-hijas y permitir reprocesamiento offline.

**Columnas** (definidas en `GOOGLE_APPS_SCRIPT.js:3472-3476`; tipado en `src/types/index.ts:301-333`):

| # | Columna | Tipo | Descripcion |
|---|---------|------|-------------|
| A | NOMENCLATURA | string | FK |
| B | FECHA_SCRAPING | date | Timestamp de extraccion |
| C | OCID | string | Open Contracting ID |
| D | TENDER_ID | string | ID de licitacion OCDS |
| E | URL_SEACE | string | URL fuente |
| F | SOURCE_ID | string | `seace_v2` o `seace_v3` (ver `OCDS_API.SOURCE_V2/V3`) |
| G | CRONOGRAMA_JSON | json (string) | Cronograma serializado |
| H | DOCUMENTOS_JSON | json (string) | Documentos serializados |
| I | POSTORES_JSON | json (string) | Postores serializados |
| J | CONTRATO_JSON | json (string) | Contrato serializado |
| K | ACCIONES_JSON | json (string) | Acciones del procedimiento |
| L | ITEMS_JSON | json (string) | Items (CUBSO, cantidades) |
| M | COMITE_JSON | json (string) | Integrantes del comite |
| N | CONSULTAS_JSON | json (string) | Consultas y observaciones |
| O | OFERTAS_JSON | json (string) | Ofertas presentadas |
| P | ESTADO_SCRAPING | string | `SUCCESS` / `ERROR` / `PENDING` |
| Q | ERROR_MENSAJE | string | Mensaje de error si fallo |

**Fuente.** Apps Script via OCDS API (ver mensaje "Los datos se guardaron en la hoja DATOS_SEACE" `GOOGLE_APPS_SCRIPT.js:4429`) y/o ingestion desde el scraper Python. La URL base OCDS vive en `CONFIG.OCDS_API.BASE_URL` (`GOOGLE_APPS_SCRIPT.js:55`).

**Consumidores.** Utilizada por las rutinas `Ocds.*` del backend para alimentar los endpoints `getPostoresOCDS`, `getDocumentosOCDS`, `getCronogramaOCDS` (ver `src/services/api.ts:952-972`) y por `getSeguimientoDetalleCompleto` (`src/services/api.ts:1087-1090`).

**Volumen/crecimiento.** Una fila por proceso scrapeado; crece linealmente. Las celdas JSON pueden ser grandes (cercano al limite de 50k caracteres por celda de Sheets).

**Frescura.** Actualizado bajo demanda, cuando se ejecuta el scraping/sync OCDS.

---

## Hoja: OCDS_INDEX

**Proposito.** Indice ligero de mapeo `NOMENCLATURA -> TENDER_ID -> OCID` para acelerar las consultas OCDS sin tener que buscar en `DATOS_SEACE`. Definido como "indice ligero" en el comentario inline (`GOOGLE_APPS_SCRIPT.js:37`).

**Columnas** (creadas dinamicamente en `GOOGLE_APPS_SCRIPT.js:3111`):

| # | Columna | Tipo | Descripcion |
|---|---------|------|-------------|
| A | NOMENCLATURA | string | Clave del proceso |
| B | TENDER_ID | string | ID de licitacion OCDS |
| C | OCID | string | Open Contracting ID |
| D | ENTIDAD | string | Nombre de la entidad |
| E | VALOR | number | Valor referencial |
| F | FECHA_ACTUALIZACION | date | Ultima vez que se refresco la entrada |

**Fuente.** Poblada automaticamente por la rutina de indexacion OCDS (inserta/actualiza filas via `UrlFetchApp.fetch(OCDS_API.BASE_URL + ...)` en `GOOGLE_APPS_SCRIPT.js:3147, 3166`). Datos crudos presentes como CSV en `data/output/OCDS_INDEX.csv` y `data/output/OCDS_INDEX_COMPLETO.csv`.

**Consumidores.** Leida por `GOOGLE_APPS_SCRIPT.js:2743, 2772, 3108` para resolver IDs OCDS antes de llamadas subsecuentes.

**Volumen/crecimiento.** Crece con cada proceso nuevo conocido por OCDS; lineal con `BD_PROCESOS`.

**Frescura.** Refrescada por la rutina de sync OCDS bajo demanda (no hay cron).

---

## Hoja: FILTROS_EMPRESAS_ELECTRICAS

**Proposito.** v2.0. Configuracion persistente de las empresas electricas de interes (las 25 distribuidoras/generadoras que sigue el usuario). Alimenta los filtros del frontend (`FiltroEmpresas.tsx`) y la clasificacion automatica `BD_PROCESOS.EMPRESA_CORTA`.

**Columnas** (definidas en `GOOGLE_APPS_SCRIPT.js:3480`; tipado en `src/types/index.ts:337-344`):

| # | Columna | Tipo | Descripcion |
|---|---------|------|-------------|
| A | ITEM | number | Numero de orden |
| B | NOMBRE_COMPLETO | string | Razon social completa |
| C | NOMBRE_CORTO | string | Alias para UI (p.ej. `HIDRANDINA`) |
| D | PATRON_BUSQUEDA | string | Regex/patron para matching contra `ENTIDAD` |
| E | COLOR_HEX | string | Color para badges (`#E3F2FD`, etc.) |
| F | ACTIVO | boolean | Si el filtro esta habilitado |

**Datos por defecto.** La hoja se crea con 25 filas pre-populadas (`GOOGLE_APPS_SCRIPT.js:3481-3507`): VILLACURI, EGEPSA, ELECTRO DUNAS, ELECTRO TOCACHE, ELECTROCENTRO, ENOSA, EGASA, ELSE, ELECTRO ORIENTE, ADINELSA, ELECTROSUR, ESEMPAT, EMSEM, EMSEU, ELECTRO PUNO, HIDRANDINA, LUZ DEL SUR, PLUZ/ENEL, SERSA, SEAL, ELECTRONORTE, ELECTRO UCAYALI, OSINERGMIN, SAN GABAN, MACHUPICCHU.

**Fuente.** Creada con datos por defecto por `menuCrearHojasBase` o por `EmpresasElectricas._crearHoja` (`GOOGLE_APPS_SCRIPT.js:3629+`). Editable manualmente y via endpoints.

**Consumidores.**

- Apps Script: `EmpresasElectricas.getAll` (`3634+`, endpoint `getEmpresasElectricas`), `EmpresasElectricas.toggle`, `EmpresasElectricas.add`.
- Frontend: `api.getEmpresasElectricas` (`src/services/api.ts:1052-1055`), `FiltroEmpresas.tsx`.

**Volumen/crecimiento.** Ancla en 25 filas por defecto, crece solo si el usuario agrega mas (decenas maximas).

**Frescura.** Manual.

---

## Hoja: HISTORICOS_DETALLE

**Proposito.** v2.0. Detalle completo multi-ano de un proceso historico: para cada ano en que un proceso recurrente se convoco, almacena entidad, valor referencial, monto adjudicado, ganador, fechas clave y bloques JSON con todos los sub-objetos. Soporta las comparativas historicas del frontend.

**Columnas** (definidas en `GOOGLE_APPS_SCRIPT.js:3511-3516`; tipado en `src/types/index.ts:386-407`):

| # | Columna | Tipo | Descripcion |
|---|---------|------|-------------|
| A | NOMENCLATURA | string | Clave (un proceso historico individual) |
| B | AÑO | number | Ano del proceso |
| C | ENTIDAD | string | Nombre de la entidad |
| D | ENTIDAD_RUC | string | RUC |
| E | ENTIDAD_DIRECCION | string | Direccion |
| F | ENTIDAD_TELEFONO | string | Telefono |
| G | OBJETO | string | Objeto de contratacion |
| H | VALOR_REFERENCIAL | number | Valor referencial |
| I | MONTO_ADJUDICADO | number | Monto adjudicado al ganador |
| J | GANADOR_RUC | string | RUC del ganador |
| K | GANADOR_NOMBRE | string | Razon social del ganador |
| L | FECHA_CONVOCATORIA | date | Fecha de convocatoria |
| M | FECHA_BUENA_PRO | date | Fecha de buena pro |
| N | NUMERO_CONTRATO | string | Numero de contrato |
| O | TOTAL_POSTORES | number | Cantidad de postores |
| P | ESTADO_PROCESO | string | Estado final |
| Q | LINK_SEACE | string | URL SEACE |
| R | LINK_OSCE | string | URL OSCE |
| S | CRONOGRAMA_JSON | json (string) | Cronograma serializado |
| T | DOCUMENTOS_JSON | json (string) | Documentos serializados |
| U | POSTORES_JSON | json (string) | Postores serializados |
| V | COMITE_JSON | json (string) | Comite serializado |
| W | CONSULTAS_JSON | json (string) | Consultas y observaciones |
| X | ACCIONES_JSON | json (string) | Acciones del procedimiento |
| Y | ACUERDOS_JSON | json (string) | Acuerdos comerciales |
| Z | CONTRATO_JSON | json (string) | Datos del contrato |
| AA | DATOS_COMPLETOS_JSON | json (string) | Payload completo original |
| AB | FECHA_EXTRACCION | date | Cuando se extrajo |
| AC | FUENTE | string | `IA` / `MANUAL` / `OCDS` |

**Fuente.**

1. `HistoricosDetalle.guardarExtraidoIA` (`GOOGLE_APPS_SCRIPT.js:752`, endpoint `guardarHistoricoExtraidoIA`) - datos extraidos con IA/scraper sobre fichas historicas.
2. `Documentos._actualizarDocumentoEnHistorico` actualiza la columna `DOCUMENTOS_JSON` cuando se suben documentos (`GOOGLE_APPS_SCRIPT.js:1622-1679`).

**Consumidores.**

- Apps Script: `HistoricosDetalle.getComparativa` (endpoint `getComparativaHistoricos`, `GOOGLE_APPS_SCRIPT.js:753`), logica de comparativas.
- Frontend: `api.getComparativaHistoricos` (`src/services/api.ts:1110-1113`), `SeguimientoDetalleCompleto.tsx` (seccion de historicos).

**Volumen/crecimiento.** Una fila por (proceso, ano); crece linealmente con el historico analizado.

**Frescura.** Bajo demanda, cuando se dispara la rutina de extraccion IA/OCDS.

---

## Hoja: POSTORES

**Proposito.** v3.0. Registro de postores por proceso (participantes, ganadores, descalificados). Permite llevar un padron propio de empresas postoras independiente del scraping OCDS.

**Columnas** (definidas en `GOOGLE_APPS_SCRIPT.js:1827-1830` dentro de `Postores._crearHoja`):

| # | Columna | Tipo | Descripcion |
|---|---------|------|-------------|
| A | NOMENCLATURA | string | FK al proceso |
| B | RUC | string | RUC del postor |
| C | RAZON_SOCIAL | string | Razon social |
| D | REPRESENTANTE | string | Representante legal |
| E | ESTADO | string | `PARTICIPANTE` / `GANADOR` / `DESCALIFICADO` / `NO_ADMITIDO` (default `PARTICIPANTE`, `GOOGLE_APPS_SCRIPT.js:1746`) |
| F | TIPO_POSTOR | string | `CONSORCIO` / `INDIVIDUAL` |
| G | ES_MYPE | boolean | Si es MYPE |
| H | MONTO_OFERTADO | number | Monto ofertado |
| I | PUNTAJE | number | Puntaje obtenido |
| J | NOTAS | string | Notas libres |
| K | FECHA_REGISTRO | date | Fecha de alta |

Nota: `POSTORES` NO se crea en `menuCrearHojasBase` sino de forma perezosa por `Postores._crearHoja` la primera vez que se llama a `Postores.add` (`GOOGLE_APPS_SCRIPT.js:1727-1728`). Su clave logica es `(NOMENCLATURA, RUC)`.

**Fuente.** Manual desde UI via `Postores.add` (`GOOGLE_APPS_SCRIPT.js:1722-1755`), `Postores.update` (`1761+`), `Postores.delete`. El CSV `sheets_postores.csv` del exportador Python (`python/export_sheets.py:104-122`) usa un schema distinto (`NOMENCLATURA, RUC, NOMBRE, ES_GANADOR`) y se importa manualmente si se desea.

**Consumidores.**

- Apps Script: `Postores.get` (`1700+`, endpoint `getPostores`), `Postores.add`, `Postores.update`, `Postores.delete`.
- Frontend: `api.getPostores` (`src/services/api.ts:1386-1387`).

**Volumen/crecimiento.** Varios postores por proceso; crece linealmente con `N_PROCESOS * avg_postores`.

**Frescura.** Manual via UI.

---

## Hojas referenciadas pero no implementadas

Las siguientes hojas aparecen mencionadas en el briefing o en tipos del frontend, pero NO existen en `CONFIG.SHEETS` ni tienen handlers en `GOOGLE_APPS_SCRIPT.js`:

- **ENLACES_RAPIDOS.** El tipo `EnlaceRapido` esta definido en `src/types/index.ts:622-631` y el frontend llama a `getEnlacesRapidos` (`src/services/api.ts:1509-1519`), pero no hay hoja ni handler. El frontend cae al arreglo estatico `ENLACES_DEFAULT` (`src/services/api.ts:1462`). Si se quiere persistirlos habria que crear la hoja (propuesta de columnas segun el tipo: `id, nombre, url, categoria, icono, color, orden, activo`).
- **CONFIG / CONFIGURACION.** No existe: la configuracion vive en la constante `CONFIG` de `GOOGLE_APPS_SCRIPT.js:24`.
- **LOGS.** No existe. Hay un flag `CONFIG.DEBUG` (`GOOGLE_APPS_SCRIPT.js:47`) y una carpeta `logs/` a nivel de proyecto Python, pero no hay hoja de logs en Sheets.

---

## Resumen rapido

| # | Hoja | Cols | Fuente primaria | Crecimiento |
|---|------|------|-----------------|-------------|
| 1 | SEACE_IMPORT | 10 | Manual (copy/paste SEACE) | Transitorio |
| 2 | BD_PROCESOS | 15 | Derivada de SEACE_IMPORT + Python | Lineal |
| 3 | CRONOGRAMA | 5 | Derivada de SEGUIMIENTO | Lineal (8 x N) |
| 4 | SEGUIMIENTO | 147 | Manual (UI) | Lineal |
| 5 | DOCUMENTOS | 9 | Upload UI / OCDS | Lineal |
| 6 | FILTROS_ENTIDADES | 2 | Manual (UI) | Decenas |
| 7 | FILTROS_PALABRAS | 2 | Manual (UI) | Decenas |
| 8 | REGIONES | 2 | Manual | ~25-100 |
| 9 | GRUPOS_HISTORICOS | 6 | Manual (UI) | Decenas |
| 10 | DATOS_SEACE | 17 | OCDS API / scraper | Lineal |
| 11 | OCDS_INDEX | 6 | OCDS sync | Lineal |
| 12 | FILTROS_EMPRESAS_ELECTRICAS | 6 | Default + manual | ~25+ |
| 13 | HISTORICOS_DETALLE | 29 | IA/OCDS | Lineal (por ano) |
| 14 | POSTORES | 11 | Manual (UI) | Lineal |

**Total de hojas activas: 14.** Total de columnas sumando todas las hojas: **267** (SEGUIMIENTO contribuye 147 por la matriz multi-ano). Referencia clave: `GOOGLE_APPS_SCRIPT.js:24-41` (nombres) y `GOOGLE_APPS_SCRIPT.js:3402-3553` (esquemas de columnas).
