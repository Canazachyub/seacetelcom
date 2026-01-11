import type { Proceso } from '../types';

// ==================== BÚSQUEDA DE HISTÓRICOS ====================

/**
 * Palabras comunes que no aportan significado para la búsqueda
 */
const STOP_WORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'en', 'para', 'por', 'con', 'y', 'a',
  'un', 'una', 'unos', 'unas', 'servicio', 'servicios', 'contratacion',
  'adquisicion', 'suministro', 'region', 'regional', 'empresa', 'saa', 'sa'
]);

/**
 * Extrae palabras clave significativas de una descripción
 */
export function extraerPalabrasClave(descripcion: string): string[] {
  if (!descripcion) return [];

  return descripcion
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .replace(/[^A-Z0-9\s]/g, ' ') // Solo letras, números y espacios
    .split(/\s+/)
    .filter(palabra =>
      palabra.length > 3 &&
      !STOP_WORDS.has(palabra.toLowerCase())
    );
}

/**
 * Calcula la similitud entre dos conjuntos de palabras clave (Jaccard)
 */
export function calcularSimilitud(palabras1: string[], palabras2: string[]): number {
  if (palabras1.length === 0 || palabras2.length === 0) return 0;

  const set1 = new Set(palabras1);
  const set2 = new Set(palabras2);

  const interseccion = [...set1].filter(x => set2.has(x)).length;
  const union = new Set([...set1, ...set2]).size;

  return union > 0 ? interseccion / union : 0;
}

/**
 * Resultado de búsqueda de histórico
 */
export interface ProcesoHistorico {
  proceso: Proceso;
  similitud: number;
  coincidencias: string[];
  esReincidencia: boolean; // Mismo servicio exacto (>80% similitud)
  añosPrevios: number; // Cuántos años antes
}

/**
 * Busca procesos históricos similares al proceso dado
 */
export function buscarHistoricos(
  procesoActual: Proceso,
  todosProcesos: Proceso[],
  umbralSimilitud: number = 0.3
): ProcesoHistorico[] {
  const palabrasActual = extraerPalabrasClave(procesoActual.DESCRIPCION || '');
  const fechaActual = new Date(procesoActual.FECHA_PUB);
  const añoActual = fechaActual.getFullYear();

  const historicos: ProcesoHistorico[] = [];

  for (const proceso of todosProcesos) {
    // Excluir el mismo proceso por ID (NOMENCLATURA puede repetirse en reiniciados)
    if (proceso.ID === procesoActual.ID) continue;

    // Debe ser de la misma entidad
    if (proceso.ENTIDAD !== procesoActual.ENTIDAD) continue;

    // Debe ser del mismo tipo de objeto
    if (proceso.OBJETO !== procesoActual.OBJETO) continue;

    // Solo procesos anteriores
    const fechaProceso = new Date(proceso.FECHA_PUB);
    if (fechaProceso >= fechaActual) continue;

    // Calcular similitud
    const palabrasProceso = extraerPalabrasClave(proceso.DESCRIPCION || '');
    const similitud = calcularSimilitud(palabrasActual, palabrasProceso);

    // Si supera el umbral, es un histórico
    if (similitud >= umbralSimilitud) {
      const coincidencias = palabrasActual.filter(p =>
        palabrasProceso.includes(p)
      );

      historicos.push({
        proceso,
        similitud,
        coincidencias,
        esReincidencia: similitud >= 0.7,
        añosPrevios: añoActual - fechaProceso.getFullYear()
      });
    }
  }

  // Ordenar por fecha (más reciente primero)
  return historicos.sort((a, b) =>
    new Date(b.proceso.FECHA_PUB).getTime() - new Date(a.proceso.FECHA_PUB).getTime()
  );
}

/**
 * Agrupa históricos por año
 */
export function agruparPorAño(historicos: ProcesoHistorico[]): Record<number, ProcesoHistorico[]> {
  const grupos: Record<number, ProcesoHistorico[]> = {};

  for (const h of historicos) {
    const año = new Date(h.proceso.FECHA_PUB).getFullYear();
    if (!grupos[año]) {
      grupos[año] = [];
    }
    grupos[año].push(h);
  }

  return grupos;
}

/**
 * Calcula estadísticas de tendencia para los históricos
 */
export interface TendenciaHistorica {
  valorPromedio: number;
  valorMinimo: number;
  valorMaximo: number;
  tendenciaValor: 'subiendo' | 'bajando' | 'estable';
  frecuenciaAnual: number; // Veces por año en promedio
  ultimaFecha: Date;
  totalHistoricos: number;
}

export function calcularTendencia(
  procesoActual: Proceso,
  historicos: ProcesoHistorico[]
): TendenciaHistorica | null {
  if (historicos.length === 0) return null;

  const valores = historicos.map(h => h.proceso.VALOR || 0);
  const años = new Set(historicos.map(h =>
    new Date(h.proceso.FECHA_PUB).getFullYear()
  ));

  const valorPromedio = valores.reduce((a, b) => a + b, 0) / valores.length;
  const valorMinimo = Math.min(...valores);
  const valorMaximo = Math.max(...valores);

  // Calcular tendencia comparando con el promedio histórico
  const valorActual = procesoActual.VALOR || 0;
  let tendenciaValor: 'subiendo' | 'bajando' | 'estable' = 'estable';

  if (valorActual > valorPromedio * 1.1) {
    tendenciaValor = 'subiendo';
  } else if (valorActual < valorPromedio * 0.9) {
    tendenciaValor = 'bajando';
  }

  // Frecuencia anual
  const frecuenciaAnual = historicos.length / años.size;

  // Última fecha
  const ultimaFecha = new Date(Math.max(
    ...historicos.map(h => new Date(h.proceso.FECHA_PUB).getTime())
  ));

  return {
    valorPromedio,
    valorMinimo,
    valorMaximo,
    tendenciaValor,
    frecuenciaAnual,
    ultimaFecha,
    totalHistoricos: historicos.length
  };
}

/**
 * Obtiene el año de la nomenclatura del proceso
 */
export function extraerAñoNomenclatura(nomenclatura: string): number | null {
  // Formato típico: CP-SM-7-2022-ELSE-1
  const match = nomenclatura.match(/(\d{4})/);
  return match ? parseInt(match[1]) : null;
}
