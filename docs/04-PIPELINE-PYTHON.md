# 04 - Pipeline de Ingestion Python

Documento generado a partir del codigo fuente en `c:/PROGRAMACION/SEACE/python/` y del `README.md` del proyecto. Todas las citas apuntan al archivo y linea donde se puede verificar la afirmacion.

---

## 1. Resumen

El "Pipeline Python" de SEACE es una capa de ingesta y normalizacion de datos de contratacion publica peruana. Su objetivo principal es alimentar al resto del sistema (Google Sheets + Apps Script + Frontend React) con un indice maestro de procesos SEACE y sus detalles enriquecidos. Para lograrlo combina dos fuentes:

1. **API OCDS publica** de `contratacionesabiertas.oece.gob.pe` (`python/seace_ocds.py:44`, `python/ocds_downloader.py:34`, `python/generar_indice.py:28`) que expone los datasets masivos mensuales en formato Open Contracting Data Standard (OCDS).
2. **Scraping HTML con Selenium** del portal `prod2.seace.gob.pe` (`python/seace_scraper.py:11-19`, `python/config.py:21-23`), usado como fallback cuando se parte de un Excel exportado manualmente y se necesita cronograma o documentos detallados de la ficha de seleccion.

El resultado se materializa como CSVs en `data/output/` (p.ej. `OCDS_INDEX.csv`, `OCDS_INDEX_COMPLETO.csv`, `sheets_procesos.csv`) que luego se importan manualmente a Google Sheets (`README.md:259-272`). No existe scheduler automatizado: el `README.md:756-759` indica que la actualizacion del indice se hace "ejecutar script Python para sincronizar" bajo demanda cuando el gobierno publica un nuevo mes; no hay `cron`, ni GitHub Actions, ni systemd timer en el repositorio (grep sobre `python/` solo encontro la palabra "schedule" en el sentido de "cronograma" del dominio, no como scheduler de sistema).

---

## 2. Inventario de modulos

Archivos `.py` en `python/` (se excluye `__pycache__`).

| archivo | proposito | dependencias externas principales |
|---|---|---|
| `config.py` | Define rutas base (`BASE_DIR`, `DATA_DIR`, `INPUT_DIR`, `OUTPUT_DIR`, `CACHE_DIR`, `LOGS_DIR`), URLs de SEACE, rate limiting y mapeo de etapas. Crea automaticamente los directorios al importarlo. Ver `python/config.py:8-17`, `python/config.py:20-32`, `python/config.py:47-56`. | solo `pathlib`, `os` (stdlib) |
| `main.py` | CLI principal del flujo "Excel + scraping". Orquesta `ExcelProcessor` y `SeaceScraper` para producir un JSON enriquecido. Ver `python/main.py:11-13`, `python/main.py:16-131`, `python/main.py:134-175`. | `tqdm`, `argparse` |
| `excel_processor.py` | Carga Excel/CSV exportado del buscador SEACE, renombra columnas (`python/excel_processor.py:17-28`), extrae componentes de la nomenclatura (`python/excel_processor.py:122-154`) y detecta region por heuristica de nombre de entidad (`python/excel_processor.py:156-196`). | `pandas`, `openpyxl`, `re` |
| `seace_scraper.py` | Scraper Selenium del portal publico SEACE (`python/seace_scraper.py:25-49`). Busca por nomenclatura (`python/seace_scraper.py:82-140`), abre la ficha y extrae info general, entidad, procedimiento, cronograma, documentos y postores (`python/seace_scraper.py:142-393`). Usa cache JSON por 24 h (`python/seace_scraper.py:57-80`). | `selenium`, `webdriver-manager`, `beautifulsoup4`, `lxml`, `requests` |
| `ocds_downloader.py` | Descargador masivo OCDS por mes: pega al endpoint `/api/v1/file/{source}/json/{year}/{month}/`, descomprime ZIP, filtra por entidad y procesa records a un esquema plano (`python/ocds_downloader.py:31-255`, `python/ocds_downloader.py:258-329`). | `requests`, `zipfile`, `argparse` |
| `ocds_api.py` | Cliente OCDS basado en busqueda por `tenderTitle` / `buyerName` / OCID (`python/ocds_api.py:58-167`). El propio proyecto marca este endpoint como poco confiable y lo reemplaza por el de `ocds_api_client.py` (`python/ocds_api_client.py:10-13`). | `requests` |
| `ocds_api_client.py` | Cliente OCDS "v2" que usa `dataSegmentationID=YYYY-MM` + paginacion para recorrer todo un mes y filtra en memoria por entidad/nomenclatura (`python/ocds_api_client.py:27-167`, `python/ocds_api_client.py:197-238`). Incluye helpers especificos ELSE (`python/ocds_api_client.py:168-193`). | `requests`, `time` |
| `ocds_client.py` | Cliente "3 en 1": API directa por OCID + Selenium sobre la pagina web del portal + procesamiento de JSON descargado manualmente (`python/ocds_client.py:28-98`, `python/ocds_client.py:100-213`, `python/ocds_client.py:215-254`). | `requests`, `selenium`, `webdriver-manager` |
| `seace_ocds.py` | Cliente unificado y "canonico" mas reciente. Expone `get_by_ocid`, `get_by_tender_id`, `get_by_nomenclatura`, `search_by_dates`, `download_month`, `download_year`, `search_else`, y exporta a JSON y CSV (`python/seace_ocds.py:41-504`). Incluye CLI con `argparse` (`python/seace_ocds.py:508-563`). | `requests`, `zipfile`, `csv` |
| `procesar_json.py` | Procesa un JSON OCDS ya descargado manualmente (`json descargado.json` en la raiz) y lo convierte en un dict plano (`python/procesar_json.py:16-128`). Script de conveniencia para debugging. | stdlib |
| `generar_indice.py` | Genera el indice maestro `OCDS_INDEX.csv` consultando `/api/v1/records?dataSegmentationID=YYYY-MM` mes a mes y deduplicando por nomenclatura (`python/generar_indice.py:43-118`, `python/generar_indice.py:120-204`). Es el script clave que alimenta la hoja `OCDS_INDEX` en Sheets (`README.md:139-166`, `README.md:259-272`). | `requests`, `csv`, `argparse` |
| `export_sheets.py` | Convierte un JSON de procesos OCDS ya procesado en 5 CSVs con codificacion `utf-8-sig` listos para importar a Google Sheets: procesos, cronograma, postores, documentos e items (`python/export_sheets.py:20-171`). | `csv` |
| `test_api.py` | Smoke test unitario del endpoint `GET /records?tenderTitle=...` usando la nomenclatura `AS-SM-35-2024-ELSE-1` (`python/test_api.py:7-76`). Guarda el JSON completo en la raiz como `test_api_resultado.json`. | `requests` |
| `test_scraper.py` | Smoke test del scraper Selenium con la misma nomenclatura de referencia (`python/test_scraper.py:8-43`). No es un test `pytest`, es un script que imprime resultados y vuelca `test_resultado.json`. | solo importa `seace_scraper` |
| `requirements.txt` | Dependencias fijadas con version minima: `requests`, `beautifulsoup4`, `pandas`, `openpyxl`, `lxml`, `selenium`, `webdriver-manager`, `gspread`, `google-auth`, `python-dotenv`, `tqdm` (`python/requirements.txt:1-11`). Nota: `gspread` y `google-auth` estan listados pero no se importan en ningun modulo del pipeline. | n/a |

---

## 3. Pipeline end-to-end

El pipeline no es lineal: hay dos caminos de entrada que convergen en CSVs para Sheets.

### Camino A - OCDS bulk (el dominante, recomendado por el README)

1. **Obtener lista de meses disponibles** para un ano dado via `GET /api/v1/files?year=YYYY&source=seace_v3` (`python/generar_indice.py:31-41`, `python/ocds_downloader.py:44-64`).
2. **Descarga masiva por mes**. Dos estrategias coexisten:
   - *Por ZIP mensual:* `GET /api/v1/file/seace_v3/json/YYYY/MM/` descarga un ZIP con todo el mes. `seace_ocds.py:220-248` y `ocds_downloader.py:66-101` lo descomprimen en memoria con `zipfile.ZipFile(BytesIO(...))` y guardan el JSON extraido en `data/cache/{YEAR}-{MONTH}_seace_v3.json`.
   - *Por paginacion de records:* `GET /api/v1/records?sourceId=seace_v3&dataSegmentationID=YYYY-MM&page=N`, usada por `generar_indice.py:64-89` y `ocds_api_client.py:89-166`. Respeta `time.sleep(0.5)` entre paginas (`generar_indice.py:29`, `ocds_api_client.py:160`).
3. **Cache local en disco** por mes en `data/cache/{YEAR}-{MONTH}_seace_v3.json`. Si existe, se lee directamente (`generar_indice.py:45-57`, `seace_ocds.py:214-219`, `ocds_downloader.py:73-78`). El directorio `data/cache/` ya contiene archivos desde `2021-08` hasta `2025-12` (ver listado de `data/cache/`).
4. **Filtrado por entidad o por texto libre**. El filtro se aplica en memoria buscando el string (p.ej. "ELSE", "ELECTRO SUR ESTE") dentro de `compiledRelease.buyer.name` o `compiledRelease.tender.title` en mayusculas (`python/ocds_downloader.py:108-131`, `python/seace_ocds.py:255-267`, `python/generar_indice.py:101-105`).
5. **Normalizacion a esquema interno plano**. Los metodos `_process_record` / `process_record` / `_procesar_record` (duplicados en `ocds_downloader.py:133-255`, `ocds_api.py:169-284`, `ocds_api_client.py:242-346`, `ocds_client.py:258-374`, `seace_ocds.py:334-435`, `procesar_json.py:16-128`) extraen siempre los mismos campos: `ocid`, `tender_id`, `nomenclatura` (= `tender.title`), `descripcion`, `tipo_procedimiento`, `categoria`, `valor_referencial`, `moneda`, `fecha_publicacion`, `cronograma` (con `convocatoria_inicio/fin`, `consultas_inicio/fin`, `buena_pro`), `entidad` (nombre, RUC, direccion, departamento, telefono), `postores[]`, `ganador`, `monto_adjudicado`, `contrato{}`, `documentos[]`, `num_postores`, `num_documentos`.
6. **Deduplicacion**. En `generar_indice.py:168-175` se dedupea por nomenclatura manteniendo el record del ano mas reciente.
7. **Exportacion a CSV**. Dos salidas coexisten:
   - `generar_indice.py:177-192` genera `data/output/OCDS_INDEX.csv` (y segun el README tambien `OCDS_INDEX_COMPLETO.csv`, aunque en el codigo actual la variable `OUTPUT_FILE = OUTPUT_DIR / "OCDS_INDEX.csv"` esta hardcodeada en `generar_indice.py:25`; ver seccion 7).
   - `export_sheets.py:38-170` genera los 5 CSVs detallados (procesos, cronograma, postores, documentos, items) a partir de un JSON preprocesado.
8. **Importacion manual a Google Sheets**. No hay llamada automatica a Sheets API en ningun modulo Python (ni `gspread`, ni Apps Script desde Python). El flujo documentado en `README.md:259-272` es: abrir el CSV, Archivo > Importar desde Google Sheets hacia la hoja `OCDS_INDEX`, o copiar/pegar desde A2. La hoja resultante (`OCDS_INDEX`) es luego consumida por Google Apps Script (`README.md:62-70`, `README.md:756-759`) que sirve el backend al frontend React.

### Camino B - Excel SEACE + scraping de ficha (legacy)

1. El usuario descarga manualmente un `.xlsx` desde el buscador SEACE a `data/input/`.
2. `main.py:37-51` llama a `ExcelProcessor.cargar_excel()` (`excel_processor.py:33-60`) que renombra columnas, parsea fecha y valor, normaliza moneda y extrae sigla/tipo/anio de la nomenclatura.
3. `main.py:52-58` obtiene la lista de nomenclaturas unicas.
4. `main.py:63-89` ejecuta `SeaceScraper` en modo headless sobre cada nomenclatura: `buscar_proceso` navega al buscador avanzado y obtiene el UUID (`seace_scraper.py:82-140`); `extraer_ficha` carga la URL `fichaSeleccion.xhtml?id=UUID` y extrae cronograma, documentos, info entidad y postores con BeautifulSoup (`seace_scraper.py:142-219`).
5. El cronograma mapea los nombres crudos de etapas SEACE a codigos internos (`CONVOCATORIA`, `REGISTRO_PARTICIPANTES`, `CONSULTAS_OBSERVACIONES`, `ABSOLUCION_CONSULTAS`, `INTEGRACION_BASES`, `PRESENTACION_PROPUESTAS`, `CALIFICACION_EVALUACION`, `BUENA_PRO`) via `ETAPAS_MAPPING` en `config.py:47-56` usado en `seace_scraper.py:308-316`.
6. `main.py:94-110` mergea los dict del Excel con los del scraping (join por `nomenclatura`) y produce un JSON final en `data/output/seace_completo_{timestamp}.json` (`main.py:112-121`).
7. Ese JSON se puede pasar luego a `export_sheets.py` para obtener los CSVs "sheets_*.csv".

### Clasificaciones y transformaciones

- **Deteccion de region** por heuristica en el nombre de entidad: `excel_processor.py:156-196` mapea 25 departamentos con sinonimos (p.ej. `'CUSCO': ['CUSCO', 'ELECTRO SUR ESTE']`, `'LA LIBERTAD': [..., 'HIDRANDINA']`, `'PIURA': [..., 'ENOSA']`). Default silencioso a `'LIMA'` si no matchea (`excel_processor.py:196`).
- **Reconocimiento de empresas electricas** esta implicito en la tabla de regiones: ELSE (ELECTRO SUR ESTE = Cusco), ELECTROSUR/SEAL (Arequipa), HIDRANDINA (La Libertad), ENOSA (Piura), SEDAPAL (Lima) (`excel_processor.py:167-183`).
- **Normalizacion de moneda**: `excel_processor.py:111-120` mapea a `USD`, `EUR` o `PEN` (default).
- **Tipos de procedimiento**: no se clasifican en Python, se preservan tal cual vienen de `tender.procurementMethodDetails` (p.ej. `seace_ocds.py:414`) y el agrupamiento se hace despues en Sheets / Apps Script / frontend.
- **Extraccion de componentes de nomenclatura** via split por `-`: tipo, modalidad, numero, anio (4 digitos que empiezan con `20`), sigla_entidad, version (`excel_processor.py:122-154`).

### Indices generados

- `data/output/OCDS_INDEX.csv` (87 461 filas de datos segun `wc -l`) y `data/output/OCDS_INDEX_COMPLETO.csv` (124 338 filas) con columnas `NOMENCLATURA, TENDER_ID, OCID, ENTIDAD, DESCRIPCION, FECHA_ACTUALIZACION` (verificado con head de los dos archivos). Son los indices maestros que el frontend usa para resolver nomenclatura -> tender_id -> API OCDS (`README.md:126-135`, `README.md:751-759`).

---

## 4. Configuracion

Toda la configuracion vive en `python/config.py` y es estrictamente estatica (no hay lectura de `.env` pese a que `python-dotenv` aparece en `requirements.txt:10`).

### Rutas (`config.py:7-17`)

- `BASE_DIR = Path(__file__).parent.parent` -> resuelve a `c:/PROGRAMACION/SEACE/`.
- `DATA_DIR = BASE_DIR / "data"`, con subdirs `input/`, `output/`, `cache/`.
- `LOGS_DIR = BASE_DIR / "logs"`.
- Los directorios se crean al importar el modulo (`config.py:16-17`). `logs/` se crea pero ningun modulo escribe logs en disco; todo es `print()`.

### URLs SEACE (`config.py:20-32`)

- `BASE_URL = "https://prod2.seace.gob.pe"`.
- `BUSCADOR_URL` y `FICHA_URL` apuntan al buscador publico y a la ficha de seleccion de `seacebus-uiwd-pub`.
- `REQUEST_DELAY = 2` s entre requests (solo respetado por el scraper en `seace_scraper.py:471`). Los clientes OCDS usan sus propios sleeps de `0.3` o `0.5` s (`seace_ocds.py:184`, `ocds_api_client.py:160`, `generar_indice.py:29`, `generar_indice.py:67`).
- `MAX_RETRIES = 3`, `PAGE_LOAD_TIMEOUT = 30`, `REQUEST_TIMEOUT = 15`. `MAX_RETRIES` se define pero **nunca se usa** (no hay grep hits fuera de `config.py`).

### Credenciales Google Sheets (`config.py:35-44`)

- `SHEETS_CONFIG["CREDENTIALS_FILE"] = BASE_DIR / "credentials.json"`. El archivo **no esta presente en el repo** (el listado de raiz no lo muestra) y tampoco lo carga ningun modulo Python: `gspread` y `google-auth` aparecen en `requirements.txt` pero ningun `.py` del pipeline los importa. La integracion con Sheets es 100% manual (importar CSV).
- `SPREADSHEET_NAME = "SEACE_INTELLIGENCE"`.
- Hojas objetivo declaradas: `BD_PROCESOS`, `CRONOGRAMA`, `DOCUMENTOS`, `DATOS_SEACE` (`config.py:38-43`). Nota: la hoja real que alimenta el frontend segun el README es `OCDS_INDEX` (`README.md:62`, `README.md:108-116`), que **no** esta listada en `SHEETS_CONFIG["SHEETS"]`.

### Mapeo de etapas (`config.py:47-56`)

Diccionario `ETAPAS_MAPPING` con 8 etapas del cronograma SEACE a codigos internos en mayusculas. Consumido solo por `seace_scraper.py:309`.

---

## 5. Tests

No hay pytest ni framework de tests. Los dos archivos `test_*.py` son scripts imperativos de humo:

- **`test_api.py`** (`python/test_api.py:1-80`): hace un unico `requests.get` al endpoint `/api/v1/records?tenderTitle=AS-SM-35-2024-ELSE-1&page=1&paginateBy=10` (`test_api.py:12-23`), imprime OCID, nomenclatura, tipo, valor referencial, lista de postores, adjudicacion, contrato y documentos (`test_api.py:38-66`), y vuelca el `record` completo en `test_api_resultado.json` (`test_api.py:68-70`). No tiene aserciones. Cubre **solo el endpoint de busqueda por tenderTitle**, que el propio proyecto declara poco confiable (`ocds_api_client.py:10-13`).
- **`test_scraper.py`** (`python/test_scraper.py:1-46`): llama a `scrape_proceso("AS-SM-35-2024-ELSE-1")` con cache activo (`test_scraper.py:19`), imprime cronograma, documentos (top 5) e info de entidad (top 5), y guarda el JSON completo en `test_resultado.json`. Tampoco tiene aserciones ni cleanup. Su unico chequeo es `if resultado.get('success')` (`test_scraper.py:21`).

Cobertura real: ninguna de las funciones de `excel_processor.py`, `generar_indice.py`, `export_sheets.py`, `seace_ocds.py`, `ocds_downloader.py` o `ocds_client.py` esta cubierta por tests.

---

## 6. Archivos de salida

Contenido actual de `data/output/` (verificado por `ls`):

| archivo | filas | generado por | contenido |
|---|---|---|---|
| `OCDS_INDEX.csv` | 87 462 (incluye header) | `generar_indice.py:180-192` con `OUTPUT_FILE = OUTPUT_DIR / "OCDS_INDEX.csv"` (`generar_indice.py:25`). | `NOMENCLATURA, TENDER_ID, OCID, ENTIDAD, DESCRIPCION, FECHA_ACTUALIZACION`. Indice maestro deduplicado por nomenclatura, descripcion truncada a 200 chars (`generar_indice.py:190`). |
| `OCDS_INDEX_COMPLETO.csv` | 124 339 (incluye header) | Segun `README.md:163` es el output oficial de `generar_indice.py`, pero el codigo actual escribe siempre a `OCDS_INDEX.csv`. El archivo `OCDS_INDEX_COMPLETO.csv` probablemente se genero en una ejecucion previa con otro nombre o fue renombrado manualmente. Mismo esquema de columnas (verificado con head). |
| `api_else_dic2024.json` | - | `ocds_api_client.py:382-385`: guarda el resultado del test 3 del `main()` (`search_by_month(2024, 12, filter_nomenclatura="ELSE")`). |
| `else_dic2024_documentos.csv` / `_postores.csv` / `_procesos.csv` | - | Probablemente generados via `seace_ocds.export_csv(procesos, "else_dic2024")` (`seace_ocds.py:449-503`) o via `export_sheets.py` con prefijo distinto. El codigo genera exactamente esas 3 CSVs con esos nombres segun `seace_ocds.py:456-500`. |
| `ocds_2024_ELSE.json` | - | `ocds_downloader.py:318-327` construye el nombre como `ocds_{year}_{entidad}.json` y guarda todos los procesos procesados de un ano. |
| `seace_documentos.csv` / `seace_postores.csv` / `seace_procesos.csv` | - | `seace_ocds.py:456-500` con prefijo default "seace" cuando se invoca `export_csv` sin argumento (ver `seace_ocds.py:560`). |
| `sheets_cronograma.csv` / `sheets_documentos.csv` / `sheets_items.csv` / `sheets_postores.csv` / `sheets_procesos.csv` | - | `export_sheets.py:38-169` con `output_prefix = OUTPUT_DIR / "sheets"` por default (`export_sheets.py:32-33`). Son los 5 CSVs listos para importar. |

Encoding siempre `utf-8-sig` (BOM) para compatibilidad con Google Sheets (verificable en `export_sheets.py:40`, `export_sheets.py:84`, `export_sheets.py:106`, `export_sheets.py:127`, `export_sheets.py:146`, `seace_ocds.py:457`, `seace_ocds.py:477`, `seace_ocds.py:491`, `generar_indice.py:180`).

---

## 7. Debilidades

Observaciones concretas leyendo el codigo.

### Credenciales y configuracion

- **`SHEETS_CONFIG["CREDENTIALS_FILE"]` apunta a un archivo que no existe y no se usa** (`config.py:36`). El proyecto ni siquiera llama a la Sheets API desde Python; `gspread` y `google-auth` son dependencias muertas en `requirements.txt:8-9`. Riesgo: desarrollador nuevo asume que puede hacer push automatico a Sheets cuando en realidad todo es copia manual.
- `python-dotenv` esta en `requirements.txt:10` pero **ningun modulo lo importa**; no hay soporte de `.env` ni de variables de entorno. Todo es literal-en-codigo.
- **Hojas objetivo inconsistentes**: `config.py:38-43` declara `BD_PROCESOS, CRONOGRAMA, DOCUMENTOS, DATOS_SEACE`, pero el sistema real que describe el README usa `OCDS_INDEX` (`README.md:62`, `README.md:126-135`). El diccionario `SHEETS_CONFIG["SHEETS"]` esta obsoleto.

### Paths hardcodeados a Windows

- `config.py:8` asume que el modulo vive a dos niveles dentro de un proyecto montado en Windows, y el `README.md:265` y `generar_indice.py:22` asumen explicitamente `c:\PROGRAMACION\SEACE`. Funciona en Linux/Mac solo de casualidad por `Path` de `pathlib`. Nada es portable entre maquinas.
- `procesar_json.py:137` espera encontrar un archivo llamado literalmente `json descargado.json` (con espacio) en la raiz del proyecto. Ver tambien `ocds_client.py:425`.

### Duplicacion masiva del procesador de records

- La funcion que transforma un `record` OCDS en el dict plano interno esta **copiada y pegada al menos 6 veces** con pequenas variaciones: `ocds_downloader.py:133-255`, `ocds_api.py:169-284`, `ocds_api_client.py:242-346`, `ocds_client.py:258-374`, `seace_ocds.py:334-435`, `procesar_json.py:37-128`. Cualquier cambio de esquema OCDS necesita tocar las seis. `seace_ocds.py` parece la version canonica segun su header (`seace_ocds.py:1-26`), pero nadie mas la reusa.

### Manejo de errores

- **Excepciones tragadas silenciosamente**. `seace_scraper.py:97-104` hace `except: pass` bare (mala practica: captura `SystemExit`, `KeyboardInterrupt`). Igual en `seace_scraper.py:390-391` con el extractor de postores: cualquier fallo se convierte en "lista vacia" sin log. `generar_indice.py:39-41` degrada silenciosamente a lista vacia ante cualquier excepcion de red.
- **Sin reintentos**. `config.py:27` define `MAX_RETRIES = 3` pero **nunca se usa**. Ningun cliente tiene backoff exponencial; un 500 transitorio en OCDS aborta el scrape del mes (`ocds_downloader.py:311-312`, `ocds_api_client.py:162-164`, `generar_indice.py:80-82`).
- **`raise_for_status()` sin try** en `ocds_downloader.py:61`, `ocds_downloader.py:84`: si la API falla, la excepcion sube hasta el CLI sin mensaje amigable.
- **Rate limiting inconsistente**. El REQUEST_DELAY global es 2 s (`config.py:27`) pero los clientes OCDS usan 0.3 s (`seace_ocds.py:184`), 0.5 s (`ocds_api_client.py:160`, `generar_indice.py:29`, `ocds_client.py:211`). Probable saturacion del endpoint en descargas largas.

### Bug concreto en `generar_indice.py`

- `generar_indice.py:25` tiene `OUTPUT_FILE = OUTPUT_DIR / "OCDS_INDEX.csv"` hardcodeado, pero el `README.md:163` promete que el output se llama `OCDS_INDEX_COMPLETO.csv`. El archivo `OCDS_INDEX_COMPLETO.csv` existente en `data/output/` probablemente proviene de una version anterior del script o fue renombrado a mano. Divergencia entre codigo y documentacion.
- `generar_indice.py:130` define `years = [2022, 2023, 2024, 2025]` cuando se pasa `--all`, dejando **2021 fuera** aunque el README (`README.md:281-288`) promete datos desde 2021.

### Cache fragil

- `seace_scraper.py:66-70` valida el cache con `datetime.fromisoformat(data.get('_cache_time', '2000-01-01'))`. Si el archivo se serializo mal o viene de otra version, crashea en import.
- `ocds_api.py:44-46` y otros usan `"_cache_time"` como key hibrida dentro del payload: si el consumidor itera `data.values()`, encuentra un ISO datetime donde esperaba records.
- El cache de `generar_indice.py` **no tiene expiracion** (`generar_indice.py:47-57`): si un mes se descargo incompleto, queda corrupto hasta borrado manual.

### Concurrencia y performance

- Todo el scraping es **sequencial**: `main.py:66-89` itera sobre nomenclaturas una por una con Selenium + `time.sleep`. Para un Excel con 500 procesos, tarda horas.
- `seace_scraper.py:49` arranca un Chrome nuevo via `webdriver-manager` que descarga el driver cada vez que no esta cacheado, sumando latencia.

### Seguridad

- `seace_scraper.py:46` fija un User-Agent estatico que identifica el scraper; no rota. `ocds_downloader.py:42` identifica `SEACE-Downloader/1.0`. Si el portal bloquea por UA, queda todo frenado.
- Ningun modulo valida el tamano del ZIP recibido en `download_month` (`seace_ocds.py:226-242`, `ocds_downloader.py:83-97`): una respuesta de 2 GB se carga entera en memoria via `BytesIO`.

### Tests

- Solo 2 scripts de humo sin aserciones, ambos usan la misma nomenclatura fija `AS-SM-35-2024-ELSE-1` (`test_api.py:15`, `test_scraper.py:14`). No hay cobertura de los transformadores, del parser de nomenclaturas, ni del filtro por entidad. Un cambio de schema OCDS pasaria sin alarmar.

---

### Referencias cruzadas al README principal

- Arquitectura general del flujo OCDS: `README.md:96-120`.
- Estructura de `OCDS_INDEX` en Sheets: `README.md:126-135`.
- Uso de `generar_indice.py`: `README.md:139-166`.
- Procedimiento manual de importacion a Sheets: `README.md:259-272`.
- Datos disponibles por ano: `README.md:279-290`.
- Rol del pipeline Python dentro del sistema completo: `README.md:751-772`.
