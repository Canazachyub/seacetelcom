import { GoogleGenAI } from '@google/genai';
import type { DatosHistoricoExtraido } from '../types';

// ==================== API KEYS (RULETA) ====================
// Gemini se usa EXCLUSIVAMENTE para el OCR de capturas del SEACE
// (extraerDatosSEACE). Todas las funciones de texto usan DeepSeek vía
// src/services/deepseek.ts.

const API_KEYS: string[] = (import.meta.env.VITE_GEMINI_API_KEYS ?? '')
  .split(',')
  .map((k: string) => k.trim())
  .filter(Boolean);

let _warnedEmptyKeys = false;
if (API_KEYS.length === 0 && !_warnedEmptyKeys) {
  _warnedEmptyKeys = true;
  console.warn('VITE_GEMINI_API_KEYS is empty or missing; Gemini OCR calls will fail.');
}

const MODEL_NAME = 'gemini-2.5-flash';

// ==================== SERVICIO GEMINI (solo visión) ====================

class GeminiService {
  private currentKeyIndex = 0;

  private getNextKey(): string {
    if (API_KEYS.length === 0) {
      throw new Error('No hay API keys de Gemini configuradas. Define VITE_GEMINI_API_KEYS.');
    }
    this.currentKeyIndex = (this.currentKeyIndex + 1) % API_KEYS.length;
    return API_KEYS[this.currentKeyIndex];
  }

  async extraerDatosSEACE(
    imagenes: File[],
    nomenclatura: string
  ): Promise<DatosHistoricoExtraido> {
    if (imagenes.length === 0) {
      throw new Error('Debes subir al menos una imagen');
    }

    const imagenesAProcesar = imagenes.slice(0, 3);

    console.log('🖼️ Validando y procesando imágenes...');
    const imagenesValidadas = await Promise.all(
      imagenesAProcesar.map((img, idx) => this.validarYComprimirImagen(img, idx))
    );

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

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < API_KEYS.length; attempt++) {
      try {
        const apiKey = this.getNextKey();
        const client = new GoogleGenAI({ apiKey });

        const parts: any[] = [{ text: prompt }];

        for (let idx = 0; idx < imagenesBase64.length; idx++) {
          parts.push({
            inlineData: {
              mimeType: imagenesValidadas[idx].type,
              data: imagenesBase64[idx]
            }
          });
        }

        const estimatedSize = imagenesBase64.reduce((sum, b64) => sum + b64.length, 0);
        const requestSizeMB = (estimatedSize / (1024 * 1024)).toFixed(2);

        console.log('📤 Enviando petición a Gemini:', {
          model: MODEL_NAME,
          imageCount: imagenesBase64.length,
          promptLength: prompt.length,
          requestSizeMB: `${requestSizeMB} MB`
        });

        const maxPayloadMB = 18;
        if (parseFloat(requestSizeMB) > maxPayloadMB) {
          throw new Error(`El tamaño total de las imágenes (${requestSizeMB}MB) excede el límite de Gemini (${maxPayloadMB}MB). Intenta con menos imágenes o imágenes de menor tamaño.`);
        }

        const response = await client.models.generateContent({
          model: MODEL_NAME,
          contents: [{ parts }],
        });

        console.log('📥 Respuesta recibida de Gemini');

        const text = response.text;

        if (!text) {
          throw new Error('Respuesta vacía de Gemini');
        }

        let datosExtraidos: DatosHistoricoExtraido;

        try {
          const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          datosExtraidos = JSON.parse(jsonText);
        } catch {
          console.error('Error parseando respuesta de Gemini:', text);
          throw new Error('La IA no devolvió un JSON válido. Intenta con otra imagen.');
        }

        if (!datosExtraidos.nomenclatura) {
          datosExtraidos.nomenclatura = nomenclatura;
        }

        if (!datosExtraidos.año) {
          const matchAño = datosExtraidos.nomenclatura.match(/-(\d{4})-/);
          if (matchAño) {
            datosExtraidos.año = parseInt(matchAño[1]);
          }
        }

        datosExtraidos.fuente = 'IA';

        return datosExtraidos;
      } catch (error: any) {
        lastError = error;

        console.error('❌ Error detallado de Gemini:', error);

        const errorMsg = error.message?.toLowerCase() || '';
        if (
          errorMsg.includes('429') ||
          errorMsg.includes('quota') ||
          errorMsg.includes('rate limit') ||
          errorMsg.includes('api_key_invalid') ||
          errorMsg.includes('api key not valid')
        ) {
          console.warn(`⚠️ Problema con API key ${attempt + 1}/${API_KEYS.length}, probando siguiente...`);
          continue;
        }

        throw error;
      }
    }

    throw lastError ?? new Error('No se pudo procesar la imagen con ninguna API key. Verifica que las API keys sean válidas.');
  }

  private async validarYComprimirImagen(file: File, index: number): Promise<File> {
    const maxSizeMB = 3;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    const mimeTypesValidos = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif'];
    if (!mimeTypesValidos.includes(file.type)) {
      console.warn(`⚠️ Imagen ${index + 1}: MIME type no soportado (${file.type}), intentando como JPEG`);
    }

    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    console.log(`📊 Imagen ${index + 1}: ${file.name} - ${sizeMB}MB (${file.type})`);

    if (file.size <= maxSizeBytes) {
      console.log(`✅ Imagen ${index + 1}: Tamaño OK, no requiere compresión`);
      return file;
    }

    console.log(`🗜️ Imagen ${index + 1}: Comprimiendo de ${sizeMB}MB a máximo ${maxSizeMB}MB...`);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();

        img.onload = () => {
          let width = img.width;
          let height = img.height;
          const maxDimension = 2048;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = (height / width) * maxDimension;
              width = maxDimension;
            } else {
              width = (width / height) * maxDimension;
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('No se pudo crear contexto de canvas'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Error al comprimir imagen'));
                return;
              }

              const compressedSizeMB = (blob.size / (1024 * 1024)).toFixed(2);
              console.log(`✅ Imagen ${index + 1}: Comprimida a ${compressedSizeMB}MB`);

              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });

              resolve(compressedFile);
            },
            'image/jpeg',
            0.85
          );
        };

        img.onerror = () => reject(new Error(`Error al cargar imagen ${index + 1}`));
        img.src = e.target?.result as string;
      };

      reader.onerror = () => reject(new Error(`Error al leer imagen ${index + 1}`));
      reader.readAsDataURL(file);
    });
  }

  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}

export const geminiService = new GeminiService();
