# SEACE Intelligence

Plataforma web para monitoreo y gestión de procesos de contratación pública del SEACE (Sistema Electrónico de Contrataciones del Estado) de Perú.

## Stack Tecnológico

- **Frontend:** React 18 + TypeScript + Vite
- **Estilos:** Tailwind CSS
- **Estado:** Zustand
- **Gráficos:** Recharts
- **Backend:** Google Apps Script (REST API)
- **Base de datos:** Google Sheets
- **Almacenamiento:** Google Drive (carpetas por proceso)

## Arquitectura

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   React App     │────▶│  Google Apps Script  │────▶│  Google Sheets  │
│   (Frontend)    │◀────│  (REST API - doGet)  │◀────│  (Base de datos)│
└─────────────────┘     └──────────────────────┘     └─────────────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │    Google Drive      │
                        │ (Carpetas procesos)  │
                        └──────────────────────┘
```

## Estructura de Archivos

```
src/
├── App.tsx                    # Vistas principales (Dashboard, Procesos, Seguimiento, Mapa)
├── components/
│   ├── dashboard/Dashboard.tsx   # Vista principal con estadísticas
│   ├── table/ProcesosTable.tsx   # Tabla de procesos con selección
│   ├── map/PeruMap.tsx           # Mapa interactivo del Perú
│   ├── ui/                       # Componentes UI reutilizables
│   └── layout/                   # Header, Sidebar, Layout
├── services/api.ts            # Funciones para llamar al API
├── store/useStore.ts          # Estado global con Zustand
├── types/index.ts             # Tipos TypeScript
└── utils/constants.ts         # Constantes y utilidades

GOOGLE_APPS_SCRIPT.js          # Código completo del backend (copiar a Apps Script)
.env                           # URL del API desplegado
```

## Hojas de Google Sheets

| Hoja | Descripción |
|------|-------------|
| `SEACE_IMPORT` | Datos crudos pegados desde SEACE |
| `BD_PROCESOS` | Base de datos procesada |
| `SEGUIMIENTO` | Procesos en seguimiento con 8 etapas |
| `CRONOGRAMA` | Fechas de cada etapa por proceso |
| `DOCUMENTOS` | Archivos asociados a procesos |
| `FILTROS_ENTIDADES` | Entidades favoritas |
| `FILTROS_PALABRAS` | Palabras clave para filtrar |
| `REGIONES` | Patrones de detección de regiones |
| **`OCDS_INDEX`** | **Índice de 124K+ procesos OCDS (2021-2025)** |

## Sistema de Seguimiento (8 Etapas SEACE)

Cada proceso en seguimiento tiene 8 etapas con estados:

1. **CONVOCATORIA** - Publicación del proceso
2. **REGISTRO_PARTICIPANTES** - Inscripción electrónica
3. **CONSULTAS_OBSERVACIONES** - Formulación de consultas
4. **ABSOLUCION_CONSULTAS** - Respuesta a consultas
5. **INTEGRACION_BASES** - Bases finales
6. **PRESENTACION_PROPUESTAS** - Envío electrónico
7. **CALIFICACION_EVALUACION** - Evaluación de propuestas
8. **BUENA_PRO** - Otorgamiento

**Estados de etapa:** `PENDIENTE` | `EN_CURSO` | `COMPLETADO` | `VENCIDO` | `NO_APLICA`

Cada etapa tiene 4 columnas en SEGUIMIENTO: `{ETAPA}_ESTADO`, `{ETAPA}_INICIO`, `{ETAPA}_FIN`, `{ETAPA}_NOTAS`

---

## 🔗 Integración OCDS (Open Contracting Data Standard)

### ¿Qué es OCDS?

API oficial del Gobierno de Perú con datos completos de contrataciones públicas en formato OCDS (estándar internacional).

- **URL Base:** `https://contratacionesabiertas.oece.gob.pe/api/v1`
- **Datos disponibles:** Agosto 2021 - Diciembre 2025 (actualizado mensualmente)
- **Total indexado:** 124,338 procesos únicos

### Arquitectura de Integración

```
┌─────────────────────┐
│  Python Script      │  1. Descarga datos OCDS por mes/año
│  generar_indice.py  │  2. Cachea en JSON (data/cache/)
└──────────┬──────────┘  3. Genera CSV con índice
           │
           ▼
┌─────────────────────┐
│  OCDS_INDEX.csv     │  Índice: NOMENCLATURA → TENDER_ID/OCID
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Google Sheets      │  Hoja OCDS_INDEX (124K+ procesos)
│  OCDS_INDEX         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Google Apps Script │  Módulos OCDS_API + OCDS_INDEX
│  OCDS_API           │  - getByTenderId()
│  OCDS_INDEX         │  - getByOcid()
└──────────┬──────────┘  - getProcesoOCDS()
           │
           ▼
┌─────────────────────┐
│  React Frontend     │  Consulta procesos OCDS en tiempo real
│  api.ts             │
└─────────────────────┘
```

### Estructura OCDS_INDEX (Google Sheets)

| Columna | Descripción | Ejemplo |
|---------|-------------|---------|
| `NOMENCLATURA` | ID único del proceso | `CP-SM-52-2024-ELSE-1` |
| `TENDER_ID` | ID para consultar API | `1089084` |
| `OCID` | Open Contracting ID | `ocds-dgy273-seacev3-1089084` |
| `ENTIDAD` | Entidad convocante | `EMPRESA REGIONAL DE...` |
| `DESCRIPCION` | Objeto del proceso | `SERVICIO DE...` |
| `FECHA_ACTUALIZACION` | Última actualización | `2025-12-28 17:59:49` |

### Scripts Python para OCDS

#### 📄 `python/generar_indice.py`

Script para descargar y generar índice OCDS.

**Uso:**

```bash
# Generar índice completo (2022-2025)
python python/generar_indice.py --all

# Solo procesos ELSE
python python/generar_indice.py --all --else

# Solo un año específico
python python/generar_indice.py --year 2024
```

**Características:**
- ✅ Cache inteligente (descarga una sola vez)
- ✅ Rate limiting (0.5s entre requests)
- ✅ Maneja 200 páginas por mes (~4000 registros)
- ✅ Deduplicación automática
- ✅ Progreso visible por página

**Output:** `data/output/OCDS_INDEX_COMPLETO.csv`

**Cache:** `data/cache/{YEAR}-{MONTH}_seace_v3.json`

#### Estructura de datos en cache

Cada archivo JSON contiene array de records OCDS:

```json
[
  {
    "uri": "...",
    "publishedDate": "...",
    "compiledRelease": {
      "ocid": "ocds-dgy273-seacev3-1089084",
      "tender": {
        "id": "1089084",
        "title": "CP-SM-52-2024-ELSE-1",
        "description": "SERVICIO DE...",
        "status": "active",
        "value": { "amount": 1443946.75, "currency": "PEN" }
      },
      "buyer": {
        "name": "EMPRESA REGIONAL DE...",
        "id": "20493841937"
      },
      "awards": [...],
      "contracts": [...]
    }
  }
]
```

### API Endpoints OCDS (Google Apps Script)

Todos disponibles en `GOOGLE_APPS_SCRIPT.js`:

#### 1. `getProcesoOCDS`
Busca proceso por nomenclatura (consulta OCDS_INDEX → API OCDS).

**Parámetros:**
```javascript
{ nomenclatura: "CP-SM-52-2024-ELSE-1" }
```

**Retorna:**
```javascript
{
  success: true,
  datos: {
    nomenclatura: "CP-SM-52-2024-ELSE-1",
    ocid: "ocds-dgy273-seacev3-1089084",
    tender_id: "1089084",
    titulo: "CP-SM-52-2024-ELSE-1",
    descripcion: "SERVICIO DE...",
    entidad: { nombre: "...", ruc: "..." },
    monto: { valor: 1443946.75, moneda: "PEN" },
    estado: "active",
    fechaPublicacion: "2024-12-01",
    awards: [...],
    contracts: [...]
  }
}
```

#### 2. `getByTenderId`
Consulta directa por TENDER_ID.

**Parámetros:**
```javascript
{ tenderId: "1089084" }
```

#### 3. `getByOcid`
Consulta directa por OCID.

**Parámetros:**
```javascript
{ ocid: "ocds-dgy273-seacev3-1089084" }
```

### Frontend - Usar OCDS desde React

En `src/services/api.ts`:

```typescript
// Obtener proceso OCDS por nomenclatura
const proceso = await getProcesoOCDS("CP-SM-52-2024-ELSE-1");

// Por tender_id directo
const proceso = await getByTenderId("1089084");

// Por OCID directo
const proceso = await getByOcid("ocds-dgy273-seacev3-1089084");
```

### Actualizar Índice OCDS

Cada vez que necesites actualizar el índice (nuevos meses):

1. **Ejecutar script Python:**
   ```bash
   cd c:/PROGRAMACION/SEACE
   python python/generar_indice.py --all
   ```

2. **Importar a Google Sheets:**
   - Abre `data/output/OCDS_INDEX_COMPLETO.csv`
   - Google Sheets → OCDS_INDEX → Archivo > Importar
   - O copia/pega desde A2

3. **Verificar en API:**
   ```
   GET https://script.google.com/.../exec?action=getProcesoOCDS&nomenclatura=CP-SM-52-2024-ELSE-1
   ```

### Datos Disponibles por Año

| Año | Meses | Registros | Procesos ELSE |
|-----|-------|-----------|---------------|
| 2021 | Ago | 4,000 | 8 |
| 2022 | Ago-Dic | 20,000 | 29 |
| 2023 | Ago-Dic | 20,000 | ~50 |
| 2024 | Ene-Dic | 80,215 | 147 |
| 2025 | Ago-Dic | 20,000 | ~30 |
| **TOTAL** | | **144,215** | **~264** |

**Nota:** La API OCDS solo tiene datos desde agosto de cada año.

---

## 🔄 Sincronización de Grupos Históricos (Multi-Año)

### ¿Qué son los Grupos Históricos?

Permite rastrear el mismo proceso a lo largo de múltiples años (2021-2025), comparando cronogramas y documentos año por año.

**Ejemplo:** Un proceso de "Limpieza de Canales de Riego" puede haberse ejecutado en 2022, 2023 y 2024 con la misma nomenclatura base pero diferente año.

### Arquitectura del Sistema Multi-Año

```
┌─────────────────────────────────────────────────────┐
│  SEGUIMIENTO Sheet - Estructura Multi-Año          │
├─────────────────────────────────────────────────────┤
│  NOMENCLATURA: CP-SM-36-2024-ELSE-1 (actual)       │
│                                                     │
│  CONVOCATORIA_ESTADO: COMPLETADO                    │
│  CONVOCATORIA_NOTAS: Proceso recurrente            │
│  CONVOCATORIA_AÑOS: {                              │
│    2021: { INICIO, FIN, LINK }                     │
│    2022: { INICIO, FIN, LINK }                     │
│    2023: { INICIO, FIN, LINK }                     │
│    2024: { INICIO, FIN, LINK } ← Actual            │
│    2025: { INICIO, FIN, LINK }                     │
│  }                                                  │
└─────────────────────────────────────────────────────┘
```

### Funciones Backend (GOOGLE_APPS_SCRIPT.js)

#### Helpers de Sincronización

```javascript
// Extrae el año de la nomenclatura
_extraerAñoNomenclatura(nomenclatura)
// Input:  "CP-SM-36-2024-ELSE-1"
// Output: 2024

// Construye link OSCE con tenderId
_construirLinkOSCE(nomenclatura, tenderId)
// Output: "https://prodapp2.seace.gob.pe/.../buscadorPublico.xhtml?tenderId=1089084"
```

#### Sincronización Individual

```javascript
sincronizarHistoricoIndividual({
  nomenclatura: "CP-SM-36-2024-ELSE-1"
})
```

**Proceso:**
1. Extrae año automáticamente de la nomenclatura (2024)
2. Busca en OCDS_INDEX para obtener tenderId
3. Consulta API OCDS con tenderId
4. Extrae cronograma (convocatoria, consultas, buena pro)
5. Construye link OSCE con tenderId
6. Guarda datos en columnas específicas del año:
   - `CONVOCATORIA_2024_INICIO`
   - `CONVOCATORIA_2024_FIN`
   - `CONVOCATORIA_2024_LINK`

**Retorna:**
```javascript
{
  success: true,
  etapasActualizadas: 3,
  año: 2024,
  linkOSCE: "https://prodapp2.seace.gob.pe/...?tenderId=1089084",
  mensaje: "Histórico CP-SM-36-2024-ELSE-1 (2024) sincronizado con 3 etapas"
}
```

#### Sincronización Grupal

```javascript
sincronizarGrupoHistorico({
  nomenclaturaActual: "CP-SM-36-2024-ELSE-1"
})
```

**Proceso:**
1. Obtiene grupo histórico asociado (nomenclaturas de 2021-2025)
2. Sincroniza nomenclatura actual
3. Sincroniza cada histórico del grupo individualmente
4. Cada uno se guarda en su columna de año correspondiente
5. Maneja errores por histórico sin interrumpir el flujo

**Retorna:**
```javascript
{
  success: true,
  totalHistoricos: 5,
  totalEtapasActualizadas: 12,
  resultados: [
    { nomenclatura: "CP-SM-36-2024-ELSE-1", año: 2024, etapas: 3, success: true },
    { nomenclatura: "CP-SM-36-2023-ELSE-1", año: 2023, etapas: 3, success: true },
    { nomenclatura: "CP-SM-36-2022-ELSE-1", año: 2022, etapas: 2, success: true },
    { nomenclatura: "CP-SM-36-2021-ELSE-1", año: 2021, etapas: 0, success: false, error: "No encontrado en OCDS" }
  ],
  mensaje: "Sincronizados 5 históricos con 12 etapas totales"
}
```

### Frontend - UI Multi-Año

#### Vista Comparativa por Años

En la vista de Seguimiento, cada proceso muestra una tabla comparativa:

| Año | Fecha Inicio | Fecha Fin | Link OSCE | Acciones |
|-----|--------------|-----------|-----------|----------|
| 2021 | 15-ago | 30-ago | [Ver en OSCE](link) | ✏️ 📁 |
| 2022 | 10-ago | 25-ago | [Ver en OSCE](link) | ✏️ 📁 |
| 2023 | 12-ago | 28-ago | [Ver en OSCE](link) | ✏️ 📁 |
| 2024 | 14-ago | 29-ago | [Ver en OSCE](link) | ✏️ 📁 |
| 2025 | - | - | - | ✏️ 📁 |

#### Botón de Sincronización

```typescript
// En SeguimientoView - src/App.tsx
<Button
  variant="secondary"
  size="sm"
  icon={<RefreshCw size={14} />}
  onClick={() => handleSincronizarGrupo(s.NOMENCLATURA)}
  title="Sincroniza todos los históricos del grupo (2021-2025) con OCDS y guarda por año"
>
  Sincronizar Históricos Completo
</Button>
```

#### Handler Frontend

```typescript
const handleSincronizarGrupo = async (nomenclatura: string) => {
  const resultado = await sincronizarGrupoHistorico(nomenclatura);

  if (resultado.success) {
    // Muestra resumen detallado:
    // ✅ Sincronizados 5 históricos con 12 etapas totales
    //
    // 📊 Resultados:
    // ✅ CP-SM-36-2024-ELSE-1 (2024): 3 etapas
    // ✅ CP-SM-36-2023-ELSE-1 (2023): 3 etapas
    // ❌ CP-SM-36-2021-ELSE-1: No encontrado en índice OCDS

    cargarSeguimiento(); // Recargar para mostrar nuevos datos
  }
};
```

### Edición Inline por Año

Cada celda de año es editable:
- Click en ✏️ junto al año
- Editar fecha inicio, fecha fin, link OSCE
- Guardar con ✓ o cancelar con ✗
- Se actualiza automáticamente en SEGUIMIENTO sheet

### Beneficios del Sistema Multi-Año

✅ **Consultas individuales** - Una query OCDS por cada histórico, más preciso
✅ **Año automático** - Extracción mediante regex del patrón de nomenclatura
✅ **Link OSCE guardado** - URL específica con tenderId para cada año
✅ **Menos carga** - Consultas específicas en lugar de búsquedas amplias
✅ **Datos persistentes** - Se guardan directamente en SEGUIMIENTO por año
✅ **Trazabilidad** - Resultados detallados por cada histórico procesado
✅ **Comparativa visual** - Vista de tabla con todos los años lado a lado

### Casos de Uso

**Ejemplo 1: Proceso Anual de Limpieza**
```
Nomenclatura Base: CP-SM-36-{AÑO}-ELSE-1
Históricos: 2021, 2022, 2023, 2024, 2025

Click "Sincronizar Históricos Completo"
→ Consulta OCDS para cada año
→ Guarda cronogramas por año en columnas separadas
→ Genera links OSCE únicos por año
→ Muestra tabla comparativa con todos los años
```

**Ejemplo 2: Análisis de Tendencias**
- Ver cómo ha variado el cronograma del mismo proceso año tras año
- Identificar patrones de retrasos o adelantos
- Comparar documentación entre años
- Verificar cambios en montos adjudicados

---

## Configuración Inicial

### 1. Google Sheets + Apps Script

1. Crear nuevo Google Sheets
2. Extensiones > Apps Script
3. Pegar contenido de `GOOGLE_APPS_SCRIPT.js`
4. Ejecutar `autorizarDrive` desde el editor para autorizar permisos
5. Desplegar como Web App (Ejecutar como: Yo, Acceso: Cualquiera)
6. Copiar URL del despliegue

### 2. Configurar .env

```env
VITE_API_URL=https://script.google.com/macros/s/[TU_ID]/exec
```

### 3. Crear Hojas Base

En Google Sheets: Menú SEACE Intelligence > Crear Hojas Base

### 4. Configurar ID de Carpeta Drive

En `GOOGLE_APPS_SCRIPT.js` línea 27:
```javascript
const DRIVE_FOLDER_ID = 'TU_ID_CARPETA_DRIVE';
```

## Comandos

```bash
npm install     # Instalar dependencias
npm run dev     # Servidor desarrollo
npm run build   # Build producción
```

---

## ESTADO ACTUAL Y PENDIENTES

### Funcionalidades Completadas

- [x] Dashboard con estadísticas y mapa de Perú
- [x] Filtrado por región (click en mapa)
- [x] Filtrado por entidades (con búsqueda)
- [x] Tabla de procesos con selección múltiple
- [x] Vista de seguimiento con timeline de 8 etapas
- [x] Barra de progreso por proceso
- [x] Agregar procesos a seguimiento (individual y masivo)
- [x] Transformación de datos planos a objetos anidados (etapas)
- [x] Vista expandida con detalle de etapas
- [x] **NUEVO:** Sincronización multi-año de grupos históricos (2021-2025)
- [x] **NUEVO:** Extracción automática de año desde nomenclatura
- [x] **NUEVO:** Generación automática de links OSCE con tenderId
- [x] **NUEVO:** Vista comparativa por años en tabla interactiva
- [x] **NUEVO:** Edición inline de etapas por año (fechas + link OSCE)
- [x] **NUEVO:** Sincronización individual y grupal con OCDS
- [x] **NUEVO:** Tracking multi-año con datos persistentes por año

#### 🆕 v2.0 - Nuevas Funcionalidades (Dic 2025)

- [x] **Sistema de Empresas Eléctricas Configurables:**
  - Filtro con 25 empresas eléctricas del Perú
  - Patrones de búsqueda con regex (VILLACURI, EGEPSA|PANGOA, etc.)
  - Colores personalizados por empresa (#E3F2FD, #E8F5E9, etc.)
  - Toggle activar/desactivar empresas
  - Agregar nuevas empresas desde UI
  - Hoja: `FILTROS_EMPRESAS_ELECTRICAS`

- [x] **Vista de Seguimiento Detalle Completo:**
  - Componente con tabs: cronograma, documentos, postores, históricos
  - Vista de ganador destacada con ícono de premio
  - Tabla comparativa multi-año (2021-2025)
  - Estados visuales por etapa (COMPLETADO/EN_CURSO/VENCIDO)
  - Botón de sincronización OCDS integrado

- [x] **Sistema de Históricos Mejorado:**
  - Hoja `HISTORICOS_DETALLE` con 20 columnas
  - Campos: nomenclatura, año, entidad, valor, ganador, documentos_json, postores_json
  - Función `guardarHistoricoExtraidoIA()` para datos de IA
  - Función `getComparativaHistoricos()` con tendencia (CRECIENTE/DECRECIENTE/ESTABLE)
  - Soporte para extracción con IA desde capturas SEACE

- [x] **APIs y Tipos TypeScript:**
  - Nuevas interfaces: `EmpresaElectrica`, `ProcesoDetalleCompleto`, `HistoricoDetalle`, `ComparativaHistoricos`
  - Nuevas funciones API: `getEmpresasElectricas()`, `getSeguimientoDetalleCompleto()`, `getComparativaHistoricos()`
  - Componentes: `FiltroEmpresas.tsx`, `SeguimientoDetalleCompleto.tsx`

- [x] **Backend (Google Apps Script):**
  - Módulo `EmpresasElectricas` con creación automática de hoja
  - Módulo `SeguimientoV2` con detalle completo de procesos
  - Módulo `HistoricosDetalle` con comparativas y tendencias
  - Router actualizado con 6 nuevas acciones

#### 🆕 v2.1 - Sistema de Upload y Vinculación de Documentos (Ene 2026)

- [x] **Upload de Archivos a Google Drive:**
  - Subida de archivos PDF, DOC, XLS, JPG, PNG, ZIP (max 45MB)
  - Conversión automática a Base64 para envío via POST
  - Content-Type `text/plain` para evitar preflight CORS
  - Carpetas automáticas por proceso: `SEACE TELCOM/{nomenclatura}/`
  - Carpetas para históricos: `HISTORICOS/{año}/{nomenclatura}/`

- [x] **Vinculación de Archivos a Documentos Existentes:**
  - Dropdown para seleccionar documento destino (sin URL)
  - Actualización de columna `URL_DRIVE` en hoja DOCUMENTOS
  - Para históricos: actualización de `DOCUMENTOS_JSON` en HISTORICOS_DETALLE
  - Ojito (Eye icon) aparece cuando documento tiene URL vinculada

- [x] **FileUploader Component:**
  - Drag & drop + click para seleccionar archivos
  - Validación de tipo y tamaño antes de subir
  - Progress visual durante upload
  - Selector de documento destino con soporte multi-formato
  - Props: `esHistorico`, `añoProceso` para carpetas históricos
  - Compatible con campos `NOMBRE/nombre`, `URL_DRIVE/url`, `TIPO/tipo`

- [x] **Backend Upload (GOOGLE_APPS_SCRIPT.js):**
  - `uploadAndRegister()`: Sube archivo + registra/actualiza en DOCUMENTOS
  - `updateUrl()`: Actualiza URL_DRIVE de documento existente
  - `_actualizarDocumentoEnHistorico()`: Actualiza DOCUMENTOS_JSON para históricos
  - `_getOrCreateProcesoFolder()`: Crea carpeta del proceso si no existe

### PENDIENTES / PROBLEMAS CONOCIDOS

#### 1. Autorización Google Drive (CRÍTICO)
**Estado:** NO FUNCIONA
**Problema:** Al ejecutar `autorizarDrive` desde el editor de Apps Script, se queda cargando infinitamente sin mostrar el popup de autorización de Google.
**Síntoma:** "Se ha iniciado la ejecución" pero nunca completa ni pide permisos.
**Intentos realizados:**
- Función `autorizarDrive()` que llama a `DriveApp.getRootFolder()`
- Ejecutar desde el menú personalizado
- Ejecutar directamente desde el editor

**Solución posible:**
- Verificar que no haya bloqueador de popups
- Intentar en otro navegador (Chrome sin extensiones)
- Verificar que la cuenta de Google tenga permisos de Drive
- Crear un nuevo proyecto de Apps Script desde cero

#### 2. Carpetas de Drive no se crean
**Estado:** BLOQUEADO (depende de #1)
**Problema:** La función `crearCarpetaProcesoEnDrive` no puede ejecutarse porque Drive no está autorizado.
**Impacto:** Al agregar proceso a seguimiento, no se crea la carpeta ni subcarpetas en Drive.

#### 3. Headers de SEGUIMIENTO
**Estado:** VERIFICAR
**Archivo:** `GOOGLE_APPS_SCRIPT.js` función `crearHojasBaseV2()`
**Verificar:** Que los headers coincidan exactamente con:
```
NOMENCLATURA, ENTIDAD, OBJETO, VALOR, REGION, ESTADO_INTERES, PRIORIDAD,
RESPONSABLE, NOTAS, FECHA_AGREGADO, CARPETA_DRIVE,
CONVOCATORIA_ESTADO, CONVOCATORIA_INICIO, CONVOCATORIA_FIN, CONVOCATORIA_NOTAS,
REGISTRO_PARTICIPANTES_ESTADO, REGISTRO_PARTICIPANTES_INICIO, REGISTRO_PARTICIPANTES_FIN, REGISTRO_PARTICIPANTES_NOTAS,
... (y así para las 8 etapas)
```

#### 4. Edición de etapas desde la UI ✅ RESUELTO
**Estado:** IMPLEMENTADO
**Descripción:** ✅ UI completa para editar etapas por año (fechas, link OSCE)
**Funcionalidad:** Click en ✏️ → editar inicio/fin/link → guardar con ✓
**Backend:** `updateEtapaSeguimiento()` ahora acepta parámetros `año` y `link`

#### 5. Gestión de documentos ✅ IMPLEMENTADO
**Estado:** COMPLETADO (v2.1)
**Descripción:** UI completa para subir archivos y vincularlos a documentos
**Funcionalidades:**
- FileUploader con drag & drop en pestaña Documentos
- Selector de documento destino para vincular archivos existentes
- Ojito (Eye) para ver documentos con URL
- Soporte para procesos regulares e históricos
- Carpetas automáticas en Drive por proceso/año

#### 6. Botón "Analizar con IA"
**Estado:** NO IMPLEMENTADO
**Ubicación:** `ProcesosTable.tsx` línea 129
**Descripción:** Botón existe pero no hace nada

#### 7. Actualizar URL de proceso en SEACE
**Estado:** NO IMPLEMENTADO
**Descripción:** Los procesos no tienen URL a SEACE original

### Próximos Pasos Sugeridos

1. **RESOLVER AUTORIZACIÓN DRIVE** - Sin esto no funcionan las carpetas
2. Agregar UI para editar estados de etapas
3. Agregar subida de documentos
4. Integrar URL de SEACE en procesos

---

## API Endpoints (Google Apps Script)

### GET (Lectura)

#### Endpoints SEACE (BD_PROCESOS)
| Action | Descripción |
|--------|-------------|
| `getProcesos` | Lista procesos con filtros opcionales |
| `getCronograma` | Cronograma de un proceso |
| `getSeguimiento` | Lista procesos en seguimiento |
| `getSeguimientoDetalle` | Detalle completo de seguimiento |
| `getDocumentos` | Documentos de un proceso |
| `getEstadisticas` | Estadísticas generales |
| `getRegiones` | Regiones con conteo de procesos |
| `getFiltrosEntidades` | Entidades favoritas |
| `getFiltrosPalabras` | Palabras clave |

#### Endpoints OCDS (API Gubernamental)
| Action | Parámetros | Descripción |
|--------|------------|-------------|
| `getProcesoOCDS` | `nomenclatura` | Busca en OCDS_INDEX → consulta API OCDS |
| `getByTenderId` | `tenderId` | Consulta directa API OCDS por tender_id |
| `getByOcid` | `ocid` | Consulta directa API OCDS por OCID |

#### Endpoints v2.0 🆕 (Empresas, Seguimiento, Históricos)
| Action | Parámetros | Descripción |
|--------|------------|-------------|
| **Empresas Eléctricas** |||
| `getEmpresasElectricas` | - | Obtiene lista de empresas eléctricas activas |
| `toggleEmpresaElectrica` | `item`, `activo` | Activa/desactiva una empresa |
| `addEmpresaElectrica` | `nombreCompleto`, `nombreCorto`, `patronBusqueda`, `colorHex` | Agrega nueva empresa al filtro |
| **Seguimiento Detalle** |||
| `getSeguimientoDetalleCompleto` | `nomenclatura` | Obtiene detalle completo con cronograma, documentos, postores, históricos |
| **Históricos** |||
| `guardarHistoricoExtraidoIA` | `datosExtraidos` (JSON) | Guarda datos extraídos por IA desde capturas |
| `getComparativaHistoricos` | `nomenclatura` | Obtiene comparativa multi-año con tendencias |

#### Endpoints Sincronización Multi-Año ⭐ NUEVO
| Action | Parámetros | Descripción |
|--------|------------|-------------|
| `sincronizarHistoricoIndividual` | `nomenclatura` | Sincroniza UN histórico con OCDS (extrae año, guarda por año + link OSCE) |
| `sincronizarGrupoHistorico` | `nomenclaturaActual` | Sincroniza TODOS los históricos de un grupo (2021-2025 individualmente) |

### POST (Escritura) - Via GET para CORS
| Action | Descripción |
|--------|-------------|
| `addSeguimiento` | Agregar proceso a seguimiento |
| `updateSeguimiento` | Actualizar estado/prioridad |
| `updateEtapaSeguimiento` | Actualizar etapa específica (ahora con parámetros `año` y `link`) |
| `addDocumento` | Agregar documento |
| `crearCarpetaDrive` | Crear carpeta manualmente |
| `procesarImport` | Procesar datos de SEACE_IMPORT |

### POST (Upload de Archivos) 🆕
| Action | Parámetros | Descripción |
|--------|------------|-------------|
| `uploadAndRegisterDocument` | `nomenclatura`, `fileName`, `fileData` (base64), `mimeType`, `etapa?`, `entidad?`, `documentoDestino?`, `esHistorico?`, `añoProceso?` | Sube archivo a Drive y registra/actualiza en DOCUMENTOS. Si `esHistorico=true`, también actualiza DOCUMENTOS_JSON en HISTORICOS_DETALLE |
| `uploadFileToDrive` | `nomenclatura`, `fileName`, `fileData`, `mimeType` | Sube archivo solo a Drive sin registrar en hojas |

**Nota:** Los endpoints de upload usan `Content-Type: text/plain` para evitar preflight CORS.

---

## Notas para Claude

### Arquitectura General
- El archivo `GOOGLE_APPS_SCRIPT.js` contiene TODO el código del backend
- Las llamadas API son GET (incluso las de escritura) por problemas de CORS con Apps Script
- Los datos de etapas se transforman de plano (`CONVOCATORIA_ESTADO`) a anidado (`CONVOCATORIA: { ESTADO }`) en `getSeguimiento()`
- La URL del API está en `.env` como `VITE_API_URL`
- El estado global está en `src/store/useStore.ts` (Zustand)

### OCDS Integration
- **OCDS_INDEX sheet:** 124,338 procesos únicos indexados (2021-2025)
- **Cache local:** `data/cache/` contiene 144,215 registros totales en JSON
- **Script Python:** `python/generar_indice.py` para actualizar índice
- **Módulos en Apps Script:**
  - `OCDS_API` - Consultas a API gubernamental
  - `OCDS_INDEX` - Búsqueda en índice local
- **API OCDS URL:** `https://contratacionesabiertas.oece.gob.pe/api/v1`
- **Formato:** Estándar OCDS internacional (awards, contracts, parties, etc.)
- **Actualización:** Mensual por el gobierno, ejecutar script Python para sincronizar

### Flujo de Consulta OCDS
1. Usuario busca por NOMENCLATURA (ej: "CP-SM-52-2024-ELSE-1")
2. Se consulta OCDS_INDEX en Google Sheets para obtener TENDER_ID
3. Se hace request a API OCDS con TENDER_ID
4. Se retorna objeto completo con tender, buyer, awards, contracts, etc.
5. Frontend muestra datos enriquecidos en tiempo real

### Archivos Clave OCDS
- `GOOGLE_APPS_SCRIPT.js` - Módulos OCDS_API y OCDS_INDEX
- `python/generar_indice.py` - Generador de índice
- `data/cache/*.json` - Cache de datos OCDS
- `data/output/OCDS_INDEX_COMPLETO.csv` - Índice completo para importar
- `src/services/api.ts` - Funciones frontend: getProcesoOCDS, getByTenderId, getByOcid

### Sistema Multi-Año (Grupos Históricos)
- **Estructura SEGUIMIENTO:** Cada etapa tiene columnas por año: `{ETAPA}_{AÑO}_INICIO`, `{ETAPA}_{AÑO}_FIN`, `{ETAPA}_{AÑO}_LINK`
- **Extracción de año:** Regex `/-(\d{4})-/` sobre nomenclatura
- **Link OSCE:** Construido con tenderId: `https://prodapp2.seace.gob.pe/.../buscadorPublico.xhtml?tenderId={ID}`
- **Sincronización individual:** `sincronizarHistoricoIndividual()` - UN histórico con año específico
- **Sincronización grupal:** `sincronizarGrupoHistorico()` - TODOS los históricos del grupo (2021-2025)
- **UI Comparativa:** Tabla con 5 años (2021-2025) mostrando fechas y links por año
- **Edición inline:** Click en ✏️ por año → editar inicio/fin/link → guardar con ✓
- **Persistencia:** Datos guardados directamente en SEGUIMIENTO sheet por año

### Flujo de Sincronización Multi-Año
1. Usuario selecciona proceso en Seguimiento
2. Click "Sincronizar Históricos Completo"
3. Backend obtiene grupo histórico (ej: 5 nomenclaturas 2021-2025)
4. **Por cada histórico:**
   - Extrae año de nomenclatura (regex)
   - Busca tenderId en OCDS_INDEX
   - Consulta OCDS API
   - Extrae cronograma (convocatoria, consultas, buena pro)
   - Construye link OSCE con tenderId
   - Guarda en columnas del año: `CONVOCATORIA_2024_INICIO`, `CONVOCATORIA_2024_FIN`, `CONVOCATORIA_2024_LINK`
5. Retorna resumen: total históricos, etapas actualizadas, éxitos/fallos
6. Frontend recarga y muestra tabla comparativa con datos de todos los años

### Sistema de Upload de Documentos (v2.1)

#### Estructura de Carpetas en Drive
```
SEACE TELCOM/                           ← Carpeta raíz (CONFIG.DRIVE_FOLDER_ID)
├── CP-SM-46-2025-ELSE-1/               ← Proceso actual en seguimiento
│   └── archivo.pdf
├── CP-SM-52-2024-ELSE-1/
│   └── bases.pdf
└── HISTORICOS/                         ← Carpeta para procesos históricos
    ├── 2024/
    │   └── CP-SM-36-2024-ELSE-1/
    │       └── documento.pdf
    ├── 2023/
    │   └── CP-SM-36-2023-ELSE-1/
    └── 2022/
```

#### Flujo de Upload con Vinculación
```
1. Usuario selecciona archivo en FileUploader
2. Si hay documentos sin URL → aparece dropdown "Vincular con..."
3. Usuario selecciona documento destino (ej: "BASES INTEGRADAS")
4. Click "Subir"
5. Frontend: uploadDocument(nomenclatura, file, etapa, entidad, documentoDestino, esHistorico, añoProceso)
6. Backend:
   a. Sube archivo a Drive → obtiene viewUrl
   b. Si documentoDestino:
      - Actualiza URL_DRIVE en hoja DOCUMENTOS
      - Si esHistorico: también actualiza DOCUMENTOS_JSON en HISTORICOS_DETALLE
   c. Si no hay documentoDestino: crea nuevo registro en DOCUMENTOS
7. Frontend recibe {success, viewUrl}
8. Refresca datos → documento muestra ojito con link
```

#### Compatibilidad de Campos
El sistema soporta múltiples formatos de nombres de campo:
- **Nombre:** `NOMBRE` | `nombre` | `NOMBRE_ARCHIVO`
- **URL:** `URL_DRIVE` | `URL_ARCHIVO` | `url`
- **Tipo:** `TIPO` | `tipo` | `TIPO_DOCUMENTO`
- **Etapa:** `ETAPA` | `etapa`

Esto permite compatibilidad entre:
- Documentos de procesos regulares (hoja DOCUMENTOS)
- Documentos de históricos (DOCUMENTOS_JSON en HISTORICOS_DETALLE)

#### Archivos Clave Upload
- `src/components/ui/FileUploader.tsx` - Componente de upload con drag & drop
- `src/services/api.ts` - Funciones `uploadDocument()`, `validarArchivo()`, `fileToBase64()`
- `GOOGLE_APPS_SCRIPT.js`:
  - `uploadAndRegister()` - Función principal de upload
  - `updateUrl()` - Actualiza URL en hoja DOCUMENTOS
  - `_actualizarDocumentoEnHistorico()` - Actualiza JSON en HISTORICOS_DETALLE
  - `_getOrCreateProcesoFolder()` - Crea carpeta si no existe
