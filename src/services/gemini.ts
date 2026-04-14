import { GoogleGenAI } from "@google/genai";
import type { Proceso, DatosHistoricoExtraido } from '../types';

// ==================== API KEYS (RULETA) ====================
// NOTE: VITE_* env vars are bundled into the client build, so this is
// source hygiene only. True secrecy requires a server-side proxy.

const API_KEYS: string[] = (import.meta.env.VITE_GEMINI_API_KEYS ?? '')
  .split(',')
  .map((k: string) => k.trim())
  .filter(Boolean);

let _warnedEmptyKeys = false;
if (API_KEYS.length === 0 && !_warnedEmptyKeys) {
  _warnedEmptyKeys = true;
  console.warn('VITE_GEMINI_API_KEYS is empty or missing; Gemini calls will fail.');
}

const MODEL_NAME = "gemini-2.5-flash";

// ==================== SERVICIO GEMINI ====================

class GeminiService {
  private currentKeyIndex = 0;
  private consecutiveFailures = 0;

  private getNextKey(): string {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % API_KEYS.length;
    return API_KEYS[this.currentKeyIndex];
  }

  async call(prompt: string, maxRetries = 3): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const apiKey = this.getNextKey();

      try {
        const client = new GoogleGenAI({ apiKey });

        const response = await client.models.generateContent({
          model: MODEL_NAME,
          contents: prompt,
        });

        this.consecutiveFailures = 0;

        if (response.text) {
          return response.text;
        }

        throw new Error('Respuesta vacía de Gemini');
      } catch (error: any) {
        lastError = error as Error;

        // Si es rate limiting, intentar con otra key
        if (error.message?.includes('429') || error.message?.includes('quota')) {
          console.warn(`Rate limit en key ${this.currentKeyIndex}, rotando...`);
          this.consecutiveFailures++;
          continue;
        }

        console.warn(`Error con key ${this.currentKeyIndex}:`, error);
      }
    }

    throw lastError || new Error('Todas las API keys fallaron');
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

    const response = await this.call(prompt);
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
  "ranking": ["nomenclatura1", "nomenclatura2"] // ordenados de mejor a peor oportunidad
}

IMPORTANTE: Responde SOLO con el JSON, sin texto adicional.
`;

    const response = await this.call(prompt);
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
  "indices": [0, 5, 12], // índices de los procesos más relevantes
  "explicacion": "Por qué estos procesos son relevantes para la búsqueda"
}

IMPORTANTE: Responde SOLO con el JSON, sin texto adicional.
`;

    const response = await this.call(prompt);
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
      console.warn(`chatContextual: truncated ${procesos.length} procesos to ${CHAT_CONTEXT_CAP}`, {
        _truncated: true,
        _originalCount: procesos.length,
        _sentCount: CHAT_CONTEXT_CAP,
      });
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

    const response = await this.call(prompt);
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

  // ==================== EXTRACCIÓN DE DATOS DE IMÁGENES (VISION) ====================

  async extraerDatosSEACE(
    imagenes: File[],
    nomenclatura: string
  ): Promise<DatosHistoricoExtraido> {
    if (imagenes.length === 0) {
      throw new Error('Debes subir al menos una imagen');
    }

    // Limitar a 3 imágenes máximo
    const imagenesAProcesar = imagenes.slice(0, 3);

    // Validar y comprimir imágenes antes de procesarlas
    console.log('🖼️ Validando y procesando imágenes...');
    const imagenesValidadas = await Promise.all(
      imagenesAProcesar.map((img, idx) => this.validarYComprimirImagen(img, idx))
    );

    // Convertir imágenes a base64
    const imagenesBase64 = await Promise.all(
      imagenesValidadas.map(img => this.fileToBase64(img))
    );

    const prompt = `Eres un extractor de datos de capturas de pantalla del Sistema Electrónico de Contrataciones del Estado (SEACE) de Perú.

Analiza la imagen y extrae TODOS los datos que encuentres en formato JSON. Responde ÚNICAMENTE con el objeto JSON, sin texto adicional.

Campos a extraer (usa null si no encuentras el dato):
{
  "nomenclatura": "Código del proceso (ej: AS-SM-1-2024-MDP-1)",
  "año": número de 4 dígitos (extrae del nomenclatura si está presente),
  "entidad": "Nombre de la entidad convocante",
  "objeto": "Tipo de objeto (Bien/Servicio/Obra/Consultoría de Obra)",
  "descripcion": "Descripción del proceso",
  "valor_referencial": número sin separadores de miles,
  "monto_adjudicado": número sin separadores de miles,
  "ganador_ruc": "RUC del ganador (11 dígitos)",
  "ganador_nombre": "Razón social del ganador",
  "fecha_convocatoria": "YYYY-MM-DD",
  "fecha_buena_pro": "YYYY-MM-DD",
  "numero_contrato": "Número de contrato",
  "total_postores": número de participantes,
  "link_seace": "URL si está visible",
  "link_osce": "URL si está visible",
  "cronograma": [
    {
      "etapa": "Nombre de la etapa",
      "fecha_inicio": "YYYY-MM-DD",
      "fecha_fin": "YYYY-MM-DD"
    }
  ],
  "documentos": [
    {
      "nombre": "Nombre del documento",
      "tipo": "Tipo de documento",
      "url": "URL del documento"
    }
  ],
  "postores": [
    {
      "ruc": "RUC del postor",
      "razonSocial": "Nombre del postor",
      "representante": "Nombre del representante"
    }
  ]
}

IMPORTANTE:
- Si un campo no está visible en la imagen, usa null
- Los montos deben ser números sin separadores de miles ni símbolos de moneda
- Las fechas deben estar en formato YYYY-MM-DD
- Extrae el año del campo nomenclatura (el número de 4 dígitos después del guion)
- Responde SOLO con el JSON, sin markdown ni explicaciones`;

    // Intentar con múltiples API keys si hay rate limiting
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < API_KEYS.length; attempt++) {
      try {
        const apiKey = this.getNextKey();
        const client = new GoogleGenAI({ apiKey });

        // Preparar las partes del contenido con texto e imágenes
        const parts: any[] = [{ text: prompt }];

        // Agregar las imágenes como partes inline_data
        for (let idx = 0; idx < imagenesBase64.length; idx++) {
          parts.push({
            inlineData: {
              mimeType: imagenesValidadas[idx].type,
              data: imagenesBase64[idx]
            }
          });
        }

        // Calcular tamaño estimado
        const estimatedSize = imagenesBase64.reduce((sum, b64) => sum + b64.length, 0);
        const requestSizeMB = (estimatedSize / (1024 * 1024)).toFixed(2);

        console.log('📤 Enviando petición a Gemini:', {
          model: MODEL_NAME,
          imageCount: imagenesBase64.length,
          promptLength: prompt.length,
          requestSizeMB: `${requestSizeMB} MB`
        });

        // Verificar si el payload es demasiado grande (Gemini tiene límite de ~20MB)
        const maxPayloadMB = 18;
        if (parseFloat(requestSizeMB) > maxPayloadMB) {
          throw new Error(`El tamaño total de las imágenes (${requestSizeMB}MB) excede el límite de Gemini (${maxPayloadMB}MB). Intenta con menos imágenes o imágenes de menor tamaño.`);
        }

        // Llamar a la API usando el SDK
        const response = await client.models.generateContent({
          model: MODEL_NAME,
          contents: [{ parts }],
        });

        console.log('📥 Respuesta recibida de Gemini');

        const text = response.text;

        if (!text) {
          throw new Error('Respuesta vacía de Gemini');
        }

        // Intentar parsear el JSON
        let datosExtraidos: DatosHistoricoExtraido;

        try {
          const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          datosExtraidos = JSON.parse(jsonText);
        } catch (parseError) {
          console.error('Error parseando respuesta de Gemini:', text);
          throw new Error('La IA no devolvió un JSON válido. Intenta con otra imagen.');
        }

        // Asegurar que tenga nomenclatura
        if (!datosExtraidos.nomenclatura) {
          datosExtraidos.nomenclatura = nomenclatura;
        }

        // Extraer año de nomenclatura si no está presente
        if (!datosExtraidos.año) {
          const matchAño = datosExtraidos.nomenclatura.match(/-(\d{4})-/);
          if (matchAño) {
            datosExtraidos.año = parseInt(matchAño[1]);
          }
        }

        // Marcar como fuente IA
        datosExtraidos.fuente = 'IA';

        return datosExtraidos;

      } catch (error: any) {
        lastError = error;

        console.error('❌ Error detallado de Gemini:', error);

        // Si es rate limiting o API key inválida, intentar con otra key
        const errorMsg = error.message?.toLowerCase() || '';
        if (errorMsg.includes('429') ||
            errorMsg.includes('quota') ||
            errorMsg.includes('rate limit') ||
            errorMsg.includes('api_key_invalid') ||
            errorMsg.includes('api key not valid')) {
          console.warn(`⚠️ Problema con API key ${attempt + 1}/${API_KEYS.length}, probando siguiente...`);
          continue;
        }

        // Si es otro error, lanzarlo directamente
        throw error;
      }
    }

    // Si llegamos aquí, todas las keys fallaron
    throw lastError || new Error('No se pudo procesar la imagen con ninguna API key. Verifica que las API keys sean válidas.');
  }

  // Validar y comprimir imagen si es necesaria
  private async validarYComprimirImagen(file: File, index: number): Promise<File> {
    const maxSizeMB = 3; // Gemini recomienda máximo 4MB, usamos 3MB para seguridad
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    // Validar MIME type
    const mimeTypesValidos = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif'];
    if (!mimeTypesValidos.includes(file.type)) {
      console.warn(`⚠️ Imagen ${index + 1}: MIME type no soportado (${file.type}), intentando como JPEG`);
    }

    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    console.log(`📊 Imagen ${index + 1}: ${file.name} - ${sizeMB}MB (${file.type})`);

    // Si la imagen es menor al límite, usarla directamente
    if (file.size <= maxSizeBytes) {
      console.log(`✅ Imagen ${index + 1}: Tamaño OK, no requiere compresión`);
      return file;
    }

    // Comprimir imagen
    console.log(`🗜️ Imagen ${index + 1}: Comprimiendo de ${sizeMB}MB a máximo ${maxSizeMB}MB...`);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();

        img.onload = () => {
          // Calcular nuevas dimensiones manteniendo aspect ratio
          let width = img.width;
          let height = img.height;
          const maxDimension = 2048; // Dimensión máxima recomendada

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = (height / width) * maxDimension;
              width = maxDimension;
            } else {
              width = (width / height) * maxDimension;
              height = maxDimension;
            }
          }

          // Crear canvas y comprimir
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('No se pudo crear contexto de canvas'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Convertir a blob con calidad reducida
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Error al comprimir imagen'));
                return;
              }

              const compressedSizeMB = (blob.size / (1024 * 1024)).toFixed(2);
              console.log(`✅ Imagen ${index + 1}: Comprimida a ${compressedSizeMB}MB`);

              // Crear nuevo File desde el blob
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });

              resolve(compressedFile);
            },
            'image/jpeg',
            0.85 // Calidad 85%
          );
        };

        img.onerror = () => reject(new Error(`Error al cargar imagen ${index + 1}`));
        img.src = e.target?.result as string;
      };

      reader.onerror = () => reject(new Error(`Error al leer imagen ${index + 1}`));
      reader.readAsDataURL(file);
    });
  }

  // Convertir File a base64
  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        // Remover el prefijo "data:image/...;base64,"
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ==================== ANÁLISIS COMPARATIVO DE HISTÓRICOS ====================

  async generarAnalisisComparativoHistoricos(
    historicos: any[]
  ): Promise<string> {
    if (historicos.length === 0) {
      return '⚠️ No hay históricos disponibles para analizar.';
    }

    // Preparar datos de cada histórico
    const datosHistoricos = historicos.map(h => {
      // Intentar parsear DATOS_COMPLETOS_JSON si existe
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

      // Parsear otros JSON
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
        postores: postores,
        cronograma: cronograma,
        documentos: documentos,
        acciones: acciones,
        comite: comite,
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
      const response = await this.call(prompt);
      return response;
    } catch (error) {
      console.error('Error generando análisis comparativo:', error);
      return `❌ Error al generar el análisis: ${error instanceof Error ? error.message : 'Error desconocido'}`;
    }
  }
}

// ==================== SINGLETON ====================

export const geminiService = new GeminiService();
