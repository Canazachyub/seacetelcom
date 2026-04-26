import type { Proceso } from '../types';

// ==================== API KEYS (RULETA) ====================
// NOTE: VITE_* env vars are bundled into the client build, so this is
// source hygiene only. True secrecy requires a server-side proxy.

const API_KEYS: string[] = (import.meta.env.VITE_DEEPSEEK_API_KEYS ?? '')
  .split(',')
  .map((k: string) => k.trim())
  .filter(Boolean);

let _warnedEmptyKeys = false;
if (API_KEYS.length === 0 && !_warnedEmptyKeys) {
  _warnedEmptyKeys = true;
  console.warn('VITE_DEEPSEEK_API_KEYS is empty or missing; DeepSeek calls will fail.');
}

const API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL_NAME = 'deepseek-chat';

// ==================== SERVICIO DEEPSEEK ====================

type CallOptions = {
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
};

class DeepSeekService {
  private currentKeyIndex = 0;

  private getNextKey(): string {
    if (API_KEYS.length === 0) {
      throw new Error('No hay API keys de DeepSeek configuradas. Define VITE_DEEPSEEK_API_KEYS.');
    }
    this.currentKeyIndex = (this.currentKeyIndex + 1) % API_KEYS.length;
    return API_KEYS[this.currentKeyIndex];
  }

  async call(prompt: string, opts: CallOptions = {}, maxRetries = 3): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const apiKey = this.getNextKey();

      try {
        const body: Record<string, unknown> = {
          model: MODEL_NAME,
          messages: [{ role: 'user', content: prompt }],
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.maxTokens ?? 4096,
          stream: false,
        };

        if (opts.json) {
          body.response_format = { type: 'json_object' };
        }

        const res = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errText = await res.text();
          const err: any = new Error(`DeepSeek HTTP ${res.status}: ${errText}`);
          err.status = res.status;
          throw err;
        }

        const data = await res.json();
        const text: string | undefined = data?.choices?.[0]?.message?.content;

        if (typeof text === 'string' && text.length > 0) {
          return text;
        }

        throw new Error('Respuesta vacía de DeepSeek');
      } catch (error: any) {
        lastError = error as Error;

        const status = error?.status ?? 0;
        const msg = (error?.message ?? '').toLowerCase();

        if (status === 429 || status === 503 || msg.includes('rate') || msg.includes('quota')) {
          console.warn(`Rate limit/throttle en key ${this.currentKeyIndex}, rotando...`);
          continue;
        }

        console.warn(`Error con key ${this.currentKeyIndex}:`, error);
      }
    }

    throw lastError ?? new Error('Todas las API keys de DeepSeek fallaron');
  }

  // ==================== ANÁLISIS DE PROCESO ====================

  async analizarProceso(proceso: Proceso): Promise<{
    resumen: string;
    requisitosEstimados: string[];
    complejidad: 'BAJA' | 'MEDIA' | 'ALTA';
    recomendaciones: string[];
    palabrasClave: string[];
  }> {
    const prompt = `
Analiza este proceso de contratación del SEACE (Perú):

ENTIDAD: ${proceso.ENTIDAD}
REGIÓN: ${proceso.REGION}
NOMENCLATURA: ${proceso.NOMENCLATURA}
OBJETO: ${proceso.OBJETO}
DESCRIPCIÓN: ${proceso.DESCRIPCION}
VALOR: S/ ${proceso.VALOR?.toLocaleString() || 'No especificado'}
MONEDA: ${proceso.MONEDA}

Proporciona un análisis estructurado en formato JSON con estos campos:
{
  "resumen": "resumen ejecutivo en máximo 2 oraciones",
  "requisitosEstimados": ["requisito1", "requisito2", "requisito3"],
  "complejidad": "BAJA|MEDIA|ALTA",
  "recomendaciones": ["recomendación1", "recomendación2"],
  "palabrasClave": ["keyword1", "keyword2", "keyword3"]
}

IMPORTANTE: Responde SOLO con el JSON, sin texto adicional ni markdown.
`;

    const response = await this.call(prompt, { json: true });
    try {
      return JSON.parse(response.replace(/```json|```/g, '').trim());
    } catch {
      return {
        resumen: response.substring(0, 200),
        requisitosEstimados: [],
        complejidad: 'MEDIA',
        recomendaciones: [],
        palabrasClave: []
      };
    }
  }

  // ==================== COMPARAR PROCESOS ====================

  async compararProcesos(procesos: Proceso[]): Promise<{
    similitudes: string[];
    diferencias: string[];
    mejorOpcion: string;
    ranking: string[];
  }> {
    const resumen = procesos.map((p, i) =>
      `${i + 1}. ${p.NOMENCLATURA}\n   Entidad: ${p.ENTIDAD}\n   Descripción: ${p.DESCRIPCION}\n   Valor: S/ ${p.VALOR?.toLocaleString()}`
    ).join('\n\n');

    const prompt = `
Compara estos procesos de contratación del SEACE:

${resumen}

Proporciona una comparación en formato JSON:
{
  "similitudes": ["similitud1", "similitud2"],
  "diferencias": ["diferencia1", "diferencia2"],
  "mejorOpcion": "explicación de cuál podría ser más conveniente y por qué",
  "ranking": ["nomenclatura1", "nomenclatura2"]
}

IMPORTANTE: Responde SOLO con el JSON, sin texto adicional.
`;

    const response = await this.call(prompt, { json: true });
    try {
      return JSON.parse(response.replace(/```json|```/g, '').trim());
    } catch {
      return {
        similitudes: [],
        diferencias: [],
        mejorOpcion: response.substring(0, 300),
        ranking: procesos.map(p => p.NOMENCLATURA)
      };
    }
  }

  // ==================== BÚSQUEDA SEMÁNTICA ====================

  async busquedaSemantica(query: string, procesos: Proceso[]): Promise<{
    indices: number[];
    explicacion: string;
  }> {
    const resumen = procesos.slice(0, 50).map((p, i) =>
      `[${i}] ${p.NOMENCLATURA}: ${p.DESCRIPCION?.substring(0, 100)}`
    ).join('\n');

    const prompt = `
Dado estos procesos de contratación del SEACE:

${resumen}

El usuario busca: "${query}"

Identifica los procesos más relevantes para esta búsqueda.

Responde en formato JSON:
{
  "indices": [0, 5, 12],
  "explicacion": "Por qué estos procesos son relevantes para la búsqueda"
}

IMPORTANTE: Responde SOLO con el JSON, sin texto adicional.
`;

    const response = await this.call(prompt, { json: true });
    try {
      return JSON.parse(response.replace(/```json|```/g, '').trim());
    } catch {
      return {
        indices: [],
        explicacion: 'No se pudo procesar la búsqueda'
      };
    }
  }

  // ==================== CHAT CONTEXTUAL ====================

  async chatContextual(mensaje: string, procesos: Proceso[]): Promise<string> {
    const CHAT_CONTEXT_CAP = 50;
    const procesosContexto = procesos.slice(0, CHAT_CONTEXT_CAP);
    if (procesos.length > CHAT_CONTEXT_CAP) {
      console.warn(`chatContextual: truncated ${procesos.length} procesos to ${CHAT_CONTEXT_CAP}`);
    }
    const contexto = procesosContexto.map(p =>
      `- ${p.NOMENCLATURA}: ${p.DESCRIPCION} (${p.ENTIDAD}, S/ ${p.VALOR?.toLocaleString()})`
    ).join('\n');

    const prompt = `
Eres un asistente experto en contrataciones públicas del Perú (SEACE).

CONTEXTO - Procesos seleccionados por el usuario:
${contexto || 'No hay procesos seleccionados'}

PREGUNTA DEL USUARIO: ${mensaje}

Responde de forma clara, concisa y útil. Si es relevante, menciona procesos específicos del contexto.
Usa formato markdown para mejor legibilidad.
`;

    return await this.call(prompt);
  }

  // ==================== RESUMEN EJECUTIVO ====================

  async generarResumenEjecutivo(procesos: Proceso[]): Promise<{
    resumen: string;
    oportunidadesDestacadas: string[];
    alertas: string[];
    tendencias: string[];
  }> {
    const stats = {
      total: procesos.length,
      porObjeto: {} as Record<string, number>,
      porRegion: {} as Record<string, number>,
      valorTotal: 0
    };

    procesos.forEach(p => {
      stats.porObjeto[p.OBJETO] = (stats.porObjeto[p.OBJETO] || 0) + 1;
      stats.porRegion[p.REGION] = (stats.porRegion[p.REGION] || 0) + 1;
      stats.valorTotal += p.VALOR || 0;
    });

    const prompt = `
Genera un resumen ejecutivo de estos procesos de contratación del SEACE:

ESTADÍSTICAS:
- Total: ${stats.total} procesos
- Valor total: S/ ${stats.valorTotal.toLocaleString()}
- Por tipo: ${Object.entries(stats.porObjeto).map(([k, v]) => `${k}: ${v}`).join(', ')}
- Por región: ${Object.entries(stats.porRegion).slice(0, 5).map(([k, v]) => `${k}: ${v}`).join(', ')}

MUESTRA DE PROCESOS:
${procesos.slice(0, 10).map(p => `- ${p.NOMENCLATURA}: ${p.DESCRIPCION?.substring(0, 80)}`).join('\n')}

Responde en formato JSON:
{
  "resumen": "Resumen ejecutivo de 2-3 oraciones",
  "oportunidadesDestacadas": ["oportunidad1", "oportunidad2"],
  "alertas": ["alerta1 si hay algo importante"],
  "tendencias": ["tendencia1", "tendencia2"]
}

IMPORTANTE: Responde SOLO con el JSON.
`;

    const response = await this.call(prompt, { json: true });
    try {
      return JSON.parse(response.replace(/```json|```/g, '').trim());
    } catch {
      return {
        resumen: response.substring(0, 300),
        oportunidadesDestacadas: [],
        alertas: [],
        tendencias: []
      };
    }
  }

  // ==================== ANÁLISIS COMPARATIVO DE HISTÓRICOS ====================

  async generarAnalisisComparativoHistoricos(historicos: any[]): Promise<string> {
    if (historicos.length === 0) {
      return '⚠️ No hay históricos disponibles para analizar.';
    }

    const datosHistoricos = historicos.map(h => {
      let datosCompletos: any = {};
      if (h.DATOS_COMPLETOS_JSON) {
        try {
          datosCompletos = typeof h.DATOS_COMPLETOS_JSON === 'string'
            ? JSON.parse(h.DATOS_COMPLETOS_JSON)
            : h.DATOS_COMPLETOS_JSON;
        } catch {
          datosCompletos = {};
        }
      }

      let cronograma: any[] = [];
      let postores: any[] = [];
      let documentos: any[] = [];
      let acciones: any[] = [];
      let comite: any[] = [];

      try { cronograma = h.CRONOGRAMA_JSON ? JSON.parse(h.CRONOGRAMA_JSON) : datosCompletos.cronograma || []; } catch {}
      try { postores = h.POSTORES_JSON ? JSON.parse(h.POSTORES_JSON) : datosCompletos.postores || []; } catch {}
      try { documentos = h.DOCUMENTOS_JSON ? JSON.parse(h.DOCUMENTOS_JSON) : datosCompletos.documentos || []; } catch {}
      try { acciones = h.ACCIONES_JSON ? JSON.parse(h.ACCIONES_JSON) : datosCompletos.accionesDelProcedimiento || []; } catch {}
      try {
        const comiteData = h.COMITE_JSON ? JSON.parse(h.COMITE_JSON) : datosCompletos.comiteSeleccion;
        comite = comiteData?.integrantes || comiteData || [];
      } catch {}

      return {
        año: h.AÑO || datosCompletos.procedimiento?.nomenclatura?.match(/-(\d{4})-/)?.[1],
        nomenclatura: h.NOMENCLATURA || datosCompletos.procedimiento?.nomenclatura,
        entidad: h.ENTIDAD || datosCompletos.entidad?.nombre,
        entidadRuc: h.ENTIDAD_RUC || datosCompletos.entidad?.ruc,
        objeto: h.OBJETO || datosCompletos.objeto,
        valorReferencial: h.VALOR_REFERENCIAL || datosCompletos.valorReferencial,
        montoAdjudicado: h.MONTO_ADJUDICADO || datosCompletos.montoAdjudicado,
        ganadorNombre: h.GANADOR_NOMBRE || datosCompletos.ganador?.nombre,
        ganadorRuc: h.GANADOR_RUC || datosCompletos.ganador?.ruc,
        fechaConvocatoria: h.FECHA_CONVOCATORIA || datosCompletos.fechaConvocatoria,
        fechaBuenaPro: h.FECHA_BUENA_PRO || datosCompletos.fechaBuenaPro,
        totalPostores: h.TOTAL_POSTORES || datosCompletos.totalPostores || postores.length,
        estado: h.ESTADO_PROCESO || datosCompletos.procedimiento?.estado,
        contrato: h.NUMERO_CONTRATO || datosCompletos.contrato?.numero,
        postores,
        cronograma,
        documentos,
        acciones,
        comite,
        fuente: h.FUENTE
      };
    });

    const prompt = `Eres un analista experto en contrataciones públicas del Perú (SEACE).
Analiza los siguientes datos de procesos históricos de un mismo objeto de contratación a lo largo de diferentes años.

DATOS DE LOS PROCESOS HISTÓRICOS:
${JSON.stringify(datosHistoricos, null, 2)}

Genera un análisis comparativo COMPLETO en formato Markdown con las siguientes secciones:

## 📊 RESUMEN EJECUTIVO
Una tabla comparativa con: Año, Nomenclatura, Estado, Valor Referencial, Monto Adjudicado, % Adjudicación, Ganador

## 🏆 ANÁLISIS DE GANADORES
- Tabla de ganadores: RUC, Nombre, Veces ganadas, Monto total adjudicado
- Identificar ganadores recurrentes
- % de procesos ganados por cada empresa

## 👥 ANÁLISIS DE COMPETENCIA
- Tabla por año: Total postores, Consorcios, MYPE, Nuevos participantes, Recurrentes
- Tendencia de participación (creciente/decreciente)
- Postores que han participado en múltiples años

## ⏱️ ANÁLISIS DE TIEMPOS
- Tabla: Año, Fecha Convocatoria, Fecha Buena Pro, Días totales, Postergaciones
- Duración promedio del proceso
- Identificar postergaciones y sus motivos si están disponibles

## 📄 DOCUMENTOS POR ETAPA
- Tabla mostrando qué documentos están disponibles en cada año
- Identificar documentos faltantes o inconsistencias

## 🏛️ COMITÉ DE SELECCIÓN
- Si hay datos, mostrar rotación de integrantes
- Integrantes que se mantienen vs nuevos

## 💰 ANÁLISIS ECONÓMICO
- Tendencia del valor referencial (% de variación anual)
- Tendencia del monto adjudicado
- % de ahorro promedio (diferencia entre VR y adjudicado)
- Proyección para próximo año si hay tendencia clara

## 💡 INSIGHTS Y RECOMENDACIONES
Lista de 5-7 conclusiones clave y recomendaciones para futuras participaciones

IMPORTANTE:
- Usa emojis para hacer el análisis más visual
- Formatea los montos en soles con separadores de miles
- Calcula porcentajes cuando sea relevante
- Si faltan datos, indica "N/D" pero no dejes de analizar lo disponible
- Sé específico y menciona empresas/RUCs cuando sea relevante`;

    try {
      return await this.call(prompt, { maxTokens: 8192 });
    } catch (error) {
      console.error('Error generando análisis comparativo:', error);
      return `❌ Error al generar el análisis: ${error instanceof Error ? error.message : 'Error desconocido'}`;
    }
  }

  /**
   * Re-rankea candidatos históricos vs un proceso target usando razonamiento semántico.
   * El backend ya filtró por entidad/año/keywords (score base). Esta función evalúa
   * qué tan similares son los candidatos al target conceptualmente y agrega un
   * `llmScore` (0-100) + `llmRazon` corta.
   *
   * Hace UNA sola llamada al LLM enviando todos los candidatos en batch,
   * para minimizar latencia y costo.
   */
  async rerankearHistoricos(
    target: { descripcion: string; entidad: string },
    candidatos: Array<{ nomenclatura: string; descripcion: string; año: number }>
  ): Promise<Array<{ nomenclatura: string; llmScore: number; llmRazon: string }>> {
    if (candidatos.length === 0) return [];

    const candidatosTexto = candidatos
      .map((c, i) => `[${i + 1}] ${c.nomenclatura} (${c.año}): ${c.descripcion}`)
      .join('\n');

    const prompt = `Sos un experto en contrataciones públicas del Perú (SEACE).

Un usuario quiere identificar los procesos HISTÓRICOS (años anteriores) de un proceso actual, del mismo servicio o servicio muy similar.

**Proceso target (actual):**
Entidad: ${target.entidad}
Descripción: ${target.descripcion}

**Candidatos a evaluar (todos de la misma entidad o similar, años anteriores):**
${candidatosTexto}

**Tu tarea:**
Para cada candidato, dale un score de 0 a 100 de qué tan probable es que sea el "mismo servicio" que el target, aunque la descripción use palabras diferentes.

Criterios:
- 90-100: mismo servicio, solo cambia el año
- 70-89: servicio muy similar (mismo concepto, distinto alcance)
- 40-69: servicio relacionado (mismo sector/área pero objeto distinto)
- 0-39: no relacionado

Devolvé SOLO un JSON con este formato, sin texto adicional:
{
  "rankings": [
    { "n": 1, "score": 95, "razon": "Misma descripción exacta año pasado" },
    { "n": 2, "score": 72, "razon": "Mismo concepto de pérdidas en distinta zona" },
    ...
  ]
}`;

    try {
      const response = await this.call(prompt, {
        json: true,
        temperature: 0.3,
        maxTokens: 4096,
      });
      const parsed = JSON.parse(response);
      const rankings: Array<{ n: number; score: number; razon: string }> =
        parsed.rankings || [];

      return rankings
        .filter((r) => r.n >= 1 && r.n <= candidatos.length)
        .map((r) => ({
          nomenclatura: candidatos[r.n - 1].nomenclatura,
          llmScore: Math.max(0, Math.min(100, r.score)),
          llmRazon: r.razon || '',
        }));
    } catch (error) {
      console.error('Error re-rankeando históricos con LLM:', error);
      // Fallback: devolver candidatos sin re-ranking
      return candidatos.map((c) => ({
        nomenclatura: c.nomenclatura,
        llmScore: 50,
        llmRazon: 'Error al evaluar con IA',
      }));
    }
  }
}

// ==================== SINGLETON ====================

export const deepseekService = new DeepSeekService();
