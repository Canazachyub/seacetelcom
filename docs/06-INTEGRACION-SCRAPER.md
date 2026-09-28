# 06 - Integración con SCRAPING-TELCOM

Cómo el scraper de escritorio `C:\PROGRAMACION\SCRAPING-TELCOM` alimenta de datos a SEACE TELCOM
(Google Sheets + Apps Script + frontend React). Documento generado el 2026-09-28 a partir del código
de ambos repos; las citas `archivo:línea` apuntan al estado del árbol de trabajo en esa fecha.

> **Aviso:** buena parte de la integración (`plataforma.py`, `exportadores.py`, `python/`) está
> **sin commitear** en SCRAPING-TELCOM. Si se pierde el árbol de trabajo, se pierde la integración.

---

## 1. Visión general

```
                 ┌──────────────────────────── SCRAPING-TELCOM (PC local, Windows) ─────────────────────────┐
 prod2.seace.gob.pe  ◄── Selenium + Chrome ──  gui_seace.py (Tkinter, 4 pestañas)                            │
 (buscador público JSF)                         python/run.py (CLI "Fase 2")                                  │
                                                 │                    │                     │                 │
                                                 ▼                    ▼                     ▼                 │
                                        descargas/**/*.csv    SEACE_IMPORT.csv      POST guardarDatosSeace    │
                                        (+ PDFs, XLS)         (import manual)       (api_client / plataforma) │
                 └───────────────────────────────────────────────┬──────────────────────────┬──────────────┘
                                                                 │ pegar + procesarImport   │ upsert
                                                                 ▼                          ▼
                                                     ┌──── Google Sheet (Apps Script Web App) ────┐
 contratacionesabiertas.oece.gob.pe (OCDS) ◄─ proxy ─│ SEACE_IMPORT → BD_PROCESOS    DATOS_SEACE   │
                                                     │ OCDS_INDEX   GRUPOS_HISTORICOS  DOCUMENTOS  │
                                                     └──────────────────┬──────────────────────────┘
                                                                        │ GET ?action=...
                                                                        ▼
                                                       Frontend React (GitHub Pages / npm run dev)
```

Hay **dos canales** de entrada desde el scraper:

| Canal | Qué lleva | Destino | Automatización |
|---|---|---|---|
| **A. Listado de procesos** | Filas del buscador SEACE (10 columnas) | `SEACE_IMPORT` → `BD_PROCESOS` | Manual: se pega el CSV y se ejecuta `procesarImport` |
| **B. Detalle por proceso** | Cronograma, documentos, postores, contrato, etc. en JSON | `DATOS_SEACE` (upsert por NOMENCLATURA) | Automático vía HTTP a `guardarDatosSeace` |

El scraper **no usa OCDS**. Los datos OCDS entran por otra vía (Apps Script → proxy → API OECE,
ver `docs/03-API-APPS-SCRIPT.md` y la sección 6).

---

## 2. SCRAPING-TELCOM en breve

**Stack:** Python 3.10+, Selenium 4 + `webdriver-manager`, Tkinter, pandas/openpyxl, Scrapy (solo como
envoltorio), `requests`, `python-dotenv`. Requiere Chrome instalado.

**Fuente única:** `https://prod2.seace.gob.pe/seacebus-uiwd-pub/buscadorPublico/buscadorPublico.xhtml`
(se usa `prod2` porque `prodapp2` tiene la cadena TLS rota). Los documentos se sirven desde
`alfprod.seace.gob.pe` (Alfresco). Mapa de selectores y su deriva: `MAPA_PORTAL_SEACE.md`.

**Captcha:** se resuelve a mano en la ventana visible de Chrome. La GUI muestra un banner rojo cuando
aparece (`gui_seace.py:1210-1235`). `scrape_competencia.py:260-279` espera 15 s y lanza `CaptchaError`.
El solver automático de `seace_1.py:43-96` es código muerto.

**Instalación:**

```bat
cd C:\PROGRAMACION\SCRAPING-TELCOM
instalar.bat            :: crea venv\, instala requirements.txt, copia .env.example → .env
venv\Scripts\activate
```

### Puntos de entrada

| Comando | Qué hace | Salida |
|---|---|---|
| `python gui_seace.py` → *Scraping por Entidad* | `SeaceEntidadScraper.scrape()` (`scraping_por_entidad.py:2311`) | `descargas/{SIGLA}/…` (sección 3.A) |
| `python gui_seace.py` → *Descargar Históricos* | `SeaceHistoricoScraper` (`descargar_historicos.py:357`) | `descargas/historicos/{SIGLA}/{SIGLA}_{AÑO}.xls` y `{SIGLA}_CONSOLIDADO.xlsx` |
| `python gui_seace.py` → *Buscar Nomenclatura* | `SeaceNomenclaturaScraper.buscar_multiples()` (`buscar_por_nomenclatura.py:1103`) | `descargas/actuales/{NOMENCLATURA}/…` y `Resumen_Procesos.csv` |
| `python gui_seace.py` → *Scraping General* | `scrapy crawl seace_1` | JSON/CSV de Scrapy (12 columnas) |
| `python python/run.py --grupo GH-…` | Scrapea todos los procesos de un grupo histórico y los sube | `DATOS_SEACE` |
| `python python/run.py --nomenclaturas A,B` | Igual, con una lista explícita | `DATOS_SEACE` |
| `python python/scrape_competencia.py <NOM>` | Scrapea un proceso e imprime el JSON (sin subir) | stdout |
| `python python/test_smoke.py` | Prueba el backend **real** (escribe la fila `TEST-SMOKE-99-1999-TESTING-1`) | `DATOS_SEACE` |

Flags de `run.py` (`python/run.py:129-173`): `--solo-pendientes`, `--solo-errores`, `--dry-run`,
`--limit N`. Códigos de salida: `0` todo OK, `1` hubo fallos, `2` no se pudo resolver la lista.

### Configuración

| Variable / archivo | Uso |
|---|---|
| `SEACE_API_URL` (.env) | URL `/exec` del Apps Script. Si falta, usa la **hardcodeada** en `python/api_client.py:28-31`, que debe coincidir con `VITE_API_URL` de este repo. |
| `TEST_MODE` (.env) | Si está definida (con cualquier valor, incluso `False`), Chrome **no** corre headless (`seace/spiders/seace_1.py:371`). |
| `GOOGLE_SHEETS_CREDENTIALS_FILE` | Service account para el resumen por gspread (`exportadores.py:389`). `gspread` está comentado en `requirements.txt`. |
| `config.json` (gitignored) | Últimos valores de la GUI, incluidos `subir_plataforma`, `sheets_enabled` y `sheets_id`. |

---

## 3. Canal A: listado de procesos → `BD_PROCESOS`

### 3.A Lo que produce el scraper por entidad

En `descargas/{SIGLA}/`:

| Archivo | Separador | Columnas |
|---|---|---|
| `Lista-Procesos.xls` (export nativo SEACE; en realidad es HTML) | — | las del buscador |
| `Lista_Detallada.csv` | `;` | Nomenclatura, Fecha y Hora de Publicacion, Reiniciado Desde, Objeto de Contratacion, Descripcion de Objeto, Codigo SNIP, CUI, VR/VE/Cuantia, Moneda, Version SEACE |
| `Procesos_Completo.csv` | `,` | lo anterior + Fecha Limite Registro, Estado (VENCIDO/PROXIMO/VIGENTE), Dias Restantes, Fecha Presentacion Propuestas, Fecha Buena Pro, Contratista Ganador, Monto Adjudicado |
| `{NOM}/Cronograma.csv` | `,` | Etapa, Fecha Inicio, Fecha Fin |
| `{NOM}/Documentos.csv` | `;` | Etapa, Documento, Archivo, Fecha Publicacion, Descargado, GUID, Nombre Real |
| `{NOM}/Postores.csv` *(opcional)* | `;` | RUC, Razon Social, Fecha Presentacion, Hora |
| `{NOM}/Contratos.csv` *(opcional)* | `;` | Nro, Entidad Contratante, Contratista, Numero del Contrato, Monto |
| **`SEACE_IMPORT.csv`** | `,` utf-8-sig | **las 10 columnas de `IMPORT_COLS`** |

### 3.B Contrato con la hoja `SEACE_IMPORT`

`plataforma.generar_csv_seace_import()` usa `_SEACE_IMPORT_HEADERS` (`plataforma.py:298-309`), que coinciden
con `IMPORT_COLS` (`GOOGLE_APPS_SCRIPT.js:107-118`):

```
N° | Nombre o Sigla de la Entidad | Fecha y Hora de Publicacion | Nomenclatura | Reiniciado Desde |
Objeto de Contratación | Descripción de Objeto | VR / VE / Cuantía de la contratación | Moneda | Versión SEACE
```

### 3.C Pasos para cargarlo

1. Correr *Scraping por Entidad* para las SIGLAs deseadas.
2. Abrir `descargas/{SIGLA}/SEACE_IMPORT.csv` y pegar sus filas en la hoja `SEACE_IMPORT`.
3. Ejecutar la acción `procesarImport` (menú del Sheet o `?action=procesarImport`).
4. `Import.procesar` (`GOOGLE_APPS_SCRIPT.js:933-1097`) copia a `BD_PROCESOS`, **deduplica por
   (NOMENCLATURA, FECHA_PUB)** y completa REGION, EMPRESA_CORTA, ESTADO_FECHA y TIPO_SERVICIO.
5. En el frontend, forzar recarga (la caché IndexedDB de `getProcesos` tiene TTL, `src/services/cache.ts:18-25`).

**Cuidado:** la columna de entidad se llena con el **nombre de la carpeta (SIGLA)**, no con el nombre
completo. EMPRESA_CORTA se calcula con los patrones de `Utils.CLASIFICACIONES_EMPRESAS` sobre ese texto,
así que una sigla que no calce con ningún patrón queda como `OTRA ELECTRICA`. `normalizarProcesos`
(`src/utils/constants.ts`) corrige algunos casos en el cliente.

---

## 4. Canal B: detalle por proceso → `DATOS_SEACE`

### 4.A Acción `guardarDatosSeace`

`DatosSeaceLookup.guardar` (`GOOGLE_APPS_SCRIPT.js:5242-5364`) hace **upsert por NOMENCLATURA**, migra
encabezados si faltan y **no sobreescribe con valores vacíos**. Responde `{accion: insertado|actualizado, fila}`.

Columnas de `DATOS_SEACE`:

```
NOMENCLATURA, FECHA_SCRAPING, OCID, TENDER_ID, URL_SEACE, SOURCE_ID,
CRONOGRAMA_JSON, DOCUMENTOS_JSON, POSTORES_JSON, CONTRATO_JSON, ACCIONES_JSON,
ITEMS_JSON, COMITE_JSON, CONSULTAS_JSON, OFERTAS_JSON,
ESTADO_SCRAPING (pendiente|en_proceso|completo|error), ERROR_MENSAJE,
FUENTE (python_scraper|captura_ia|ocds_api)
```

Claves del payload: `nomenclatura`, `fuente`, `estadoScraping`, `cronograma`, `documentos`, `postores`,
`contrato`, `acciones`, `items`, `comite`, `consultas`, `ofertas`, `ocid`, `tenderId`, `urlSeace`,
`sourceId`, `errorMensaje`, `fechaScraping`. El frontend las consume como `DatosSeace`
(`src/types/index.ts:221-301`).

### 4.B Dos productores con formas distintas

| | `python/scrape_competencia.py` (Fase 2) | `plataforma.construir_payload()` (GUI) |
|---|---|---|
| Origen | Navega la ficha en vivo | Relee los CSV de `descargas/{SIGLA}/{NOM}/` |
| `cronograma[].etapa` | slug canónico + `etapaLabel`, fechas ISO | etiqueta cruda del portal |
| `postores[]` | ruc, razonSocial, esConsorcio, integrantes…, `esGanador` siempre `false` | RUC, razón social, fecha |
| `documentos[]` | solo URLs | archivos descargados |
| `contrato` | stub vacío `{}` | lista de `Contratos.csv` **o** un dict (ver bug 3, sección 7) |
| Extra | convocatoria, entidad, procedimiento, items, comite, consultas, ofertas, acciones | — |

Cualquier cambio de esquema tiene que tocar **los dos productores** y los tipos de `src/types/index.ts`.

### 4.C Flujo de grupos históricos (el caso de uso principal)

1. En la vista **Históricos**, `buscarHistoricosCandidatos` propone procesos anteriores de la misma
   empresa, re-ordenados por DeepSeek. Se crea el grupo (`crearGrupoHistorico` → `GRUPOS_HISTORICOS`).
2. En la PC del scraper: `python python/run.py --grupo GH-XXXX [--solo-pendientes]`.
   - Lee el grupo con `getDetalleGrupo` / `getEstadoScrapingGrupo`.
   - Por cada nomenclatura: marca `en_proceso` → scrapea → sube `completo` o `error` con el traceback
     (`run.py:222-277`). El cliente reintenta una vez con backoff de 2 s y 4 s (`api_client.py:69-125`).
3. En la UI, `GrupoDetalleModal` consulta `getEstadoScrapingGrupo` cada 8 s y muestra el avance.
4. `listarGruposConStats` / `getDetalleGrupo` cruzan `GRUPOS_HISTORICOS` + `BD_PROCESOS` + `DATOS_SEACE`.

Alternativa sin scraper: captura de pantalla + Gemini (`gemini.extraerDatosSEACE`) →
`guardarHistoricoExtraidoIA` con `FUENTE = captura_ia`.

### 4.D PDFs a Drive (pendiente)

`api_client.upload_pdf_drive` → `uploadFileToDrive` (`GOOGLE_APPS_SCRIPT.js:2346`) acepta un PDF en base64
(50 MB máx., clave `añoProceso` con ñ). `run.py` **todavía no lo llama** (Fase 2.1).

---

## 5. Verificación rápida de la integración

```bat
:: 1. Backend responde
curl "%SEACE_API_URL%?action=healthCheck"

:: 2. Escritura de prueba (deja una fila de test en DATOS_SEACE; borrarla después)
python python\test_smoke.py

:: 3. Un proceso real sin subir nada
python python\scrape_competencia.py "CP-SER-SM-7-2026-ELSE-1"

:: 4. Un grupo en seco
python python\run.py --grupo GH-XXXX --dry-run --limit 1
```

En la UI: **Diagnóstico** → `healthCheck` muestra el conteo de filas por hoja, incluida `DATOS_SEACE`.

---

## 6. Relación con el pipeline OCDS

El scraper y OCDS se complementan:

| | Scraper (SEACE HTML) | OCDS (API OECE) |
|---|---|---|
| Cobertura | lo que se busque, incluido lo más reciente | datasets mensuales publicados con desfase |
| Detalle | cronograma real, documentos, postores | tender, awards, contracts estandarizados |
| Coste | lento (Selenium, captcha manual) | rápido, pero el WAF bloquea IPs de Google |
| Entrada al sistema | `SEACE_IMPORT`, `DATOS_SEACE` | `OCDS_INDEX`, `getProcesoOCDS`, `sincronizar*` |

El proxy OCDS está migrando del túnel `trycloudflare` (`proxy/server.cjs` + `proxy/start-tunnel.bat`) a un
Cloudflare Worker (`proxy/cloudflare-worker.js`). `docs/PLAN_ARQUITECTURA.md:615` advierte que OECE
también podría bloquear IPs de Workers: **hay que probarlo antes de desmontar el túnel.**

---

## 7. Problemas conocidos del scraper que afectan a los datos

| # | Problema | Ubicación | Efecto en SEACE TELCOM |
|---|---|---|---|
| 1 | Los fallos se reportan como éxito: `scrape()` atrapa todas las excepciones | `scraping_por_entidad.py:2402-2405` | Una SIGLA sale "OK" sin datos; "Reintentar solo errores" no la reintenta |
| 2 | Se exporta un `Procesos_Completo.csv` viejo si no se procesaron fichas | `scraping_por_entidad.py:2287` | Se importan datos desactualizados |
| 3 | `contrato` es lista o dict según el caso | `plataforma.py:240-248` | `CONTRATO_JSON` con dos formas en la misma hoja |
| 4 | `glob('Lista-Procesos*.xls')[0]` puede tomar un XLS antiguo | `scraping_por_entidad.py:1795-1799` | Mezcla de exportaciones |
| 5 | Nomenclaturas con espacios (`CP SER-SM-7-2026-ELSE-1`) | XLS nativo | Cruces por NOMENCLATURA fallan (duplicados, grupos sin datos) |
| 6 | La ficha se toma del "primer resultado / segundo enlace" | `scrape_competencia.py:398-413` | Riesgo de guardar la ficha equivocada |
| 7 | `esGanador` nunca se llena y el contrato no se scrapea | `scrape_competencia.py` | La UI no puede mostrar el ganador desde el scraper |
| 8 | Columna de entidad = SIGLA | `plataforma.py` | EMPRESA_CORTA mal clasificada |
| 9 | Spider `seace_2` roto (`get_extra_data` no existe) | `seace/spiders/seace_2.py:34` | — |
| 10 | `TEST_MODE=False` igual desactiva headless | `seace_1.py:371` | — |

Además: selectores PrimeFaces `j_idt###` que ya cambiaron, `sleep()` fijos en lugar de esperas
explícitas, backend Apps Script público y sin autenticación, sin tests ni scheduler.

---

## 8. Actualización del Radar (desde 28/09/2026)

Flujo sin copiar/pegar, pensado para la vista **Radar Telcom** (hábil / no hábil):

```bat
cd C:\PROGRAMACION\SCRAPING-TELCOM
:: 1. Scrapea lista + fichas (cronogramas) de las entidades núcleo, solo archivos locales
venv\Scripts\python python\actualizar_radar.py
::    opciones: --siglas "ELSE,SEAL" --desde 01/01/2026 --sin-fichas --headless
:: 2. Sube: cronogramas → DATOS_SEACE y filas → SEACE_IMPORT + procesarImport
venv\Scripts\python python\actualizar_radar.py --subir descargas\_radar\payloads_<fecha>.json
```

Acciones del Apps Script que usa (requieren publicar la versión del 28/09/2026):

| Acción | Qué hace |
|---|---|
| `importarSeaceImport` (POST `{filas}`) | Agrega las filas a `SEACE_IMPORT` y ejecuta `procesarImport` (deduplica por clave de nomenclatura + fecha) |
| `getCronogramasSeace` (GET) | Fin de cada etapa de **todos** los procesos de `DATOS_SEACE` en una llamada; el Radar marca **hábil** si la presentación de ofertas (o, si falta, el registro) no venció |

Arreglos del 28/09/2026:

- **Paginación** (`scraping_por_entidad.py`, `hay_siguiente_pagina` / `ir_siguiente_pagina`): tomaba el primer
  paginador del documento (de otra tabla, deshabilitado) y buscaba `a.ui-paginator-next` cuando el SEACE usa
  `<span>`. Cortaba siempre en la página 1 (15 procesos). Ahora se limita a `dtProcesos` → ELSE 2026: 15 → 38.
- **Clasificación de empresa**: la sigla de la nomenclatura manda (`Utils.empresaDesdeSigla` en GAS,
  `empresaDesdeSigla` en `src/utils/telcom.ts`). El patrón `SUR.*ESTE` metía 288 procesos de SEAL ("Sur Oeste") en ELSE.
- **Clave de nomenclatura** (`Utils.claveNomenclatura`): los cruces de grupos, `DATOS_SEACE` y la deduplicación del
  import ya no dependen de espacios, guiones ni ceros a la izquierda.

## 9. Documentación desactualizada relacionada

- `docs/03-API-APPS-SCRIPT.md:6` cita un deployment ID viejo (`AKfycbxw1LhTtA…`).
- `docs/PLAN_ARQUITECTURA.md:474-499` describe una ruta y CLI antiguos de `scrape_competencia.py`; lo vigente es `python/run.py --grupo`.
- `SCRAPING-TELCOM/CLAUDE.md` §4 (`cd seace-scraper`) y §6.4 ("sin integración con Sheets") ya no aplican.
- Las citas de línea a `GOOGLE_APPS_SCRIPT.js` en los docs 01–05 están corridas unas ~20 líneas.
