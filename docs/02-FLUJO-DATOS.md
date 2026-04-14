# 02. Flujo de datos end-to-end de SEACE

Documento que traza el recorrido de los datos desde las fuentes externas (API OCDS del Estado Peruano, usuario manual) hasta el pixel que ve el usuario en el navegador. Las rutas citadas son absolutas respecto al repo; los `file:line` apuntan al código exacto en el momento de redacción.

---

## 1. Diagrama textual

```
                                   +---------------------+
                                   |   Usuario manual    |
                                   |  (edita SEGUIMIENTO |
                                   |   y BD_PROCESOS en  |
                                   |   Google Sheets)    |
                                   +----------+----------+
                                              |
                                              v
 +-------------+   +------------------+   +------------------+   +---------------------+   +-------------+   +--------+
 |  OCDS API   |-->|  Python scripts  |-->|  Google Sheets   |<->|  Google Apps Script |<->|  React app  |-->|  User  |
 |  OECE Peru  |   | (generar_indice, |   |  (BD_PROCESOS,   |   |  (web app Router /  |   |  (Vite+TS,  |   |        |
 |  /api/v1    |   |  procesar_json,  |   |   SEGUIMIENTO,   |   |   doGet / doPost)   |   |   Zustand)  |   |        |
 |             |   |  export_sheets,  |   |   OCDS_INDEX,    |   |                     |   |             |   |        |
 |             |   |  seace_scraper)  |   |   DOCUMENTOS,    |   |                     |   |             |   |        |
 |             |   |                  |   |   HISTORICOS...) |   |                     |   |             |   |        |
 +-------------+   +------------------+   +--------+---------+   +----------+----------+   +------+------+   +--------+
                                                   |                        |                      |
                                                   v                        v                      v
                                           +---------------+        +---------------+      +--------------------+
                                           | Google Drive  |<-------| DriveApp      |      | Gemini API         |
                                           | (carpetas por |        | (crea / lista |      | (chat IA, analisis,|
                                           |  nomenclatura)|        |  archivos)    |      |  vision OCR)       |
                                           +---------------+        +---------------+      +--------------------+
```

Hay dos caminos paralelos hacia las hojas:
- Ingesta batch automatizada: `python/` descarga de OCDS API y produce CSVs que un operador pega en las hojas.
- Ingesta reactiva: el Apps Script, a peticion del frontend, golpea la OCDS API en tiempo real (`OCDS_API.getProceso`) y puede reescribir filas de `SEGUIMIENTO` / `HISTORICOS_DETALLE`.

El usuario manual puede editar `BD_PROCESOS` o `SEGUIMIENTO` directamente en la UI de Sheets, bypassa el frontend y genera inconsistencias hasta que la cache expira (ver seccion 5).

---

## 2. Capa por capa

### 2.1 Fuente OCDS (OECE Peru)

- **Que hace**: expone JSON con releases / records de contrataciones publicas en `https://contratacionesabiertas.oece.gob.pe/api/v1` (endpoints `/releases`, `/release`, `/records`, `/record`, `/files`, declarados en `GOOGLE_APPS_SCRIPT.js:52-67`).
- **Entradas**: identificadores `sourceId` (`seace_v3`, `seace_v2`), `tenderId`, `year`, `month`, `entidad`.
- **Salidas**: JSON con `records[].compiledRelease` que contiene `tender`, `parties`, `contracts`, `documents`, `planning.milestones`.
- **Friccion**: rate limit declarado en `RATE_LIMIT_MS: 1000` y `MAX_RETRIES: 3` (`GOOGLE_APPS_SCRIPT.js:65-66`). En Python se usa `RATE_LIMIT = 0.5` segundos (`python/generar_indice.py:29`), que puede generar 429 ocasionales.

### 2.2 Scripts Python de ingestion

- **Que hace**: son herramientas CLI operadas manualmente para poblar hojas y caches locales.
- **Archivos clave**:
  - `python/main.py:16-131` orquesta: carga Excel exportado de SEACE + scrapea fichas y exporta JSON final a `data/output/`.
  - `python/excel_processor.py` (carga `.xlsx` y normaliza).
  - `python/seace_scraper.py` (Selenium/requests contra SEACE; `SeaceScraper` context manager usado en `python/main.py:66`).
  - `python/ocds_api_client.py`, `python/ocds_downloader.py`, `python/ocds_client.py` (clientes OCDS).
  - `python/generar_indice.py:1-25` construye `data/output/OCDS_INDEX.csv` que el operador pega en la hoja `OCDS_INDEX`. Usa cache en disco en `data/cache/{year}-{month}_seace_v3.json` (`python/generar_indice.py:45-50`).
  - `python/export_sheets.py:20-49` convierte un JSON OCDS consolidado en multiples CSVs (`_procesos.csv`, `_cronograma.csv`, `_postores.csv`, `_documentos.csv`) con headers que replican los de `BD_PROCESOS`.
  - `python/procesar_json.py:16` (`procesar_ocds_json`) normaliza JSON OCDS crudo.
- **Entradas**: Excel exportado del SEACE o respuesta cacheada de OCDS.
- **Salidas**: CSV/JSON en `data/output/` que se pegan manualmente en las hojas. No hay subida automatica a Google Sheets.
- **Friccion**:
  - No existe una capa de `EMPRESA_CORTA`, `ESTADO_FECHA`, `TIPO_SERVICIO` en los scripts Python actuales; esas columnas (`GOOGLE_APPS_SCRIPT.js:85-87`) las calcula el backend Apps Script (hay funciones `clasificar*` referenciadas cerca de la linea 580). Pero el comentario en `BD_COLS` dice "del script Python" (`GOOGLE_APPS_SCRIPT.js:84`), inconsistencia documental.
  - Ingesta manual: si el operador olvida re-pegar los CSVs, `BD_PROCESOS` queda desactualizado y la UI muestra datos viejos hasta que alguien corre Python + copia/pega.
  - Dos pipelines paralelos Python + Apps Script llegando a `OCDS_INDEX`, sin locking (`actualizarIndiceOCDS` en `GOOGLE_APPS_SCRIPT.js:741` hace lo mismo en Apps Script).

### 2.3 Google Sheets como base de datos

- **Que hace**: almacenamiento tabular. Las hojas con nombres declarados en `GOOGLE_APPS_SCRIPT.js:26-41`:
  - `SEACE_IMPORT` (buffer crudo del Excel oficial).
  - `BD_PROCESOS` (fuente de verdad de procesos, columnas en `GOOGLE_APPS_SCRIPT.js:70-88`).
  - `SEGUIMIENTO` (procesos marcados + cronograma ampliado con columnas `<ETAPA>_ESTADO`, `<ETAPA>_NOTAS`, `<ETAPA>_<AÑO>_INICIO/FIN/LINK` para 2021-2025, ver construccion en `GOOGLE_APPS_SCRIPT.js:1086-1119`).
  - `CRONOGRAMA`, `DOCUMENTOS`, `POSTORES` (sub-tablas por nomenclatura).
  - `FILTROS_ENTIDADES`, `FILTROS_PALABRAS`, `FILTROS_EMPRESAS_ELECTRICAS` (configuracion de UI persistida).
  - `REGIONES` (lookup).
  - `GRUPOS_HISTORICOS` + `HISTORICOS_DETALLE` (agrupamiento de una misma licitacion a traves de anios).
  - `OCDS_INDEX` (mapa ligero `nomenclatura -> tender_id -> ocid`).
  - `DATOS_SEACE` (resultado de scraping almacenado).
- **Entradas**: escritura via Apps Script (`sheet.appendRow`, `setValue`) y via Python (copy/paste del operador).
- **Salidas**: `sheet.getDataRange().getValues()` en los modulos `Procesos`, `Seguimiento`, etc.
- **Friccion**:
  - No hay esquema validado; si el operador pega un CSV con columnas desordenadas, `BD_COLS` se rompe silenciosamente.
  - Sheets es single-writer: si Apps Script esta escribiendo `SEGUIMIENTO` y el usuario tiene abierta la hoja, se pisan cambios.

### 2.4 Google Apps Script (web app / backend)

- **Que hace**: expone una web app publica (`doGet`, `doPost`) que sirve como API REST desde React. Toda URL es del tipo `.../exec?action=<nombre>&param=valor`.
- **Archivos clave** (todos en `GOOGLE_APPS_SCRIPT.js`):
  - `doGet` en `:590-610` y `doPost` en `:615-652` parsean `action` y delegan en `Router.handle`.
  - `Router.handle` en `:657-768` contiene un mapa literal de rutas (`routes = {...}`) con 50+ acciones y enrutado a modulos (`Procesos.getAll`, `Seguimiento.add`, `OCDS_API.getProceso`, `Drive.crearCarpetaProceso`, `HistoricosDetalle.getComparativa`, etc.).
  - Acepta POST o GET indistintamente (`method: 'ANY'`) para casi todas las mutaciones.
  - Soporta cargas complejas inline por medio del parametro especial `data` serializado como JSON (`:659-674`).
  - Modulos por responsabilidad: `Procesos` (`:773-899`), `Seguimiento` (`:1065-1300`), `Cronograma`, `Documentos`, `Drive`, `Postores` (`:1700-1825`), `OCDS_API`, `OCDS_INDEX`, `HistoricosDetalle`, `SeguimientoV2`, `EmpresasElectricas`.
- **Entradas**: query string + `e.postData.contents` JSON. Ver merge de parametros en `:628-634`.
- **Salidas**: `ContentService.createTextOutput(JSON.stringify(result)).setMimeType(JSON)`. No hay CORS preflight: el frontend siempre usa `GET` (ver `src/services/api.ts:87-91`).
- **Friccion**:
  - `doPost` casi no se usa porque el frontend fuerza GET por CORS (`src/services/api.ts:60-90`), asi que mutaciones grandes viajan como `?data=<JSON largo>` con riesgo de tope de URL.
  - No hay autenticacion; quien conozca la URL puede escribir.
  - Cualquier error se aplana a `Utils.errorResponse(error.message)` con HTTP 200; el cliente debe leer `success: false` en el body.
  - Timeouts: `doGet` loggea el response time pero Apps Script tiene un limite duro de 6 min.

### 2.5 React app (frontend)

- **Que hace**: SPA con Vite + React 19 + Zustand + Tailwind. Renderiza vistas lazy-loaded (Dashboard, ProcesosTable, PeruMap, AIChat, OCDSTester, SeguimientoDetalleCompleto) segun `vistaActiva`.
- **Archivos clave**:
  - Entry point `src/App.tsx:19-67`: wrapping con `Layout`, `Suspense`, y switch sobre `vistaActiva` (`src/App.tsx:36-55`). Dispara `cargarTodo()` en `useEffect([])` (`src/App.tsx:26-28`).
  - Estado global `src/store/useStore.ts:154-600` (un unico `create(persist(...))`). Acciones: `cargarTodo` (`:353-365`), `cargarProcesos` (`:186-224`), `agregarSeguimiento` (`:514-535`), `aplicarFiltros` (`:381-488`).
  - Capa API `src/services/api.ts`: `fetchAPI` generico (`:45-121`), helpers tipados por accion (`:125-243`, `:259-479`, `:720-796`, `:811-1023`, `:1085-1117`).
  - Capa cache `src/services/cache.ts`: `MemoryCache` + hidratacion desde IndexedDB (`:78-95`, `:266-311`), `cachedFetch` con soporte SWR (`:352-389`), invalidadores por dominio (`:391-419`), exposicion debug en `window.__seaceCache` (`:457-460`).
  - Hooks `src/hooks/useCachedData.ts`: wrapper generico `useCachedData` (`:44-123`) y hooks especificos (`:130-262`), plus `useOptimizedInitialLoad` (`:277-330`). Coexiste con el store: hay duplicacion de responsabilidad.
  - IA `src/services/gemini.ts`: singleton `geminiService` con rotacion de 13 API keys hardcodeadas (`:6-20`), llama `@google/genai` directamente desde el navegador.
- **Entradas**: URL del Apps Script inyectada desde `import.meta.env.VITE_API_URL` o desde el store (`src/services/api.ts:41`). Si esta vacia, se activa modo demo con `DATOS_PRUEBA` (`src/services/api.ts:714-716`).
- **Salidas**: JSX renderizado + localStorage (`seace-store`) + IndexedDB (`seace-cache`) + peticiones HTTP al Apps Script.
- **Friccion**:
  - API keys de Gemini incrustadas en el bundle (`src/services/gemini.ts:6-20`). Cualquiera puede extraerlas del JS publico.
  - Dos capas de cache: Zustand `persist` y `apiCache` en IndexedDB. Se pueden desincronizar (ver seccion 5).
  - `fetchAPI` convierte todos los POST en GET para evadir CORS, cargando el payload como `?data=...` (`src/services/api.ts:60-81`). Payloads grandes (ej. uploads de base64) pueden superar los ~8 KB de URL aceptados por Apps Script / proxies.
  - `cargarProcesos` captura cualquier error y cae a `DATOS_PRUEBA` (`src/store/useStore.ts:214-223`). El usuario puede pensar que ve datos reales cuando en realidad ve los 8 ejemplos hardcodeados.

### 2.6 Usuario

- **Entradas**: click sobre tabla, filtros, seguimiento, chat IA. Persisten preferencias en `apiUrl`, `filtros`, `mensajesChat` via Zustand `persist` (`src/store/useStore.ts:578-598`).
- **Salidas**: mutaciones que viajan por `api.*` y terminan escribiendo a Sheets.

---

## 3. Rutas de datos principales

### 3.1 Cargar lista de procesos (app abierta -> tabla visible)

1. `main.tsx` monta `<App />`; `App` lee `vistaActiva` y `cargarTodo` del store (`src/App.tsx:19-28`).
2. `useEffect([])` ejecuta `cargarTodo()` (`src/App.tsx:26-28`).
3. `useStore.cargarTodo` (`src/store/useStore.ts:353-365`) lanza en paralelo `cargarProcesos`, `cargarEstadisticas`, `cargarRegiones`, `cargarFiltros`, `cargarSeguimiento`, `cargarEntidadesUnicas`.
4. `cargarProcesos` (`src/store/useStore.ts:186-224`):
   a. Si `api.useDatosPrueba()` devuelve true (no hay URL configurada, `src/services/api.ts:714-716`), usa `DATOS_PRUEBA` y termina.
   b. Si no, llama `cachedFetch('getProcesos', undefined, () => api.getProcesos())` (`src/services/cache.ts:352-389`).
5. `cachedFetch` genera `requestKey`, revisa `apiCache.peekEntry`:
   - HIT fresco -> devuelve `entry.data` (`src/services/cache.ts:370-377`).
   - HIT expirado + SWR -> devuelve data stale, revalida en background.
   - MISS o forceRefresh -> llama `runFetch`, que deduplica con `inFlightRequests` y al resolver llama `apiCache.set('getProcesos', undefined, data)` (`src/services/cache.ts:326-350`). El TTL por defecto para `getProcesos` es 10 minutos (`src/services/cache.ts:32`).
6. `api.getProcesos` (`src/services/api.ts:125-143`) invoca `fetchAPI<ProcesosResponse>('getProcesos', params)` que construye `${API_BASE_URL}?action=getProcesos` y hace `fetch(url, { method: 'GET', redirect: 'follow' })` (`src/services/api.ts:87-91`).
7. El Apps Script recibe la peticion en `doGet` (`GOOGLE_APPS_SCRIPT.js:590-610`) y delega en `Router.handle('getProcesos', params, 'GET')`.
8. `Router.handle` mapea a `Procesos.getAll` (`GOOGLE_APPS_SCRIPT.js:678`).
9. `Procesos.getAll` (`GOOGLE_APPS_SCRIPT.js:777-793`) lee `BD_PROCESOS` completo via `sheet.getDataRange().getValues()`, convierte filas a objetos con `Utils.rowsToObjects`, aplica filtros opcionales (`_aplicarFiltros`, `:816-890`) y retorna `{ success, total, procesos }`.
10. `doGet` serializa como JSON y lo devuelve como `ContentService.TextOutput` con mime JSON.
11. En el cliente, `fetchAPI` parsea el body y retorna el objeto (`src/services/api.ts:114-116`).
12. `cachedFetch` persiste el resultado: `apiCache.set` escribe en memoria y llama `writeToIDB` (`src/services/cache.ts:162-165, 226-242`) para durabilidad en la proxima sesion.
13. `cargarProcesos` llama `buildIndices(response.procesos)` (`src/store/useStore.ts:110-152`) y hace `set({ procesos, procesosFiltrados, ...indices, cargando: false })`.
14. Los componentes suscritos (ej. `ProcesosTable`) se rerenderizan con `procesosFiltrados`. La tabla aplica filtros locales via `aplicarFiltros` (`src/store/useStore.ts:381-488`), que intenta usar los indices `by*` para cortar el dataset antes de recorrer en linear time.
15. El usuario ve pixel. En recargas subsecuentes el camino rapido es: `apiCache` se hidrata desde IndexedDB al crear el singleton (`src/services/cache.ts:104-106, 266-311`), `cachedFetch` devuelve HIT sincrono y la tabla aparece sin spinner.

### 3.2 Agregar a seguimiento (click -> Sheets + Drive + OCDS)

1. Un componente llama `agregarSeguimiento(nomenclatura, estado, prioridad, notas)` del store (`src/store/useStore.ts:514-535`).
2. El store invoca `api.addSeguimientoConOCDS(nomenclatura, estado, prioridad, notas, true)` (`src/services/api.ts:281-376`).
3. `addSeguimientoConOCDS` orquesta tres pasos:
   a. `getProcesoOCDS(nomenclatura)` (`src/services/api.ts:925-931`) -> `fetchAPI('getProcesoOCDS', { nomenclatura })` -> Apps Script `OCDS_API.getProceso` (`GOOGLE_APPS_SCRIPT.js:696`). El backend consulta `OCDS_INDEX` para resolver `tender_id` y luego golpea la API OCDS en vivo.
   b. `addSeguimientoCompleto(..., crearCarpeta: 'true')` (`src/services/api.ts:259-272`) -> action `addSeguimiento` -> `Seguimiento.add` (`GOOGLE_APPS_SCRIPT.js:1153-1198`). Aqui el backend:
      - Valida que la fila no exista iterando `data[i][0]` (`:1160-1165`).
      - Llama `Drive.crearCarpetaProceso({ nomenclatura, entidad })` (`:1170-1181`). Si se cumple, retorna `carpetaInfo.url`.
      - Trae datos del proceso con `Procesos.getByNomenclatura` (`:1184`).
      - Construye la fila con `_buildSeguimientoRow` (`:1203-1224`) que inicializa todas las columnas de etapas en `PENDIENTE`.
      - Ejecuta `sheet.appendRow(newRow)` en `SEGUIMIENTO`.
      - Devuelve `{ success, carpetaUrl, driveError }`.
   c. Si hay datos OCDS, el cliente dispara varios `updateEtapaSeguimiento` (`src/services/api.ts:312-353, 454-479`) por cada etapa conocida (CONVOCATORIA, CONSULTAS_OBSERVACIONES, BUENA_PRO). Cada llamada es un request separado al Apps Script (`Seguimiento.updateEtapa`, ruteado en `GOOGLE_APPS_SCRIPT.js:710`).
4. Al volver, el store invalida cache: `cacheInvalidators.onSeguimientoChange()` (`src/store/useStore.ts:530`) borra `getSeguimiento` y `getSeguimientoDetalle` de `apiCache` y `idbCache` (`src/services/cache.ts:193-197, 392-394`).
5. El store llama `get().cargarSeguimiento()` (`src/store/useStore.ts:531`), que pasa por `cachedFetch('getSeguimiento', ...)` (TTL corto de 2 min, `src/services/cache.ts:35`). Como acaba de invalidar, fuerza un fetch real.
6. `Seguimiento.getAll` (`GOOGLE_APPS_SCRIPT.js:1067-1126`) materializa objetos anidados por etapa con columnas `<ETAPA>_<AÑO>_INICIO/FIN/LINK`.
7. El store escribe `seguimiento` y las vistas de la pestaña `seguimiento` (ej. `SeguimientoView` en `src/App.tsx:69`) se rerenderizan con la fila nueva y, si llegaron datos OCDS, los cronogramas reales ya estan en COMPLETADO. Ademas el icono de carpeta Drive apunta a la URL recien creada (`src/App.tsx:279-290`).
8. Friccion: `addSeguimientoConOCDS` realiza hasta 5 peticiones secuenciales (getProcesoOCDS + addSeguimiento + 3x updateEtapaSeguimiento). No es transaccional: un error a mitad deja una fila sin etapas, otro deja la fila creada pero la cache desincronizada.

### 3.3 Buscar historico de un proceso

El "historico" vive en dos capas distintas y se decide en tiempo de uso:

1. **Capa cliente heuristica** (`src/utils/historicos.ts:61-95`): `buscarHistoricos(procesoActual, todosProcesos, umbral)` recorre `todosProcesos` (del store) y filtra por misma `ENTIDAD`, mismo `OBJETO`, fecha anterior, y similitud Jaccard de palabras clave sobre `DESCRIPCION`. Devuelve `ProcesoHistorico[]`. Esta busqueda es in-memory, sin red.
2. `ProcesoHistoricos.tsx` (`src/components/proceso/ProcesoHistoricos.tsx`) usa ese helper (`:461`) via `useMemo` y muestra agrupado por ano (`agruparPorAño`, `:56-58`).
3. Cuando el usuario confirma un historico (boton), el componente llama `crearGrupoHistorico(nomenclaturaActual, [nomenclaturasHistoricos], entidad, notas)` (`src/services/api.ts:734-751`). Eso pega `?action=crearGrupoHistorico&data=<JSON>` al Apps Script, que ejecuta `GruposHistoricos.crear` (ruteado en `GOOGLE_APPS_SCRIPT.js:732`) y graba en la hoja `GRUPOS_HISTORICOS` (con posible efecto lateral: crear carpeta en Drive, ver handler `Drive.crearCarpetaGrupoHistorico` en `:737`).
4. **Capa backend persistida**: para un proceso ya agrupado, el cliente llama `getGrupoByNomenclatura` (`src/services/api.ts:729-732`) -> Apps Script `GruposHistoricos.getByNomenclatura` (`:693`). Esta respuesta cachea con TTL 24h (`src/services/cache.ts:41`).
5. **Comparativa rica**: `getComparativaHistoricos(nomenclatura)` (`src/services/api.ts:1110-1117`) -> `HistoricosDetalle.getComparativa` (`:753`). Lee de `HISTORICOS_DETALLE` y devuelve un `ComparativaHistoricos` con arrays paralelos por ano. Este blob tambien alimenta el analisis de IA (`geminiService.generarAnalisisComparativoHistoricos`, `src/services/gemini.ts:567-685`).
6. **Sincronizacion OCDS de historicos**: botones como "sincronizar grupo" llaman `sincronizarGrupoHistorico` (`src/services/api.ts:1026-1048`), que en el backend itera cada nomenclatura del grupo y vuelve a pedir datos a la API OCDS.
7. Friccion: hay tres fuentes potenciales para historicos (`BD_PROCESOS` via heuristica, `GRUPOS_HISTORICOS`, `HISTORICOS_DETALLE`). Si el usuario crea un grupo pero no dispara la sincronizacion OCDS, el detalle queda vacio y la comparativa IA no tiene nada que mostrar.

### 3.4 Chat IA (construccion de contexto para Gemini)

1. El usuario hace click en un proceso en la tabla y marca checkbox; eso dispara `toggleProcesoSeleccionado(id)` en el store (`src/store/useStore.ts:494-503`). El estado `procesosSeleccionados: number[]` almacena solo IDs.
2. Abre el panel chat (`setChatAbierto`, `src/store/useStore.ts:568`). `AIChat` (`src/components/ai/AIChat.tsx:20`) se suscribe a `procesosSeleccionados` y a `procesos`.
3. En cada render calcula `procesosContexto = procesos.filter(p => procesosSeleccionados.includes(p.ID))` (`src/components/ai/AIChat.tsx:43-45`).
4. Al enviar, `enviarMensaje` (`src/components/ai/AIChat.tsx:47-84`) llama `geminiService.chatContextual(mensaje, procesosContexto)` (`:63`).
5. `chatContextual` (`src/services/gemini.ts:201-219`) toma los primeros **10** procesos y los serializa como lista bullet con `NOMENCLATURA`, `DESCRIPCION`, `ENTIDAD`, `VALOR`. El prompt base declara el rol ("experto en contrataciones publicas del Peru (SEACE)") y pide respuesta markdown. Es un unico turn request-response sin memoria mas alla del contexto inmediato (no envia el historial `mensajesChat`).
6. `GeminiService.call` (`src/services/gemini.ts:35-71`) rota entre las 13 `API_KEYS` en cada intento (`getNextKey`), reintenta hasta 3 veces si detecta 429/quota, y falla con el ultimo error en otro caso. Usa el SDK `@google/genai` con modelo `gemini-2.5-flash` (`:22, :42-47`).
7. Otros comandos rapidos construyen contextos alternativos:
   - `/analizar` con 1 proceso -> `analizarProceso(proceso)` genera un prompt muy estructurado (`src/services/gemini.ts:75-117`).
   - `/comparar` -> `compararProcesos(procesos)` enumera los seleccionados (`:121-158`).
   - `/resumen` -> genera estadisticas rapidas + muestra de 10 (`:223-276`).
   - Vision OCR (`extraerDatosSEACE`) no se dispara desde el chat sino desde la captura manual de historicos; valida y comprime a 2048px antes de enviar como `inlineData` base64 (`src/services/gemini.ts:280-457, 460-548`).
8. La respuesta de Gemini regresa como texto markdown, se agrega al store via `agregarMensajeChat` (`src/store/useStore.ts:570-574`) y persiste en localStorage (solo los ultimos 50 mensajes, `src/store/useStore.ts:583`).
9. Friccion: `chatContextual` corta en 10 procesos; si el usuario selecciona 200, 190 se ignoran silenciosamente. Ademas no se mandan historicos ni cronogramas, asi que el chat no "sabe" de datos OCDS aunque esten cargados.

---

## 4. Estado en el cliente

SEACE opera cuatro capas de estado concurrentes. Entender cual vive donde es clave porque hay duplicaciones deliberadas.

### 4.1 Zustand store (`src/store/useStore.ts`)

Todo el grafo en memoria activa esta en `useStore`. Campos principales (`:20-83`):

- Datos: `procesos`, `procesosFiltrados`, indices `procesosByYear/Entidad/Region/Objeto` (Maps), `seguimiento`, `filtrosEntidades`, `filtrosPalabras`, `entidadesUnicas`, `estadisticas`, `regionesData`.
- Filtros activos `filtros: FiltrosActivos`.
- UI: `vistaActiva`, `procesoSeleccionado`, `procesosSeleccionados: number[]`, `cargando`, `error`.
- Chat: `mensajesChat`, `chatAbierto`.
- Config: `apiUrl`.

### 4.2 localStorage via `persist` middleware

Configurado en `src/store/useStore.ts:578-598`. Solo se persiste una sub-vista del store:

```ts
partialize: (state) => ({
  apiUrl: state.apiUrl,
  filtros: state.filtros,
  mensajesChat: state.mensajesChat.slice(-50),
})
```

Clave `seace-store`. El `merge` (`:586-597`) re-inyecta defaults en `filtros` para mantener compatibilidad cuando se anaden nuevos filtros en el codigo sin romper usuarios viejos. Lo que **no** persiste: `procesos`, `seguimiento`, `estadisticas`, `procesosSeleccionados`, `procesoSeleccionado`, `vistaActiva`, `cargando`, `chatAbierto`. Eso obliga a refetchear al entrar.

### 4.3 IndexedDB via `apiCache` (`src/services/cache.ts`)

Capa nueva recientemente migrada desde cache en memoria pura a IndexedDB persistente (ver `MODIFICACIONES.MD` para el changelog del proyecto).

- DB: `seace-cache`, version 1, store `cache` con keyPath `key` (`:48-57, 79-84`).
- Contenido: un registro por `(action, params)`, con `data`, `timestamp`, `ttl`.
- Entradas cacheadas: respuestas de `getProcesos`, `getEstadisticas`, `getRegiones`, `getEntidadesUnicas`, `getSeguimiento`, `getFiltrosEntidades/Palabras`, `getCronograma`, `getDocumentos`, `getDatosSeace`, `getProcesoOCDS`, `getGrupoByNomenclatura`, `getSeguimientoDetalle`, `getEmpresasElectricas`. TTLs diferenciados en `:25-44` (desde 1 min para `getSeguimientoDetalle` hasta 24 h para `getGrupoByNomenclatura`).
- Hidratacion: `MemoryCache` constructor llama `hydrateFromIDB()` (`:104-106, 266-311`) que carga todos los records al `Map` en memoria y borra los expirados. Hay un `hydrationPromise` pero **nadie lo espera** (no hay `await apiCache.hydrationReady()` en `App.tsx`), asi que el primer `get()` puede devolver null aunque haya datos en IDB.
- SWR: `cachedFetch` devuelve data stale y revalida en background si `swr !== false` (`:378-385`).
- Fallback: si `indexedDB` no existe o falla (modo privado de Safari, iframe restringido), `warnIdbUnavailable` cambia a solo-memoria (`:63-69, 85-93`).
- Deduplicacion: `inFlightRequests: Map<string, Promise>` evita que dos componentes disparen el mismo fetch simultaneo (`:319, 332-336`).

### 4.4 Estado local de componente

- `App.tsx`: `configUrl` para el formulario de configuracion (`:24`), `selectedProceso`, `editando`, `datosEdicion` dentro de `SeguimientoView` (`:74-82`).
- `AIChat.tsx`: `mensaje`, `enviando`, `minimizado`, `copiado` (`:29-32`).
- Otros componentes mantienen sus propios estados de UI (paneles abiertos, filtros temporales, formularios).

### 4.5 Duplicacion store vs hooks

`useStore.cargarProcesos` y `useCachedProcesos` (`src/hooks/useCachedData.ts:130-137`) resuelven el mismo dato por dos caminos distintos. Ambos leen `apiCache` asi que comparten la capa IDB, pero el `useState<Proceso>` de `useCachedData` y el `procesos: Proceso[]` del store son instancias separadas. Si un componente usa el hook y otro usa el store, pueden ver arrays distintos hasta que una escritura los resincronice. **Este es un punto de sincronizacion debil (ver 5.3)**.

---

## 5. Puntos de sincronizacion debil

### 5.1 Usuario edita Sheets en paralelo a la app

`BD_PROCESOS` y `SEGUIMIENTO` son legibles/editables directo desde la UI de Google Sheets. Si alguien cambia un valor alli:

- La app no se entera hasta que expire el TTL del `cachedFetch` (`getProcesos` = 10 min, `getSeguimiento` = 2 min, ver `src/services/cache.ts:32-35`).
- Peor: con SWR activado (`src/services/cache.ts:378-385`), la app sirve la data vieja y revalida en background, asi que el usuario ve valores vencidos durante un ciclo de render.
- No hay mecanismo de invalidacion push (ni polling activo), solo "refresh" manual desde cada vista.

### 5.2 Mutaciones no transaccionales en `addSeguimientoConOCDS`

Como se describio en 3.2, el flujo dispara hasta 5 HTTP hits secuenciales (getProcesoOCDS, addSeguimiento, 3x updateEtapaSeguimiento). Cualquiera puede fallar (red, rate limit OCDS, error en Drive). El estado resultante puede ser:

- Fila en `SEGUIMIENTO` creada pero sin etapas OCDS -> UI muestra proceso "nuevo" sin progreso.
- Fila creada con carpeta Drive pero el update de etapa final fallo -> incoherente.
- Ninguna compensacion automatica; el usuario debe presionar "Sincronizar desde OCDS" (`actualizarCronogramaDesdeOCDS`, `src/services/api.ts:381-452`) para reconciliar.

### 5.3 Store vs hooks (4.5)

Si dos arboles de componentes leen procesos, uno via `useStore(s => s.procesos)` y otro via `useCachedProcesos()`, tras un refetch manual solo se actualiza el que disparo el fetch. No hay pub-sub cruzado.

### 5.4 Fallback silencioso a `DATOS_PRUEBA`

`cargarProcesos` atrapa errores y carga los 8 procesos mock (`src/store/useStore.ts:214-223`). El banner de error se setea pero la tabla queda poblada. Un usuario distraido puede creer que los datos son reales.

### 5.5 API keys de Gemini rotativas compartidas

`geminiService` no trackea por-usuario cual key esta caliente. Dos pestanas en paralelo pueden estar en el mismo index y golpear la misma key simultaneamente, acelerando el 429 y rotando hacia la siguiente. Ademas, como las keys viven en el bundle, un tercero puede consumir cuota externamente.

### 5.6 IndexedDB hidratacion asincrona sin `await`

`MemoryCache` hidrata desde IDB en `constructor` pero no bloquea. La primera llamada a `cachedFetch` tras un reload puede ejecutarse antes de que `hydrateFromIDB` termine, generando un MISS falso y un fetch innecesario. La promise existe (`hydrationReady()`, `:312-314`) pero no se usa en `App.tsx`.

### 5.7 Dos pipelines escribiendo `OCDS_INDEX`

- Python `generar_indice.py` + copy/paste.
- Apps Script `actualizarIndiceOCDS` (`GOOGLE_APPS_SCRIPT.js:741`).

Si ambos corren cerca en el tiempo, filas escritas en el ultimo minuto pueden ser sobreescritas sin aviso (Sheets no garantiza orden con multiples escritores).

### 5.8 Cronograma materializado en `SEGUIMIENTO` vs API OCDS en vivo

La UI a veces muestra el cronograma desde `SEGUIMIENTO` (columnas `<ETAPA>_<AÑO>_*`) y a veces desde `getCronogramaOCDS` / `getProcesoOCDS`. Si el operador actualizo la API OCDS pero `SEGUIMIENTO` todavia tiene las fechas originales, dos vistas del mismo proceso mostraran fechas diferentes hasta disparar `actualizarCronogramaDesdeOCDS`.

### 5.9 Filtros persistidos vs dataset recargado

`filtros` persiste en localStorage (`src/store/useStore.ts:583`) pero `procesos` no. Al recargar, los filtros aplicables pueden hacer referencia a valores (`entidades`, `regiones`) que ya no existen en la ingesta nueva; `aplicarFiltros` los aplica igual y el usuario ve una tabla vacia sin pista de por que.

---

## Referencias rapidas por archivo

- `src/App.tsx:19-67` — bootstrap y switch de vistas.
- `src/App.tsx:69` en adelante — `SeguimientoView` (pestaña de seguimiento).
- `src/store/useStore.ts:154-600` — store Zustand completo.
- `src/store/useStore.ts:110-152` — constructor de indices.
- `src/services/api.ts:45-121` — `fetchAPI` generico.
- `src/services/api.ts:281-376` — flujo `addSeguimientoConOCDS`.
- `src/services/cache.ts:352-389` — `cachedFetch` con SWR.
- `src/services/cache.ts:391-419` — invalidadores de dominio.
- `src/services/gemini.ts:201-219` — construccion de contexto de chat.
- `src/hooks/useCachedData.ts:44-123` — hook generico.
- `src/utils/historicos.ts:61-95` — busqueda heuristica de historicos en cliente.
- `GOOGLE_APPS_SCRIPT.js:22-68` — `CONFIG` global, hojas y OCDS.
- `GOOGLE_APPS_SCRIPT.js:590-652` — `doGet` / `doPost`.
- `GOOGLE_APPS_SCRIPT.js:657-768` — `Router.handle` y mapa de rutas.
- `GOOGLE_APPS_SCRIPT.js:773-900` — modulo `Procesos`.
- `GOOGLE_APPS_SCRIPT.js:1065-1300` — modulo `Seguimiento`.
- `python/main.py:16-131` — orquestador de ingestion.
- `python/generar_indice.py:1-50` — generador de `OCDS_INDEX.csv`.
- `python/export_sheets.py:20-50` — export a CSV para pegar en Sheets.
