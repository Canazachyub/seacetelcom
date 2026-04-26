# SEACE Intelligence — Plan de Arquitectura e Implementación

> **Proyecto:** Plataforma de inteligencia competitiva para procesos SEACE (Sistema Electrónico de Contrataciones del Estado, Perú)
> **Ruta local:** `c:\PROGRAMACION\SEACE TELCOM\`
> **Versión del documento:** 1.0 · Abril 2026
> **Autor:** Documentación técnica consolidada

---

## Tabla de Contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura general](#2-arquitectura-general)
3. [Hojas Google Sheets](#3-hojas-google-sheets)
4. [Componentes Frontend](#4-componentes-frontend)
5. [Módulos Apps Script](#5-módulos-apps-script)
6. [Tabla de endpoints Apps Script](#6-tabla-de-endpoints-apps-script)
7. [Fase 1 — Buscador de históricos (completada)](#7-fase-1--buscador-de-históricos-completada)
8. [Fase 1.5 — Gestor de grupos (en curso)](#8-fase-15--gestor-de-grupos-en-curso)
9. [Fase 2 — Scraping de competencia](#9-fase-2--scraping-de-competencia)
10. [Fase 3 — Inteligencia competitiva](#10-fase-3--inteligencia-competitiva)
11. [Fase 4 — Extensiones opcionales](#11-fase-4--extensiones-opcionales)
12. [Limitaciones técnicas](#12-limitaciones-técnicas)
13. [Bugs conocidos](#13-bugs-conocidos)
14. [Convenciones](#14-convenciones)
15. [Guía de despliegue](#15-guía-de-despliegue)
16. [TODO list priorizado](#16-todo-list-priorizado)

---

## 1. Resumen ejecutivo

### 1.1 Propósito del sistema

SEACE Intelligence es una plataforma interna diseñada para una empresa que **postula a procesos de contratación pública** en el portal SEACE del Perú. El objetivo central es **dar soporte de decisión a la cotización**: cuando aparece un proceso nuevo (ej. 2026), la herramienta debe permitir responder rápido tres preguntas:

1. ¿Qué procesos históricos similares existen (misma entidad, mismo tipo de servicio, años anteriores)?
2. ¿Qué postores compitieron en esos históricos, con qué montos y con qué consultas?
3. ¿Cuál es un rango competitivo realista para nuestra oferta 2026, basado en evidencia?

### 1.2 Caso de uso real

Proceso 2026 `CP-SER-SM-34-2026-ELSE-1` ("Servicio de reducción de pérdidas eléctricas zona sur"):

- El buscador encuentra 6 históricos en BD_PROCESOS: `CP-SER-SM-12-2024-ELSE-1`, `LP-SER-SM-08-2023-ELSE-1`, etc., todos de ELSE con palabras clave "pérdidas / electrificación / reducción".
- DeepSeek re-rankea: 4 son coincidencia fuerte (score > 75), 2 débil (score < 40).
- El usuario selecciona los 4 fuertes y crea `GRUPO_ELSE_PERDIDAS_2026`.
- Fase 2 scrapea SEACE web para esos 4 códigos: 12 postores únicos, 3 recurrentes (aparecen en 3 de 4), rango de ofertas S/ 890K – S/ 1.35M, media S/ 1.08M.
- Fase 3 consolida: sugerencia de cotización S/ 1.02M–1.10M; alerta "Consorcio X ganó 3/4 últimos; ojo con su estrategia".

### 1.3 Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + Vite 5 + TypeScript + TailwindCSS |
| LLM Re-ranking | DeepSeek API |
| LLM OCR | Google Gemini Vision |
| Backend "serverless" | Google Apps Script (web app deployed) |
| Base de datos | Google Sheets (múltiples hojas) |
| Storage de PDFs | Google Drive |
| Scraping | Python + Selenium + Scrapy en `c:\PROGRAMACION\SCRAPING-TELCOM\` |
| Proxy residencial | Node.js `proxy/server.cjs` + tunnel Cloudflare |

---

## 2. Arquitectura general

### 2.1 Diagrama de capas

```
+-------------------------------------------------------------------+
|                        USUARIO (navegador)                         |
+-------------------------------------------------------------------+
                                |
                                v
+-------------------------------------------------------------------+
|  FRONTEND   React 19 + Vite + Tailwind                             |
|  -------------------------------------------------------------     |
|   Layout/sidebar · Dashboard · ProcesosTable · SeguimientoDetalle  |
|   HistoricosView · MisGruposView · InteligenciaCompetitiva         |
|   AIChat (DeepSeek) · PeruMap · Badge/Toast                        |
|                                                                    |
|   services/api.ts       -> Apps Script REST                        |
|   services/deepseek.ts  -> LLM re-rank / chat                      |
|   services/gemini.ts    -> OCR PDFs                                |
+-------------------------------------------------------------------+
        |                     |                       |
        | REST                | REST                  | REST
        v                     v                       v
+---------------------+  +------------------+  +--------------------+
| GOOGLE APPS SCRIPT  |  | DeepSeek API     |  | Gemini API         |
| (web app doPost)    |  | (chat / rerank)  |  | (vision OCR)       |
|                     |  +------------------+  +--------------------+
|  Router ->                                                         |
|   Procesos / Import / Seguimiento / Documentos / GruposHistoricos /|
|   Historicos / OCDS_INDEX / DatosSeaceLookup / EstadoScraping ...  |
|                                                                    |
+---------------------+
        |
        v
+-------------------------------------------------------------------+
| GOOGLE SHEETS   (hojas: BD_PROCESOS, OCDS_INDEX, SEGUIMIENTO,     |
|                 DATOS_SEACE, GRUPOS_HISTORICOS, HISTORICOS_DETALLE,|
|                 DOCUMENTOS, SEACE_IMPORT, FILTROS_*)              |
| GOOGLE DRIVE    (PDFs de ofertas técnicas y detalle monto)        |
+-------------------------------------------------------------------+
                  ^
                  | (escritura desde Python)
+-------------------------------------------------------------------+
|  SCRAPING PC    (c:\PROGRAMACION\SCRAPING-TELCOM\)                |
|   Selenium -> portal SEACE web                                    |
|   Scrapy   -> listas e índices                                    |
|   proxy/server.cjs -> reenvía al API OCDS del gobierno            |
|   Tunnel Cloudflare: visitor-organizing-mortgages-defence         |
+-------------------------------------------------------------------+
                  |
                  v
+-------------------------------------------------------------------+
|  FUENTES EXTERNAS                                                  |
|   - contratacionesabiertas.oece.gob.pe/api/v1  (OCDS, metadata)   |
|   - prod2.seace.gob.pe  (portal web, fichas de proceso)           |
+-------------------------------------------------------------------+
```

### 2.2 Flujo de datos ideal end-to-end

```
Excel SEACE anual --> IMPORT --> SEACE_IMPORT --> CLASIFICADOR --> BD_PROCESOS
                                                                        |
OCDS API --> (tunnel PC) --> OCDS_INDEX (solo metadata liviana)        |
                                                                        v
                                                        Usuario abre HistoricosView
                                                                        |
                                                Historicos.buscarCandidatos
                                                (filtra BD_PROCESOS por entidad+año+keywords)
                                                                        |
                                                            DeepSeek rerank (0-100)
                                                                        |
                                                     Usuario selecciona y crea grupo
                                                                        |
                                                GruposHistoricos.crear (sin carpetas Drive)
                                                                        |
                                                            GRUPOS_HISTORICOS
                                                                        |
                                                (Fase 2) Python scrape_competencia.py
                                                        por cada nomenclatura
                                                                        |
                                                        guardarDatosSeace endpoint
                                                                        |
                                                    DATOS_SEACE (POSTORES_JSON,
                                                    CONSULTAS_JSON, OFERTAS_JSON, ...)
                                                                        |
                                                (Fase 3) InteligenciaCompetitivaView
                                                    consolida estadísticas y dashboards
```

### 2.3 Principios arquitectónicos

- **Sheets como DB**: sin infra de servidor; cada hoja es una tabla indexada por nomenclatura.
- **Backend monolítico en Apps Script**: un único `GOOGLE_APPS_SCRIPT.js` con módulos namespace-style.
- **LLMs en el frontend**: llamadas directas desde el navegador (DeepSeek / Gemini) con API keys en `.env` (uso interno, bajo riesgo).
- **Scraping externo al backend**: Apps Script no puede hacer Selenium; Python corre en el PC del usuario.
- **Escritura atómica vía `guardarDatosSeace`**: el scraper NUNCA toca Sheets directo, todo pasa por endpoint validado.

---

## 3. Hojas Google Sheets

### 3.1 Inventario de hojas

| Hoja | Filas | Rol | Notas |
|------|-------|-----|-------|
| `SEACE_IMPORT` | 4,845 | Landing de Excel anual | Raw, no se toca después del import |
| `BD_PROCESOS` | 4,845 | Tabla principal normalizada | Clasificación automática EMPRESA_CORTA / TIPO_SERVICIO / ESTADO_FECHA |
| `OCDS_INDEX` | 124,338 | Índice ligero OCDS | Solo metadata: NOMENCLATURA, TENDER_ID, OCID, ENTIDAD, VALOR, FECHA_ACTUALIZACION, MES |
| `SEGUIMIENTO` | 1 | Cronograma de procesos activos | 147 columnas (8 etapas × 5 años históricos) |
| `DOCUMENTOS` | 7 | PDFs asociados | NOMENCLATURA + URL_DRIVE + tipo + etapa |
| `GRUPOS_HISTORICOS` | 1 | Vincula proceso 2026 con históricos | ID_GRUPO, NOMENCLATURA_ACTUAL, NOMENCLATURAS_HISTORICOS (CSV), FECHA, NOTAS, CARPETA_DRIVE |
| `DATOS_SEACE` | **0 (vacía)** | Destino del scraping Fase 2 | 17 columnas: POSTORES_JSON, CONSULTAS_JSON, OFERTAS_JSON, DOCUMENTOS_JSON, ESTADO_SCRAPING, ERROR_MENSAJE, FECHA_SCRAPING, ... |
| `HISTORICOS_DETALLE` | 5 | Datos extraídos por IA | 29 columnas |
| `FILTROS_EMPRESAS_ELECTRICAS` | 25 | Whitelist sector eléctrico | Para filtros rápidos |
| `CRONOGRAMA` | variable | Plantilla cronograma | Auxiliar |
| `FILTROS_ENTIDADES` / `FILTROS_PALABRAS` / `REGIONES` | — | Diccionarios auxiliares | — |
| `POSTORES` / `ENLACES_RAPIDOS` | — | On-demand | Se crean cuando se usa |

### 3.2 Detalle BD_PROCESOS (tabla principal)

Columnas relevantes:

- `NOMENCLATURA` (PK) — ej. `CP-SER-SM-34-2026-ELSE-1`
- `ENTIDAD` — nombre largo oficial
- `EMPRESA_CORTA` — clasificada por heurística: `ELSE`, `HIDRANDINA`, `ELECTROCENTRO`, etc.
- `TIPO_SERVICIO` — clasificada por heurística: `ELECTRIFICACIÓN`, `PÉRDIDAS`, `MANTENIMIENTO`, etc.
- `DESCRIPCION_OBJETO` — texto libre del objeto contractual
- `VALOR_REFERENCIAL` — monto
- `FECHA_PUB` — fecha publicación
- `ESTADO_FECHA` — **calculado al importar, NO se actualiza** (ver bug 13.1)
- `AÑO` — derivado de nomenclatura
- `REGION`, `MES`, `TIPO_CONVOCATORIA`, etc.

### 3.3 Detalle DATOS_SEACE (destino Fase 2)

17 columnas esperando el scraper. Campos JSON stringifiados:

```
NOMENCLATURA            (PK)
POSTORES_JSON           [{ "nombre": "...", "ruc": "...", "integrantes": [...], "es_consorcio": true }]
OFERTAS_JSON            [{ "ruc": "...", "monto": 1050000.00, "es_ganador": false }]
CONSULTAS_JSON          [{ "autor": "...", "fecha": "...", "pregunta": "...", "respuesta": "..." }]
DOCUMENTOS_JSON         [{ "tipo": "oferta_tecnica", "ruc": "...", "url_drive": "..." }]
ESTADO_SCRAPING         pendiente | en_proceso | completo | error
FECHA_SCRAPING
ERROR_MENSAJE
INTENTOS                int
URL_FICHA_SEACE
HASH_CONTENIDO          para detectar cambios
...
```

### 3.4 Decisiones de diseño

**Por qué NO guardamos descripción en OCDS_INDEX:**
El API OCDS devuelve un payload enorme por proceso (~20–40 KB cada uno). Guardarlo en Sheets sería inviable (límite de celda, performance). Se decidió que OCDS_INDEX sirve solo como índice de existencia y metadata mínima. Para búsquedas semánticas (descripción/objeto) se usa BD_PROCESOS, que viene del Excel oficial y sí tiene descripción.

**Por qué eliminamos la creación automática de carpetas Drive en `crearGrupoHistorico`:**
La versión inicial creaba 7+ carpetas por grupo (una raíz + una por histórico + subcarpetas por tipo de documento). Resultado: Drive saturado de carpetas vacías porque Fase 2 aún no existía. Decisión: `GruposHistoricos.crear` solo escribe en la hoja. Las carpetas se crean **bajo demanda** cuando Fase 2 descarga el primer PDF de ese histórico.

---

## 4. Componentes Frontend

### 4.1 Árbol de componentes

```
src/
  App.tsx                       Router por vistaActiva (string, sin react-router)
  main.tsx
  components/
    layout/
      Layout.tsx                Sidebar + topbar, emite cambio de vista
    dashboard/
      Dashboard.tsx             KPIs agregados
    table/
      ProcesosTable.tsx         Lista BD_PROCESOS + filtros
    seguimiento/
      SeguimientoDetalleCompleto.tsx  Cronograma 8 etapas × histórico
    map/
      PeruMap.tsx               Heatmap por región
    ai/
      AIChat.tsx                Chat DeepSeek con contexto de procesos
    historicos/
      HistoricosView.tsx        FASE 1 - buscador + rerank + crear grupo
      (futuro) MisGruposView.tsx
      (futuro) GrupoDetalleView.tsx
    diagnostico/
      ...                       Vistas de debug / salud de backend
    ui/
      Badge.tsx
      Toast.tsx
  services/
    api.ts                      Cliente REST -> Apps Script
    deepseek.ts                 Chat + rerankearHistoricos()
    gemini.ts                   OCR PDFs (usado puntualmente)
  types/
    index.ts                    Tipos compartidos
  utils/
    constants.ts
    format.ts
```

### 4.2 Convenciones frontend

- **Sin react-router**: `App.tsx` usa un estado `vistaActiva: 'dashboard' | 'procesos' | 'historicos' | ...` y switchea.
- **Datos via `api.ts`**: una función por endpoint, tipada, siempre async.
- **LLMs**: los servicios encapsulan `fetch` con headers + rotación de keys (varias keys separadas por coma en `.env`).
- **Estado**: `useState` local. Sin Redux/Zustand (proyecto pequeño).

---

## 5. Módulos Apps Script

`GOOGLE_APPS_SCRIPT.js` (5500+ líneas) está organizado en **namespaces** (objetos literales) que simulan módulos:

```
CONFIG            Constantes: IDs de hoja, URLs, límites
Utils             Helpers: fechas, parsing, normalización strings
Router            doPost / doGet -> dispatch por action
Procesos          CRUD sobre BD_PROCESOS
Import            SEACE_IMPORT -> BD_PROCESOS (clasificadores)
Seguimiento       CRUD SEGUIMIENTO (versión vieja)
SeguimientoV2     CRUD SEGUIMIENTO (versión actual 147 columnas)
Cronograma        Plantillas de fechas por etapa
Documentos        CRUD DOCUMENTOS + Drive links
Postores          CRUD POSTORES (legacy)
Filtros           Dropdowns: entidades, empresas, palabras
Estadisticas      KPIs para dashboard
Drive             Helpers de Drive: crear carpeta, subir archivo
GruposHistoricos  CRUD GRUPOS_HISTORICOS (Fase 1.5)
OCDS_API          Fetch OCDS via tunnel
OCDS_INDEX        CRUD OCDS_INDEX (importa ligero)
Historicos        buscarCandidatos - match BD_PROCESOS x target
EmpresasElectricas  CRUD FILTROS_EMPRESAS_ELECTRICAS
HistoricosDetalle   CRUD HISTORICOS_DETALLE (IA outputs)
EnlacesRapidos    On-demand
DatosSeaceLookup  Lee DATOS_SEACE por nomenclatura (Fase 2/3)
EstadoScraping    Marca pendiente/en_proceso/completo
Diagnostico       Endpoints de health / inspección
```

### 5.1 Patrón de router

```js
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const action = body.action;
  try {
    switch(action) {
      case 'buscarHistoricosCandidatos':
        return respond(Historicos.buscarCandidatos(body));
      case 'crearGrupoHistorico':
        return respond(GruposHistoricos.crear(body));
      // ... etc
    }
  } catch(err) {
    return respond({ ok: false, error: err.message });
  }
}
```

---

## 6. Tabla de endpoints Apps Script

| Endpoint (action) | Módulo | Input (body) | Output | Estado |
|---|---|---|---|---|
| `getProcesos` | Procesos | `{ filtros?, limit?, offset? }` | `{ ok, data: Proceso[], total }` | Producción |
| `getProcesoDetalle` | Procesos | `{ nomenclatura }` | `{ ok, proceso, seguimiento, documentos }` | Producción |
| `importarSeace` | Import | `{}` | `{ ok, insertados, clasificados }` | Producción |
| `getSeguimiento` | SeguimientoV2 | `{ nomenclatura }` | `{ ok, filas }` | Producción |
| `updateSeguimiento` | SeguimientoV2 | `{ nomenclatura, cambios }` | `{ ok }` | Producción |
| `getDocumentos` | Documentos | `{ nomenclatura? }` | `{ ok, documentos }` | Producción |
| `uploadDocumento` | Documentos | `{ nomenclatura, base64, nombre, tipo, etapa }` | `{ ok, url }` | Producción |
| `getEstadisticas` | Estadisticas | `{}` | `{ ok, kpis }` | Producción |
| `getFiltros` | Filtros | `{ tipo }` | `{ ok, valores }` | Producción |
| `importarOCDS` | OCDS_INDEX | `{ desde, hasta }` | `{ ok, insertados }` | Producción (vía tunnel) |
| `buscarHistoricosCandidatos` | Historicos | `{ nomenclaturaTarget?, descripcion?, entidad?, anioMax }` | `{ ok, candidatos: [{ nomenclatura, entidad, descripcion, score, razon }] }` | **Fase 1 listo** |
| `crearGrupoHistorico` | GruposHistoricos | `{ nomenclaturaActual, nomenclaturasHistoricos: string[], notas? }` | `{ ok, idGrupo }` | **Fase 1.5 - refactor en curso (quitar carpetas)** |
| `listarGruposConStats` | GruposHistoricos | `{}` | `{ ok, grupos: [{ id, actual, nHistoricos, nScrapeados, fecha }] }` | **Fase 1.5 - por implementar** |
| `getGrupoDetalle` | GruposHistoricos | `{ idGrupo }` | `{ ok, grupo, historicos: [{ nomenclatura, entidad, descripcion, estadoScraping }] }` | **Fase 1.5 - por implementar** |
| `getEstadoScraping` | EstadoScraping | `{ nomenclaturas: string[] }` | `{ ok, estados: { [nom]: 'pendiente'\|'en_proceso'\|'completo'\|'error' } }` | **Fase 1.5 - por implementar** |
| `guardarDatosSeace` | DatosSeaceLookup | `{ nomenclatura, postores, ofertas, consultas, documentos }` | `{ ok }` | **Fase 2 - por implementar** |
| `getDatosSeace` | DatosSeaceLookup | `{ nomenclatura }` o `{ nomenclaturas: string[] }` | `{ ok, datos }` | **Fase 2/3 - por implementar** |
| `getInteligenciaGrupo` | GruposHistoricos | `{ idGrupo }` | `{ ok, postoresAgregados, rangos, sugerencia }` | **Fase 3 - por implementar** |
| `diagnostico` | Diagnostico | `{}` | `{ ok, salud }` | Producción |

---

## 7. Fase 1 — Buscador de históricos (completada)

### 7.1 Alcance

Buscador semi-automatizado que, dado un proceso 2026, sugiere candidatos históricos con score IA.

### 7.2 Flujo

```
Usuario abre HistoricosView
        |
Tabs: [Por descripción]  [Por nomenclatura]
        |
Input:
  - Modo descripción: entidad + descripción libre
  - Modo nomenclatura: "CP-SER-SM-34-2026-ELSE-1"
        |
Frontend llama api.buscarHistoricosCandidatos(body)
        |
Apps Script Historicos.buscarCandidatos:
  1. Si viene nomenclatura -> extraer entidad corta (ELSE) y año (2026)
  2. Filtrar BD_PROCESOS:
       WHERE EMPRESA_CORTA = 'ELSE'
         AND ANIO < 2026
         AND (descripcion contiene alguna keyword del target)
  3. Score base (heurística):
       - +30 si coincide TIPO_SERVICIO
       - +20 por cada keyword fuerte compartida
       - +10 por mismo rango de valor referencial
  4. Devolver top 30 candidatos
        |
Frontend recibe candidatos
        |
DeepSeek.rerankearHistoricos(target, candidatos):
  Prompt -> LLM evalua similitud semantica
  Devuelve score 0-100 + "razon" textual
        |
UI muestra tabla ordenada por score:
  [x]  NOMENCLATURA              ENTIDAD      SCORE   RAZON
  [x]  CP-SER-SM-12-2024-ELSE-1  ELSE         92      "Mismo servicio de reduccion..."
  [ ]  LP-SER-SM-08-2023-ELSE-1  ELSE         78      "Muy similar pero zona norte"
  ...
        |
Stats agregadas en vivo (solo checked):
  n=4 | min=890K | max=1.35M | media=1.08M
        |
Usuario presiona [Crear grupo historico]
        |
api.crearGrupoHistorico({ nomenclaturaActual, nomenclaturasHistoricos: [...] })
        |
GRUPOS_HISTORICOS += 1 fila
```

### 7.3 Archivos modificados en Fase 1

- `src/components/historicos/HistoricosView.tsx` (nuevo)
- `src/services/deepseek.ts` (método `rerankearHistoricos`)
- `src/services/api.ts` (función `buscarHistoricosCandidatos` + tipos)
- `GOOGLE_APPS_SCRIPT.js` (módulo `Historicos`, action `buscarHistoricosCandidatos`)

---

## 8. Fase 1.5 — Gestor de grupos (en curso)

### 8.1 Decisión clave

**Eliminar la creación automática de carpetas Drive en `crearGrupoHistorico`.**

Motivo: la versión original creaba 7+ carpetas vacías por grupo (raíz + subcarpetas por tipo de documento × histórico). Como Fase 2 aún no descargaba PDFs, Drive se llenaba de ruido. Ahora:

- `GruposHistoricos.crear` **solo escribe** en la hoja `GRUPOS_HISTORICOS`.
- Las carpetas Drive se crearán **lazy**, cuando Fase 2 baje el primer PDF de ese histórico.
- Campo `CARPETA_DRIVE` queda vacío hasta que eso ocurra.

### 8.2 Cambios planeados

#### Backend (Apps Script)

1. Refactor `GruposHistoricos.crear`: eliminar llamadas a `Drive.crearCarpeta`. Generar `ID_GRUPO` (ej. `GRUPO_CP-SER-SM-34-2026-ELSE-1_1714000000`).
2. Nuevo `GruposHistoricos.listarConStats`:
   - Lee `GRUPOS_HISTORICOS`
   - Para cada grupo, cruza con `DATOS_SEACE.ESTADO_SCRAPING` para contar `nScrapeados` vs `nHistoricos`.
3. Nuevo `GruposHistoricos.getDetalle`:
   - Devuelve el grupo + expande cada nomenclatura histórica con entidad/descripción desde `BD_PROCESOS` + estado desde `DATOS_SEACE`.
4. Nuevo `EstadoScraping.get(nomenclaturas[])`:
   - Lookup masivo en `DATOS_SEACE` por columna NOMENCLATURA.
   - Devuelve `'pendiente'` si la fila no existe.

#### Frontend

1. `src/services/api.ts`: agregar tipos + funciones:
   - `listarGruposConStats()`
   - `getGrupoDetalle(idGrupo)`
   - `getEstadoScraping(nomenclaturas[])`
2. `src/components/historicos/MisGruposView.tsx` (nuevo):
   - Tabla de grupos guardados: ID · actual · nHistóricos · progreso scraping · fecha · acciones.
   - Click -> abre vista detalle.
3. `src/components/historicos/GrupoDetalleView.tsx` (nuevo):
   - Cabecera: nomenclatura actual + notas.
   - Tabla de históricos: nomenclatura · entidad · descripción · estado scraping (badge color).
   - Placeholder "pendiente" hasta Fase 2.
   - Botón futuro: "Lanzar scraping" (Fase 2).
4. `HistoricosView.tsx`: al crear grupo, mostrar panel éxito con link "Ver en Mis Grupos".
5. `Layout.tsx`: agregar ítem "Mis Grupos" al sidebar.

### 8.3 Estructura del ID de grupo

```
GRUPO_{nomenclaturaActualNormalizada}_{timestampUnix}
  ejemplo: GRUPO_CP-SER-SM-34-2026-ELSE-1_1714000000
```

---

## 9. Fase 2 — Scraping de competencia ✅ completada

> **Estado:** ✅ Scraper Python en `c:/PROGRAMACION/SCRAPING-TELCOM/python/` (scrape_competencia + api_client + run.py) · Dual-write a `DATOS_SEACE` vía endpoint `guardarDatosSeace` · Polling automático del modal cada 8s · Pendiente (Fase 2.1): descarga de PDFs a Drive — solo URLs capturadas por ahora.

### 9.1 Objetivo

Para cada nomenclatura en un grupo histórico, extraer del portal SEACE web:

- Postores (nombre legal, RUC, integrantes si es consorcio).
- Monto ofertado por cada postor.
- Ganador (si la buena pro ya fue otorgada).
- Consultas y observaciones estructuradas (autor, pregunta, respuesta).
- PDFs: oferta técnica, detalle del monto ofertado, absolución de consultas.

### 9.2 Script `scrape_competencia.py`

Ubicación: `c:\PROGRAMACION\SCRAPING-TELCOM\scrape_competencia.py` (nuevo).

Base: reutiliza `scraping_por_entidad.py` existente (Selenium undetected-chromedriver ya configurado con anti-captcha).

#### Input

```python
# CLI:
python scrape_competencia.py --grupo GRUPO_CP-SER-SM-34-2026-ELSE-1_1714000000

# O directo:
python scrape_competencia.py --nomenclaturas CP-SER-SM-12-2024-ELSE-1,LP-SER-SM-08-2023-ELSE-1
```

#### Flujo por nomenclatura

```
1. Marcar ESTADO_SCRAPING='en_proceso' (POST guardarDatosSeace estado-only)
2. Buscar la ficha SEACE (buscador web por nomenclatura)
3. Abrir pestaña "Ver Ofertas Presentadas":
     - Iterar filas de postores
     - Extraer: nombre, RUC, integrantes (si consorcio), monto, ganador
     - Descargar PDF oferta técnica -> Drive
     - Descargar PDF detalle monto -> Drive
4. Abrir pestaña "Formulación Consultas y Observaciones":
     - Iterar preguntas
     - Extraer: autor (postor), fecha, texto_pregunta, texto_respuesta
5. POST guardarDatosSeace con todos los JSON
6. Marcar ESTADO_SCRAPING='completo', FECHA_SCRAPING=now
7. Si falla: ESTADO_SCRAPING='error', ERROR_MENSAJE=traceback corto
```

### 9.3 Endpoint `guardarDatosSeace`

```js
// Apps Script
function guardarDatosSeace(body) {
  // body: { nomenclatura, postores, ofertas, consultas, documentos, estado, error? }
  const sh = SpreadsheetApp.getActive().getSheetByName('DATOS_SEACE');
  const idx = findRowByNomenclatura(sh, body.nomenclatura);
  if (idx === -1) {
    sh.appendRow([ body.nomenclatura, /* ... */ ]);
  } else {
    // update fila idx
  }
  return { ok: true };
}
```

### 9.4 Actualización en tiempo real

El frontend (GrupoDetalleView) hará polling cada 10s a `getEstadoScraping` mientras al menos un histórico esté en `pendiente` o `en_proceso`, para mostrar badges actualizadas.

---

## 10. Fase 3 — Inteligencia competitiva

### 10.1 Vista `InteligenciaCompetitivaView`

Invocada desde GrupoDetalleView con botón "Ver inteligencia".

### 10.2 Paneles

#### Tabla cruzada Postor × Histórico

```
                    CP-SER-12-2024  LP-SER-08-2023  CP-SER-05-2022  LP-SER-03-2021
CONSORCIO XYZ       1,050,000 GAN   985,000         —               1,100,000
ELECTRO LIMA SAC    1,120,000       1,010,000 GAN   920,000         —
ABC CONTRATISTAS    —               1,200,000       950,000 GAN     1,080,000 GAN
```

#### Gráfico dispersión

Eje X = año, eje Y = monto ofertado. Color por postor. Línea horizontal en valor referencial del proceso 2026.

#### Ranking de postores

Ordenados por frecuencia (cuántos de los N históricos del grupo los incluyen). Marcamos los "recurrentes" (≥ 50%).

#### Stats

- `n` ofertas totales
- `min`, `max`, `media`, `mediana`, `stdev`
- `min_ganador`, `max_ganador`, `media_ganador` (solo ganadores)
- Sugerencia de rango competitivo: `[media_ganador - 0.5σ, media_ganador + 0.5σ]` escalado por inflación si aplica.

#### Vista detalle por histórico

Drill-down: abrir un histórico específico y ver:
- Lista completa de postores con RUC (link SUNAT) y dirección si conocida.
- Consultas: qué preguntó cada postor (señal de qué les preocupaba).
- PDFs de ofertas técnicas descargados.

### 10.3 Endpoint `getInteligenciaGrupo`

Hace el cruce server-side (evita bajar todos los JSON al frontend):

```
Input:  { idGrupo }
Output: {
  ok,
  postoresAgregados: [
    { nombre, ruc, nHistoricos, nGanadas, ofertas: [{ nomenclatura, monto, ganador }], frecuencia }
  ],
  rangos: { min, max, media, mediana, stdev, nOfertas },
  rangosGanador: { ... },
  sugerencia: { min, max, media }
}
```

---

## 11. Fase 4 — Extensiones opcionales

- **OCR de PDFs con Gemini Vision**: extraer partidas + precios unitarios → hoja `PARTIDAS` → análisis granular por ítem.
- **Dashboard de pendientes de scraping** con batch selection: marca N grupos y encola a Python.
- **Alertas proactivas**: Email/Toast cuando aparece un proceso 2026 similar a un grupo existente ("Nuevo ELSE reducción pérdidas detectado").
- **Export consolidado Excel**: un ZIP con hojas por grupo + PDFs organizados.
- **API pública / webhooks**: para integrar con un ERP interno.

---

## 12. Limitaciones técnicas

### 12.1 OCDS API bloquea IPs de Google y Cloudflare Workers

El API `contratacionesabiertas.oece.gob.pe/api/v1` devuelve `403 Forbidden` cuando detecta IPs de Google Apps Script o Cloudflare Workers (posible WAF con geobloqueo / blacklist).

**Workaround:** tunnel Cloudflare que expone un proxy Node (`proxy/server.cjs`) corriendo en el PC del usuario (IP peruana residencial). URL pública: `https://visitor-organizing-mortgages-defence.trycloudflare.com`. Apps Script llama a esa URL y el proxy reenvía al API real.

### 12.2 Latencia OCDS vs SEACE web

OCDS publica datos con **semanas de retraso** respecto al portal SEACE. Procesos 2026 publicados en abril pueden no estar en OCDS aún. Por eso:
- Para **búsqueda histórica** usamos BD_PROCESOS (del Excel anual oficial).
- Para **datos en vivo del 2026** dependemos de scraping SEACE web.

### 12.3 OCDS_INDEX sin descripción

El API OCDS entrega descripciones larguísimas que no caben eficientemente en celdas de Sheets. Guardamos solo metadata liviana; la descripción queda en BD_PROCESOS.

### 12.4 SEACE web sin API oficial

No hay endpoint REST público. Selenium es la única vía. Problemas asociados:
- Captchas intermitentes (mitigado con `undetected-chromedriver`).
- Cambios de HTML rompen selectores (monitorear).
- Lento: ~30–60s por ficha.

### 12.5 Apps Script no puede hacer Selenium ni descargas grandes

Por eso toda la extracción pesada vive en Python / PC del usuario. Apps Script solo recibe los datos ya estructurados.

### 12.6 Límites de Google Apps Script

- Timeout de ejecución 6 min por request.
- Cuota diaria de URLFetch ~20K/día.
- Cuota de escritura en Sheets.

Para lotes grandes (ej. importar 124K OCDS), se usa paginación + múltiples ejecuciones.

---

## 13. Bugs conocidos

### 13.1 ESTADO_FECHA desactualizado en BD_PROCESOS

**Síntoma:** Procesos con `FECHA_PUB = 31/12/2025` aparecen con `ESTADO_FECHA = "Esta semana"` cuando hoy es 2026-04-22.

**Causa:** La columna se calcula **una sola vez** al importar desde SEACE_IMPORT. Nunca se refresca.

**Impacto:** Filtro "Esta semana / Este mes / Este año" en `ProcesosTable.tsx` muestra resultados incorrectos.

**Fix propuesto:** Calcular `ESTADO_FECHA` **dinámicamente en frontend** desde `FECHA_PUB`, ignorando el valor almacenado. Borrar la columna o dejarla solo como caché.

**Prioridad:** Media (afecta UX de filtros pero no datos).

### 13.2 Otros (pendiente de triage)

- Re-rank DeepSeek ocasionalmente devuelve score fuera de rango (0-100): clamp en frontend.
- Importar OCDS por rangos grandes puede timeout: dividir en lotes < 5K.

---

## 14. Convenciones

### 14.1 Nomenclatura SEACE

Formato: `{TIPO}-{SUBTIPO}-{SUB2}-{NUM}-{AÑO}-{EMPRESA}-{SEQ}`

Ejemplo: `CP-SER-SM-34-2026-ELSE-1`

- `CP` = Concurso Público
- `SER` = Servicio
- `SM` = Subasta Menor (convocatoria)
- `34` = número del año
- `2026` = año
- `ELSE` = Electro Sur Este
- `1` = secuencia

### 14.2 Clasificadores

`EMPRESA_CORTA` e.g. `ELSE`, `HIDRANDINA`, `ELECTROCENTRO`, `SEAL`, `ENOSA`, `ENSA`, `ELECTROPUNO`, ...
`TIPO_SERVICIO` e.g. `ELECTRIFICACIÓN`, `PÉRDIDAS`, `MANTENIMIENTO`, `AMPLIACIÓN`, `OPERACIÓN`, `CONSULTORÍA`, ...

### 14.3 Código

- **Frontend**: TypeScript estricto, componentes en PascalCase, hooks en camelCase con prefijo `use`.
- **Apps Script**: JavaScript plano, módulos como objetos literales, funciones de acceso a hoja cached en variables top-level.
- **Python**: snake_case, type hints cuando posible.

### 14.4 Convención de JSON en Sheets

Todos los campos `*_JSON` se guardan como **string stringifiado**. Al leer, parsear inmediatamente. Si está vacío → `[]`.

---

## 15. Guía de despliegue

### 15.1 Frontend

```bash
cd "c:/PROGRAMACION/SEACE TELCOM"
npm install --legacy-peer-deps
npm run dev         # desarrollo en localhost:5173
npm run build       # genera /dist
```

Deploy producción: GitHub Actions (`.github/workflows/deploy.yml`) → GitHub Pages. Requiere secrets:
- `VITE_API_URL`
- `VITE_DEEPSEEK_API_KEYS`
- `VITE_GEMINI_API_KEYS`

### 15.2 Apps Script

1. Abrir editor Apps Script del proyecto.
2. Pegar contenido de `GOOGLE_APPS_SCRIPT.js`.
3. `Deploy` → `Web app`:
   - Execute as: `Me`
   - Who has access: `Anyone`
4. Copiar URL → actualizar `VITE_API_URL`.

URL actual: `https://script.google.com/macros/s/AKfycbxfU_MZdz5JirstFFq7s2UaOuDJIqRlQR7ghYtxGbq2hiEa5FX-XsOhSiZKlWPGxpty/exec`

### 15.3 Proxy tunnel

En el PC del usuario (debe estar encendido):

```bash
cd "c:/PROGRAMACION/SEACE TELCOM/proxy"
node server.cjs
# En otra terminal:
cloudflared tunnel --url http://localhost:3001
```

La URL pública actual es `https://visitor-organizing-mortgages-defence.trycloudflare.com`. Cuando el tunnel se reinicia cambia; hay que actualizar la constante en Apps Script (`CONFIG.OCDS_PROXY_URL`).

### 15.4 Python scraping

```bash
cd "c:/PROGRAMACION/SCRAPING-TELCOM"
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python scrape_competencia.py --grupo GRUPO_...
```

---

## 16. TODO list priorizado

### Prioridad ALTA — bloquean siguiente fase

- [ ] **[Fase 1.5]** Refactor `GruposHistoricos.crear`: eliminar creación de carpetas Drive. Solo escribir fila en hoja.
- [ ] **[Fase 1.5]** Implementar endpoints Apps Script: `listarGruposConStats`, `getGrupoDetalle`, `getEstadoScraping`.
- [ ] **[Fase 1.5]** Crear `MisGruposView.tsx` + ruta en sidebar.
- [ ] **[Fase 1.5]** Crear `GrupoDetalleView.tsx` con tabla de históricos y badges de estado scraping.
- [ ] **[Fase 1.5]** Agregar panel éxito + link "Ver en Mis Grupos" en HistoricosView.
- [ ] **[Fase 1.5]** Agregar funciones + tipos en `src/services/api.ts` para los 3 nuevos endpoints.

### Prioridad MEDIA — siguiente sprint

- [x] **[Fase 2]** ✅ **completada** — Scraper Python en `c:/PROGRAMACION/SCRAPING-TELCOM/python/` (scrape_competencia + api_client + run.py).
- [x] **[Fase 2]** ✅ **completada** — Endpoint Apps Script `guardarDatosSeace` (dual-write idempotente en DATOS_SEACE).
- [x] **[Fase 2]** ✅ **completada** — Endpoint `getDatosSeace` + lectura por grupo.
- [x] **[Fase 2]** ✅ **completada** — Polling automático del modal cada 8s mientras haya pendientes.
- [ ] **[Fase 2.1]** Descarga de PDFs a Drive — solo URLs capturadas por ahora (método `upload_pdf_drive` ya disponible en api_client).
- [ ] **[Fase 2.1]** Creación lazy de carpetas Drive cuando llega primer PDF por histórico.
- [ ] **[Bug 13.1]** Calcular `ESTADO_FECHA` dinámicamente en frontend desde `FECHA_PUB`; deprecar la columna almacenada.

### Prioridad BAJA — backlog

- [ ] **[Fase 3]** `InteligenciaCompetitivaView` con tabla cruzada + dispersión + ranking + stats.
- [ ] **[Fase 3]** Endpoint `getInteligenciaGrupo` que agrega server-side.
- [ ] **[Fase 4]** OCR Gemini Vision de PDFs de oferta → tabla `PARTIDAS`.
- [ ] **[Fase 4]** Dashboard global de pendientes de scraping con batch execute.
- [ ] **[Fase 4]** Alertas proactivas de procesos 2026 parecidos a grupos existentes.
- [ ] **[Fase 4]** Export Excel consolidado por grupo (stats + postores + links PDF).
- [ ] **[Tech debt]** Mover las API keys a un backend proxy (actualmente en `.env` frontend — riesgo bajo pero no ideal).
- [ ] **[Tech debt]** Dividir `GOOGLE_APPS_SCRIPT.js` (5500+ líneas) en archivos múltiples en el editor.
- [ ] **[Tech debt]** Documentar formalmente contrato JSON de DATOS_SEACE (schema versionado).
- [ ] **[Observabilidad]** Logging estructurado en Apps Script → hoja `LOG` con timestamp + action + duración.

---

## Apéndice A — Ejemplo end-to-end concreto

**Escenario real:** el usuario ve que ELSE publicó `CP-SER-SM-34-2026-ELSE-1` "Servicio de reducción de pérdidas no técnicas en zona sur, periodo 2026-2028, valor referencial S/ 1,150,000".

**Paso 1 — HistoricosView (Fase 1)**

```
Input modo descripción:
  Entidad: ELSE
  Descripción: "reducción pérdidas no técnicas zona sur"

Resultado (rerank DeepSeek):
  [x] CP-SER-SM-12-2024-ELSE-1  "Reducción pérdidas 2024"      score 94
  [x] LP-SER-SM-08-2023-ELSE-1  "Reducción pérdidas no tec."   score 88
  [x] CP-SER-SM-05-2022-ELSE-1  "Pérdidas sector rural sur"    score 82
  [x] LP-SER-SM-03-2021-ELSE-1  "Reducción pérdidas zona sur"  score 79
  [ ] CP-OBR-SM-18-2023-ELSE-1  "Electrificación rural sur"    score 42
  [ ] LP-SER-SM-20-2024-ELSE-1  "Mantenimiento redes Arequipa" score 31

Stats selección (4):
  min=890,000  max=1,350,000  media=1,080,000  n=4
```

**Paso 2 — Crear grupo (Fase 1.5)**

```
POST crearGrupoHistorico:
  nomenclaturaActual: CP-SER-SM-34-2026-ELSE-1
  nomenclaturasHistoricos: [
    CP-SER-SM-12-2024-ELSE-1,
    LP-SER-SM-08-2023-ELSE-1,
    CP-SER-SM-05-2022-ELSE-1,
    LP-SER-SM-03-2021-ELSE-1
  ]

Response: { ok: true, idGrupo: "GRUPO_CP-SER-SM-34-2026-ELSE-1_1714000000" }

No se crean carpetas Drive todavía.
Panel éxito: "Grupo creado. [Ver en Mis Grupos] o [Lanzar scraping] (Fase 2)"
```

**Paso 3 — Mis Grupos / Detalle (Fase 1.5)**

```
Sidebar -> Mis Grupos:
  GRUPO_CP-SER-SM-34-2026-ELSE-1_... | CP-SER-SM-34-2026-ELSE-1 | 4 hist | 0/4 scrapeados

Click -> Detalle:
  Nomenclatura actual: CP-SER-SM-34-2026-ELSE-1
  Históricos:
    CP-SER-SM-12-2024-ELSE-1  ELSE  "Reducción pérdidas 2024"   [pendiente]
    LP-SER-SM-08-2023-ELSE-1  ELSE  "Reducción pérdidas no tec." [pendiente]
    CP-SER-SM-05-2022-ELSE-1  ELSE  "Pérdidas sector rural sur"  [pendiente]
    LP-SER-SM-03-2021-ELSE-1  ELSE  "Reducción pérdidas zona sur"[pendiente]
```

**Paso 4 — Scraping (Fase 2, futuro)**

```
$ python scrape_competencia.py --grupo GRUPO_CP-SER-SM-34-2026-ELSE-1_1714000000

[1/4] CP-SER-SM-12-2024-ELSE-1 ... POSTORES=3 CONSULTAS=12 PDFs=6 -> completo (52s)
[2/4] LP-SER-SM-08-2023-ELSE-1 ... POSTORES=4 CONSULTAS=18 PDFs=8 -> completo (61s)
[3/4] CP-SER-SM-05-2022-ELSE-1 ... POSTORES=2 CONSULTAS=5  PDFs=4 -> completo (44s)
[4/4] LP-SER-SM-03-2021-ELSE-1 ... POSTORES=4 CONSULTAS=9  PDFs=8 -> completo (58s)

Total: 12 postores únicos (3 recurrentes en >=50% históricos).
```

**Paso 5 — Inteligencia (Fase 3, futuro)**

```
Vista InteligenciaCompetitiva para GRUPO_...ELSE-1:

Postores recurrentes:
  CONSORCIO ELECTRO-SUR     aparece en 4/4  ganó en 2
  ABC CONTRATISTAS SAC      aparece en 3/4  ganó en 1
  ELECTRO LIMA SAC          aparece en 3/4  ganó en 1

Rangos (todas ofertas, n=13):
  min=890K  max=1,350K  media=1,082K  mediana=1,060K  σ=145K

Rangos (solo ganadores, n=4):
  min=920K  max=1,120K  media=1,025K

Sugerencia cotización 2026:
  Rango competitivo: S/ 980,000 — S/ 1,080,000
  (basado en media ganadores ± 0.5σ)
  Valor referencial 2026: S/ 1,150,000  (margen hasta 94% del VR)

Alerta: CONSORCIO ELECTRO-SUR ganó 2 de los últimos 4. Probabilidad alta de
que postule 2026 con oferta ~960K (su patrón histórico).
```

---

**Fin del documento.**
