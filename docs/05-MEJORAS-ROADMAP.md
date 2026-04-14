# 05 - Mejoras Roadmap (Next Steps)

## 1. Contexto

SEACE es una aplicación React 19 + TypeScript + Vite que consume un backend Google Apps Script (`GOOGLE_APPS_SCRIPT.js`) respaldado por Google Sheets, con una pipeline Python complementaria (`python/`) para scraping del portal SEACE y enriquecimiento con fichas. El estado global vive en un store Zustand (`src/store/useStore.ts`) y la capa de red en `src/services/api.ts` con caché IndexedDB en `src/services/cache.ts`.

Recientemente se cerraron las optimizaciones más urgentes de rendimiento del cliente: Zustand con selectores granulares, índices precomputados (`byYear`, `byEntidad`, `byRegion`, `byObjeto`) con `aplicarFiltros` acelerado, virtualización de la tabla con `react-window`, caché IndexedDB stale-while-revalidate con TTLs afinados, y code-splitting con `manualChunks` + `React.lazy` para Dashboard, PeruMap, AIChat, OCDSTester, ProcesosTable y SeguimientoDetalleCompleto.

El siguiente bloque de mejoras se centra en aliviar al backend (Apps Script carga hojas completas), endurecer seguridad/observabilidad, añadir tests y robustecer la pipeline Python. Este documento ordena estas mejoras por impacto/esfuerzo y cierra con quick wins accionables hoy.

---

## 2. Mejoras priorizadas

### 2.1 Backend (Apps Script + Sheets)

#### 2.1.1 Push-down filtering real en `Procesos.getAll`
- **Problema**: `GOOGLE_APPS_SCRIPT.js:777-793` ejecuta `sheet.getDataRange().getValues()` en cada request, serializa toda `BD_PROCESOS` a objetos y recién después filtra en memoria. Para ~10k filas esto son >200 KB devueltos aunque el cliente solo quiera una región. `Procesos.getByNomenclatura` (línea 798) amplifica el problema: llama `getAll` completo solo para buscar una sola fila.
- **Propuesta**: Implementar un índice denormalizado en hoja `BD_INDEX` (nomenclatura → rowIndex) escrito por `Import.procesar`. En `getAll`, si `params.nomenclatura` o `params.region` existen, usar `TextFinder`/`createTextFinder` o hacer `sheet.getRange(row, 1, 1, width).getValues()` solo de las filas candidatas. Para filtros combinados, leer la hoja una sola vez por ejecución con `CacheService.getScriptCache()` (clave = hash de hoja + lastUpdated) con TTL 5 min. Añadir parámetro `fields=NOMENCLATURA,ENTIDAD,VALOR` para proyección de columnas y recortar payload cuando el frontend solo necesite un subconjunto.
- **Impacto**: `getByNomenclatura` pasa de O(n) a O(1); `getProcesos?region=X` reduce payload ~90% para filtros selectivos; menor consumo de la cuota diaria Apps Script.
- **Esfuerzo**: L
- **Dependencias/riesgos**: Requiere mantener sincronizado el índice con `Import.procesar`; si falla la invalidación se sirven datos viejos. Mitigación: versionar índice con `ScriptProperties.getProperty('bd_version')`.
- **Prioridad**: P0

#### 2.1.2 Paginación real con `limit` + `offset` (cursor opcional)
- **Problema**: `src/services/api.ts:125-143` pide todos los procesos de una vez (`getProcesos()` sin paginación) y el backend devuelve todo en `Procesos.getAll` (`GOOGLE_APPS_SCRIPT.js:777`). Con ~8-12k filas se transfiere payload completo en cada cold-start del cliente.
- **Propuesta**: Aceptar `params.limit` (default 500) y `params.offset` (default 0). Devolver `{ procesos, total, hasMore, nextOffset }`. En frontend, `cargarProcesos` dispara una primera página de 500 (rápida) y a continuación rellena el resto en background con `requestIdleCallback`. Alternativa cursor: parámetro `afterId=<lastID>` ordenado por `ID` para paginación estable ante inserciones.
- **Impacto**: Tiempo a primer paint del Dashboard baja ~70% (menos bytes hasta first meaningful content); scroll infinito viable en Tabla si se desea.
- **Esfuerzo**: M
- **Dependencias/riesgos**: El store actual asume "todos los procesos en memoria" para los índices. Mantener ese modelo pero construir los índices incrementalmente al llegar cada página.
- **Prioridad**: P0

#### 2.1.3 Validación defensiva en `doPost` y sanitización
- **Problema**: `GOOGLE_APPS_SCRIPT.js:615-652` hace `JSON.parse(e.postData.contents)` sin límite de tamaño, sin validar tipos y sin sanitizar strings que terminan escritos en Sheets (potencial formula injection: un valor `=HYPERLINK(...)` en `notas` se ejecuta en la hoja). `Utils.validateParams` (línea 335) solo checa presencia, no tipo ni longitud.
- **Propuesta**: (a) Schemas por acción en un objeto `SCHEMAS = { addSeguimiento: { nomenclatura: { type:'string', max:200 }, ... } }`; (b) función `sanitizeForSheet(v)` que antepone `'` si el string empieza con `= + - @`; (c) límite duro de 10 KB por request y 1 MB por upload; (d) rate limiting por IP con `CacheService` (`seace:ratelimit:<ip>`, bucket de 60 req/min).
- **Impacto**: Cierra vector de formula injection en Sheets y protege contra abuso de la Web App pública.
- **Esfuerzo**: M
- **Dependencias/riesgos**: Apps Script no expone IP del cliente de forma fiable; usar `Session.getActiveUser().getEmail()` o header `X-Forwarded-For` si el deploy lo permite; si no, rate-limit global por acción.
- **Prioridad**: P1

#### 2.1.4 Métricas de latencia del Apps Script persistidas
- **Problema**: `doGet`/`doPost` ya loguean tiempos (`GOOGLE_APPS_SCRIPT.js:605, 647`) pero solo a `Logger`, que se pierde tras el deploy. No hay forma de ver p50/p95 de `getProcesos` vs `getEstadisticas`.
- **Propuesta**: Escribir en hoja `METRICS` una fila `{ timestamp, action, method, duration_ms, status }` cada N requests (sampling 1/10). Crear dashboard auxiliar en la misma sheet con `QUERY()` para p50/p95/errores última hora.
- **Impacto**: Visibilidad de regresiones de performance sin tooling externo.
- **Esfuerzo**: S
- **Dependencias/riesgos**: Mínimo; cuidado con no inflar la hoja (rotar > 10k filas).
- **Prioridad**: P2

---

### 2.2 Frontend (React / Store / UI)

#### 2.2.1 Web Worker para agregaciones del Dashboard
- **Problema**: `src/components/dashboard/Dashboard.tsx:77-118` recalcula en el hilo principal `statsCalculados` (entidadesCount, entidadesValor, porObjeto, porRegion) cada vez que cambia `procesos` o `filtros.regiones`. Con ~10k filas y varios charts recharts, son ~80-150 ms de JS en el main thread que bloquean input.
- **Propuesta**: Mover el bloque del `useMemo` a un Web Worker dedicado `src/workers/statsWorker.ts`. Usar `comlink` (o mensajes crudos) para enviar `{ procesos, regionesFiltro }` y recibir `{ totalProcesos, valorTotal, todasEntidades, porObjeto, porRegion }`. Cachear por hash `regionesFiltro + procesos.length` para saltar recomputos idénticos. Vite soporta workers nativos vía `new Worker(new URL('./statsWorker.ts', import.meta.url), { type: 'module' })`.
- **Impacto**: Main thread libre durante cambios de filtro; TTI del Dashboard mejora ~60-120 ms; scroll/tipeo más fluido cuando se recalcula.
- **Esfuerzo**: M
- **Dependencias/riesgos**: Serialización structured-clone de `procesos` puede costar ~20 ms en arrays grandes; mitigar usando `Transferable` si se pasa un `ArrayBuffer` proyectado, o manteniendo en el worker una copia que se actualiza incrementalmente.
- **Prioridad**: P1

#### 2.2.2 Optimistic updates en `agregarSeguimiento`/`actualizarSeguimiento`/`eliminarSeguimiento`
- **Problema**: `src/store/useStore.ts:514-562` invalida todo el caché de seguimiento (`cacheInvalidators.onSeguimientoChange()`) y dispara `cargarSeguimiento()` tras cada mutación. El usuario ve un delay hasta que el round-trip al Apps Script vuelve (~1-3 s).
- **Propuesta**: Aplicar cambio local inmediatamente en `seguimiento` (insertar/editar/filtrar). Guardar snapshot previo. Si la request falla, revertir al snapshot y mostrar toast. Solo invalidar el caché IndexedDB (no recargar), permitiendo que la próxima stale-while-revalidate reconcilie en background. Añadir campo `_pending: boolean` a la entrada optimista para pintar estado visual.
- **Impacto**: Percepción de instantaneidad en operaciones de seguimiento; reduce llamadas redundantes al backend.
- **Esfuerzo**: S
- **Dependencias/riesgos**: Conflictos si dos pestañas editan a la vez; el rollback debe ser idempotente. Mantener `updatedAt` en la fila del store.
- **Prioridad**: P1

#### 2.2.3 ErrorBoundary global + toasts de error
- **Problema**: No existe ningún `ErrorBoundary` en `src/` (grep vacío). Errores en `PeruMap`, `Dashboard` o `ProcesosTable` (vistas lazy) revientan el árbol completo a pantalla blanca. Además `cargarEstadisticas`/`cargarRegiones` silencian errores a `console.error` (`useStore.ts:258, 284, 298, 313, 348`) y el usuario no lo nota.
- **Propuesta**: Crear `src/components/common/ErrorBoundary.tsx` usando `componentDidCatch` + `getDerivedStateFromError`; envolver cada vista lazy en `App.tsx` por separado para aislar fallos. Añadir un `toastStore` mínimo (set-based en zustand) y disparar toast cuando cualquier `cargarX` atrape un error. El boundary imprime stack + botón "Reintentar".
- **Impacto**: UX resiliente; debugging de crashes del cliente sin abrir devtools.
- **Esfuerzo**: S
- **Dependencias/riesgos**: Ninguno significativo.
- **Prioridad**: P1

#### 2.2.4 Full-text search con FlexSearch sobre `procesos`
- **Problema**: `src/store/useStore.ts:424-431` y `src/components/dashboard/Dashboard.tsx:472-475` usan `.toLowerCase().includes()` lineal contra `DESCRIPCION | ENTIDAD | NOMENCLATURA`. Con 10k filas y texto por query de ~200 chars, cada keystroke recorre ~2M chars. El efecto se nota en la barra de búsqueda del dashboard.
- **Propuesta**: Añadir `flexsearch` como dependencia y construir un índice una sola vez (en el Worker del punto 2.2.1 o en `cargarProcesos`) con `Document` indexando los 3 campos. `aplicarFiltros` usa `index.search(busqueda, { limit: 5000 })` y reduce `resultado` por el `Set<ID>` devuelto antes de aplicar los demás filtros. Debounce 150 ms en el input.
- **Impacto**: Búsquedas O(log n) en lugar de O(n); reduce coste de cada keystroke de ~15 ms a <1 ms.
- **Esfuerzo**: S
- **Dependencias/riesgos**: FlexSearch pesa ~20 KB gzipped; meterlo en `vendor` chunk y cargarlo lazy (detrás del primer input de búsqueda).
- **Prioridad**: P2

#### 2.2.5 Keyboard navigation accesible en `ProcesosTable`
- **Problema**: `src/components/table/ProcesosTable.tsx:45-80` usa `react-window` sin handlers de `onKeyDown` en las filas. La lista virtualizada no expone semántica `role="listbox"` ni navegación con flechas; imposible recorrer con teclado.
- **Propuesta**: (a) Añadir `role="grid"` al contenedor y `role="row"` en cada `Row`; (b) `tabIndex=0` en la primera fila, handler global `onKeyDown` que mueve `focusedIndex` con ArrowDown/ArrowUp/PageDown/PageUp/Home/End y llama `listRef.scrollToRow(index, 'smart')`; (c) `Enter` abre el detalle, `Space` selecciona. Anunciar cambio con `aria-activedescendant`.
- **Impacto**: Accesibilidad WCAG 2.1 AA cumplida para la vista principal; UX power-user.
- **Esfuerzo**: S
- **Dependencias/riesgos**: Respetar expandedRow (altura variable).
- **Prioridad**: P2

#### 2.2.6 Loading/empty/error states consistentes
- **Problema**: `Dashboard.tsx:152-158` renderiza un `<p>Cargando estadísticas...</p>` simple y `ProcesosTable.tsx` no tiene estado explícito cuando `procesosFiltrados === []`. Ningún componente tiene `ErrorState` visible.
- **Propuesta**: Crear `src/components/ui/StateView.tsx` con variantes `loading | empty | error`, cada una con icono lucide, título, subtítulo y CTA opcional. Reemplazar todos los placeholders sueltos para unificar look&feel.
- **Impacto**: UX consistente y pocos componentes huérfanos; simplifica QA visual.
- **Esfuerzo**: XS
- **Dependencias/riesgos**: Ninguno.
- **Prioridad**: P2

---

### 2.3 Data / Pipeline

#### 2.3.1 Retries + timeouts estructurados en scraper Python
- **Problema**: `python/main.py:63-89` envuelve `scraper.buscar_proceso` en un `try/except Exception` plano sin retry. Si SEACE devuelve 503 o el nodo Selenium cuelga, el proceso queda como `error` y nunca se reintenta. `python/config.py:27` declara `MAX_RETRIES: 3` pero no se aplica.
- **Propuesta**: Añadir `tenacity>=8` a `requirements.txt`. Decorar `scrape_proceso` con `@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=30), retry=retry_if_exception_type((TimeoutException, WebDriverException)))`. Timeout explícito del `WebDriverWait`. Separar error types: `NotFoundError` (no retry) vs `TransientError` (retry).
- **Impacto**: Tasa de éxito de scraping sube ~15-25% en sesiones largas.
- **Esfuerzo**: S
- **Dependencias/riesgos**: Incremento de tiempo total por reintentos; acotar con `MAX_RETRIES`.
- **Prioridad**: P1

#### 2.3.2 Automatización cron del pipeline Python
- **Problema**: `python/main.py` se ejecuta manualmente con `python main.py excel.xlsx`. No hay trigger programado, por lo que `BD_PROCESOS` puede quedar desactualizada días. No hay `python/run_daily.py` ni GitHub Action.
- **Propuesta**: Añadir `python/run_daily.py` que (a) descarga el Excel del portal SEACE con `requests`, (b) llama `procesar_excel_completo`, (c) hace `export_sheets.py` a `BD_PROCESOS`, (d) notifica resumen por webhook o log. Programar con Windows Task Scheduler (xml de ejemplo) **o** un workflow `.github/workflows/scrape-daily.yml` con cron `0 6 * * *` en un runner self-hosted.
- **Impacto**: Datos frescos sin intervención manual; reduce deriva con SEACE real.
- **Esfuerzo**: M
- **Dependencias/riesgos**: Selenium en CI requiere Chrome headless instalado; alternativa: runner self-hosted en la máquina Windows actual.
- **Prioridad**: P1

#### 2.3.3 Caché persistente de respuestas OCDS en Sheets
- **Problema**: `GOOGLE_APPS_SCRIPT.js:54-67` define `OCDS_API` pero cada llamada de `OCDS_API.getProceso` golpea `contratacionesabiertas.oece.gob.pe` en vivo. El cache del frontend (`cache.ts:40-41`: 1 h para OCDS, 24 h `getGrupoByNomenclatura`) ayuda al cliente pero no al backend; `RATE_LIMIT_MS: 1000` sugiere que ya chocamos con límites.
- **Propuesta**: Hoja `OCDS_CACHE` con columnas `[key, fetched_at, ttl, payload_json]`. Wrapper `OCDS_API._cachedFetch(key, fetcher, ttlMs)` lee/escribe la fila y evita round-trip si dentro de TTL. TTL 6 h para `getProceso`, 24 h para histórico.
- **Impacto**: Reduce ~80% las llamadas externas a OCDS y evita rate-limits; acelera respuestas desde ~800 ms a ~150 ms.
- **Esfuerzo**: M
- **Dependencias/riesgos**: Crecimiento de la hoja (rotar > 5k filas o dividir por año).
- **Prioridad**: P1

#### 2.3.4 Migración a DB real (SQLite local o Supabase) – spike
- **Problema**: `BD_PROCESOS` en Sheets es el cuello de botella estructural (sin índices reales, SQL limitado a `QUERY()`, cuota Apps Script de 6 min/ejecución). Crecer más allá de ~30k filas se vuelve doloroso.
- **Propuesta**: Spike de 1 semana evaluando dos opciones:
  - **SQLite + libsql server** (Turso) detrás de un endpoint REST autogenerado; `BD_PROCESOS` se sincroniza diariamente desde Sheets/Excel.
  - **Supabase Postgres** con RLS; `seguimiento` y `procesos` como tablas; frontend usa `supabase-js` en lugar de `fetchAPI`.
  - Mantener Sheets como fuente de "escritura manual del equipo" (seguimiento) y mover solo lecturas pesadas.
  Documento comparando latencia (medir p95), costos ($0 vs Supabase free), curva de migración, y si se pierde la facilidad de edición manual en Sheets que es parte del workflow del equipo.
- **Impacto**: Fundaciones para escalar >100k filas, queries SQL reales, websockets realtime (Supabase).
- **Esfuerzo**: XL (spike S + migración XL si se aprueba)
- **Dependencias/riesgos**: Rompe el flujo "edito Sheets y se refleja"; impacto organizacional alto.
- **Prioridad**: P3

---

### 2.4 DX / Testing / Observabilidad

#### 2.4.1 Vitest + tests unitarios de `aplicarFiltros` e índices
- **Problema**: No hay un solo test en `src/` (glob `**/*.test.*` devuelve únicamente archivos de `node_modules`). `useStore.ts:381-488` contiene la lógica crítica de filtrado con 9 ramas que nadie valida; una regresión en `aplicarFiltros` rompe toda la app silenciosamente.
- **Propuesta**: Instalar `vitest`, `@testing-library/react`, `jsdom`. Crear:
  - `src/store/useStore.test.ts`: fixture de 5k procesos (generada con `faker` o snapshot JSON), tests para `buildIndices`, `aplicarFiltros` con (a) filtro único región, (b) región + búsqueda, (c) palabrasClave, (d) empresasCortas, (e) rangoValor. Assert `procesosFiltrados.length` y que el shortcut de candidates (línea 412) seleccione el índice más pequeño.
  - `src/services/cache.test.ts`: TTL expiration, stale-while-revalidate, fallback a memoria si IDB indisponible.
  - Script `npm test` y `npm run test:watch`.
- **Impacto**: Red de seguridad sobre los ~200 LoC más críticos del frontend.
- **Esfuerzo**: S
- **Dependencias/riesgos**: Ninguno; añade solo devDeps.
- **Prioridad**: P0

#### 2.4.2 Logger de cliente con buffer + envío a Apps Script
- **Problema**: Errores del cliente solo llegan a `console.error` (ej. `useStore.ts:258, 284, 313`). Si un usuario experimenta un crash, no hay manera de reconstruirlo.
- **Propuesta**: `src/services/logger.ts` con buffer circular en memoria (últimos 100 eventos) + `flush()` en `window.addEventListener('error')`, `unhandledrejection` y en `ErrorBoundary.componentDidCatch`. Flush POST a `doPost` con `action=logClientError` escribiendo en hoja `CLIENT_LOGS` (timestamp, ua, url, stack, contextJson). Throttle 1 flush/5 s y max 5 por sesión.
- **Impacto**: Observabilidad sin Sentry; suficiente para proyecto interno.
- **Esfuerzo**: S
- **Dependencias/riesgos**: Privacidad: no loguear PII; payload limitado a 10 KB (ver 2.1.3).
- **Prioridad**: P1

#### 2.4.3 CI mínimo con `tsc --noEmit` + `eslint` + `vitest`
- **Problema**: El workflow de GitHub solo despliega (ver commits recientes `Add GitHub Actions deploy workflow`). No hay job de tipos ni lint ni tests; el build puede romper en main sin warning previo.
- **Propuesta**: `.github/workflows/ci.yml` con `pnpm i --frozen-lockfile || npm ci --legacy-peer-deps`, luego `npm run lint`, `tsc -b --noEmit`, `npm test -- --run`, `npm run build`. Trigger en PR + push a main.
- **Impacto**: Atajar regresiones en main; visibilidad del estado.
- **Esfuerzo**: XS
- **Dependencias/riesgos**: Depende de 2.4.1 para que `npm test` haga algo útil.
- **Prioridad**: P1

---

### 2.5 Seguridad

#### 2.5.1 `.env` en gitignore + rotar URL Apps Script expuesta
- **Problema**: `.env` contiene `VITE_API_URL=https://script.google.com/macros/s/AKfycbxw1LhTtAzr75TmjPjfhxGG1x3F66YWa5qEtkrFVc-aS-J39bZe9YxjdfQfQr89ndiu/exec` (línea 1). Si el archivo está en Git (no verificado aquí pero el status muestra clean, asume sí), la URL del deploy es pública y cualquiera puede invocar `addSeguimiento`, `deleteSeguimiento`, `uploadFileToDrive`. Además `python/config.py:36` referencia `credentials.json` sin comentar cómo se protege.
- **Propuesta**: (a) `echo .env >> .gitignore`; (b) `git rm --cached .env`; (c) rotar el deploy: nueva versión de Apps Script genera nuevo `exec` URL; (d) en GitHub Actions, inyectar `VITE_API_URL` desde Secrets (el workflow actual ya lo hace parcialmente según el commit `Fix: add env variables for production build`, verificar); (e) documentar en `README.md` que `credentials.json` no se commitea y cómo generarlo (`OAuth service account` + compartir la Sheet).
- **Impacto**: Cierra la exposición crítica del endpoint mutable.
- **Esfuerzo**: XS
- **Dependencias/riesgos**: Rotar la URL rompe clientes antiguos; comunicar.
- **Prioridad**: P0

#### 2.5.2 Rate limiting y token compartido en `doPost`
- **Problema**: `doGet`/`doPost` están expuestos con `Anyone, even anonymous` (deploy estándar de Apps Script). Sin rate limit, un atacante puede llenar `BD_PROCESOS` o borrar seguimientos en bulk.
- **Propuesta**: Añadir header/param `x-seace-token` verificado contra `PropertiesService.getScriptProperties().getProperty('API_TOKEN')`. El frontend lo inyecta desde `import.meta.env.VITE_API_TOKEN`. Rotable. Rate limit ver 2.1.3.
- **Impacto**: Barrera trivial pero efectiva contra bots.
- **Esfuerzo**: S
- **Dependencias/riesgos**: Si el token filtra en bundle, se rota; no reemplaza auth real pero reduce superficie.
- **Prioridad**: P1

---

## 3. Tabla resumen priorizada

| # | Título | Categoría | Prioridad | Esfuerzo | Impacto |
|---|--------|-----------|-----------|----------|---------|
| 2.1.1 | Push-down filtering en `Procesos.getAll` | Backend | P0 | L | Payload -80/90% en queries filtradas, `getByNomenclatura` O(1) |
| 2.1.2 | Paginación real con limit/offset | Backend | P0 | M | TTFB del Dashboard -70% |
| 2.4.1 | Vitest + tests de `aplicarFiltros` e índices | DX | P0 | S | Red de seguridad sobre la lógica más crítica |
| 2.5.1 | `.env` en gitignore + rotar URL Apps Script | Seguridad | P0 | XS | Cierra endpoint mutable expuesto |
| 2.1.3 | Validación + sanitización en `doPost` | Backend | P1 | M | Cierra formula injection + límites de tamaño |
| 2.2.1 | Web Worker para agregaciones del Dashboard | Frontend | P1 | M | Main thread libre, TTI -80/120 ms |
| 2.2.2 | Optimistic updates en seguimiento | Frontend | P1 | S | UX instantáneo en mutaciones |
| 2.2.3 | ErrorBoundary global + toasts | Frontend | P1 | S | Resiliencia de UX y debugging |
| 2.3.1 | Retries + timeouts Python con tenacity | Data | P1 | S | Tasa de éxito scraping +15-25% |
| 2.3.2 | Automatización cron del pipeline Python | Data | P1 | M | Datos frescos sin intervención manual |
| 2.3.3 | Caché persistente OCDS en Sheets | Data | P1 | M | -80% llamadas externas |
| 2.4.2 | Logger de cliente con flush a Apps Script | DX | P1 | S | Observabilidad sin Sentry |
| 2.4.3 | CI con tsc + eslint + vitest | DX | P1 | XS | Atajar regresiones en main |
| 2.5.2 | Token compartido en `doPost` | Seguridad | P1 | S | Barrera contra bots |
| 2.1.4 | Métricas latencia Apps Script en hoja | Backend | P2 | S | Visibilidad p50/p95 |
| 2.2.4 | Full-text search con FlexSearch | Frontend | P2 | S | Búsquedas O(log n) |
| 2.2.5 | Keyboard navigation en `ProcesosTable` | Frontend | P2 | S | WCAG 2.1 AA compliance |
| 2.2.6 | Loading/empty/error states consistentes | Frontend | P2 | XS | UX unificado |
| 2.3.4 | Spike migración a SQLite/Supabase | Data | P3 | XL | Fundaciones para escalar >100k filas |

**Totales**: 19 mejoras — **P0**: 4 — **P1**: 10 — **P2**: 4 — **P3**: 1

---

## 4. Quick wins (lo que se puede hacer hoy)

Cinco cambios de menor esfuerzo y mayor impacto que una persona puede empujar en una jornada:

1. **`.env` fuera de Git + rotar URL Apps Script** (2.5.1, XS). `git rm --cached .env`, añadir a `.gitignore`, redeploy del Apps Script, actualizar Secrets del workflow. Cierra hoy una exposición crítica.
2. **`StateView.tsx` y reemplazo de placeholders** (2.2.6, XS). Un componente reutilizable para loading/empty/error barre todos los `<p>Cargando...</p>` sueltos del Dashboard y Tabla.
3. **CI workflow con tsc/eslint/build** (2.4.3, XS). Copia del workflow de deploy adaptado; aunque los tests aún no existan, `tsc -b --noEmit` y `eslint .` ya atrapan regresiones.
4. **ErrorBoundary global + toast** (2.2.3, S). Un componente de clase y un zustand slice mínimo; envuelve `<Suspense>` en `App.tsx` por vista. Elimina pantallas blancas.
5. **Retries con tenacity en `seace_scraper.py`** (2.3.1, S). Añadir `tenacity` a `requirements.txt` y decorar `buscar_proceso`/`extraer_ficha`. Visible al instante en la siguiente corrida del pipeline.

Estas cinco tareas tocan seguridad, UX, DX y robustez del pipeline, y juntas no deberían llevar más de un día de trabajo enfocado.
