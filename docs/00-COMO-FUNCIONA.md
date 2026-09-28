# 00 - Cómo funciona SEACE TELCOM (resumen)

Radar de licitaciones para **Ingeniería Telcom EIRL**, enfocado en empresas del sector eléctrico
(ELSE, Electro Puno, SEAL, Electrocentro, Hidrandina, ADINELSA, etc.). Detalle técnico en los docs 01–06.

## Piezas

| Pieza | Dónde | Rol |
|---|---|---|
| **Google Sheet + Apps Script** | `GOOGLE_APPS_SCRIPT.js` (se pega a mano y se publica como Web App) | Base de datos y API (`?action=…`) |
| **Frontend React** | `src/` · GitHub Pages o `npm run dev` | Paneles, filtros, seguimiento |
| **SCRAPING-TELCOM** | `C:\PROGRAMACION\SCRAPING-TELCOM` (Selenium, PC local) | Trae listados y fichas del buscador SEACE (doc 06) |
| **Proxy OCDS** | `proxy/` (Worker de Cloudflare o túnel local) | Salta el bloqueo de OECE a las IPs de Google |
| **IA** | DeepSeek (análisis, re-ranking) · Gemini (lee capturas de SEACE) | Apoyo al análisis |

## Cómo entran los datos

1. **Listado de convocatorias:** Excel del buscador SEACE (a mano o del scraper) → hoja `SEACE_IMPORT`
   → `procesarImport` → `BD_PROCESOS`. Aquí se autocompletan región, empresa (EMPRESA_CORTA), tipo de
   servicio y antigüedad (ESTA SEMANA / ESTE MES / ÚLTIMO TRIMESTRE / ANTIGUO).
2. **Detalle de un proceso:** el scraper (`run.py --grupo`), la API OCDS o una captura leída por Gemini
   → `DATOS_SEACE` (cronograma, documentos, postores, contrato…).
3. **Índice OCDS:** mes a mes desde la API de OECE → `OCDS_INDEX` (sirve para encontrar el OCID de
   cualquier nomenclatura).

## Qué hace cada vista

| Vista | Para qué sirve en el día a día |
|---|---|
| **Dashboard** | Totales, montos, reparto por empresa, región y objeto |
| **Procesos** | Tabla filtrable de `BD_PROCESOS` (entidades y palabras clave guardadas en `FILTROS_*`) |
| **Seguimiento** | Procesos marcados como de interés: estado (Pendiente/Inscrito/Descartado), prioridad y las 8 fases con fechas, notas y enlaces |
| **Mapa** | Procesos por región del Perú |
| **Históricos** | Dado un proceso actual, busca convocatorias anteriores parecidas de la misma empresa (puntaje + re-ranking DeepSeek) |
| **Grupos** | Proceso actual + sus históricos agrupados; lanza/consulta el scraping y compara postores, montos y documentos |
| **OCDS** | Consulta directa a la API OCDS por nomenclatura, tender ID u OCID |
| **Diagnóstico** | Salud de las hojas y cobertura del índice OCDS por año y mes |

## Cómo encaja con el ciclo de una licitación

(Fases según el vault `LICITACIONES`, `wiki/syntheses/diagrama-flujo-proceso-licitacion.md`.)

| Fase del postor | Qué aporta hoy el sistema | Qué falta |
|---|---|---|
| Monitoreo diario de convocatorias | Procesos + filtros + ESTA SEMANA | La carga es manual, así que no hay alertas |
| Decidir si entrar (objeto, monto, competencia) | Históricos y Grupos: quién se presentó y a qué montos | Ganador y monto adjudicado casi nunca se llenan |
| Registro de participantes | Fase en Seguimiento | Aviso de vencimiento |
| Consultas → bases integradas | Enlaces a documentos | Descarga y lectura de bases |
| Presentación de ofertas | Fecha en Seguimiento | — |
| Buena pro / consentimiento | Fecha en Seguimiento | Resultado real (ganador, oferta) |
| Ejecución contractual | — | Fuera del alcance actual |

**Transición normativa:** los procesos bajo la Ley 32069 **sí aparecen en el buscador prod2 del SEACE 3**
(verificado el 28/09/2026, doc 07 §2.7), así que el scraper sigue sirviendo. Falta comprobar si PLADICOP
publica algo que el SEACE no.

Contexto de negocio (giro, entidades, montos, competidores): ver doc 08.
