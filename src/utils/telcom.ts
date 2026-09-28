import type { Proceso } from '../types';
import competencia from '../data/competencia.json';

// ==================== PERFIL DE TELCOM ====================
// Fuente: docs/09-PERFIL-EXPERIENCIA-RADAR.md (BI SEACE por RUC + 18 procesos, 28/09/2026).
// Todo servicio; 10/10 procesos presentados ganados.

/** NUCLEO = entidades donde ya ganamos; ANILLO = mismo tipo de servicio, sin historial aún. */
export type NivelEntidad = 'NUCLEO' | 'ANILLO' | 'OTRA';

export const ENTIDADES_NUCLEO = ['ELSE', 'ELECTROSUR', 'ELECTRO UCAYALI'];
export const ENTIDADES_ANILLO = [
  'ELECTRO PUNO', 'SEAL', 'ELECTRO ORIENTE', 'ELECTROCENTRO', 'ENOSA',
  'ELECTRONORTE', 'HIDRANDINA', 'ADINELSA', 'ELECTRO DUNAS',
];

/** Minúsculas y sin tildes, para comparar descripciones del SEACE. */
export function normalizarTexto(t: string | null | undefined): string {
  return String(t || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export interface LineaServicio {
  id: string;
  nombre: string;
  /** Contratos que la respaldan (para el tooltip). */
  experiencia: string;
  /** Recibe la descripción normalizada. */
  coincide: (t: string) => boolean;
}

/** Líneas de servicio con experiencia real (doc 09 §1). */
export const LINEAS_SERVICIO: LineaServicio[] = [
  {
    id: 'A/B',
    nombre: 'Supervisión de contrastación / Proc. 227',
    experiencia: 'ELSE CP-SM-40-2024 S/ 451k · CP SER-SM-37-2026 S/ 601k · Electrosur AS-70-2018, AS-39-2021, O/S 2018 y 2023',
    coincide: (t) =>
      /supervision/.test(t) &&
      /contrastacion|contraste|medidor|procedimiento (n[°o.]* ?)?227|227-2013|reemplazo de medidores|ntcse/.test(t),
  },
  {
    id: 'C',
    nombre: 'Reclamos de usuarios',
    experiencia: 'ELSE CP SER-SM-26-2026 S/ 871k · EDCAES reparación por reclamos 2014-2016',
    coincide: (t) => /reclamo|procedimiento administrativo|atencion al usuario/.test(t),
  },
  {
    id: 'D',
    nombre: 'Control y reducción de pérdidas',
    experiencia: 'Electro Ucayali CP SER-SM-19-2025 S/ 360k · ELSE CP-ABR-27-2026 S/ 134k',
    coincide: (t) => /perdidas|hurto|balance de energia|recupero/.test(t),
  },
  {
    id: 'E',
    nombre: 'Información para fiscalización Osinergmin',
    experiencia: 'Electro Ucayali AS-77-2023, AS-116-2023 · 8 O/S Electrosur 2024-2026',
    coincide: (t) =>
      /osinergmin|fiscalizacion|ntcse|base metodologica|anexo 0?1|fuerza mayor|procesamiento de informacion|performance|calidad de producto|calidad de suministro|074-2004/.test(t),
  },
  {
    id: 'F',
    nombre: 'Trabajos comerciales de campo',
    experiencia: 'Electrosur AS-45-2022 S/ 114k · EDCAES conexiones domiciliarias ELSE 2017 S/ 312k',
    coincide: (t) =>
      /recodificacion|pintado de suministros|acometida|conexiones domiciliarias|registradores|mantenimiento de conexiones/.test(t),
  },
];

/**
 * Fuera del giro (doc 09 §2). "obra" solo como ejecución de obra: "supervisión de estudios
 * y obras de terceros" es un servicio de supervisión y no se excluye.
 */
const EXCLUSIONES: Array<{ etiqueta: string; patron: RegExp }> = [
  { etiqueta: 'obra', patron: /ejecucion de (la )?obra/ },
  { etiqueta: 'adquisición', patron: /adquisicion/ },
  { etiqueta: 'suministro de materiales', patron: /suministro de materiales/ },
  { etiqueta: 'bienes', patron: /\bbienes\b/ },
  { etiqueta: 'vigilancia', patron: /vigilancia/ },
  { etiqueta: 'limpieza', patron: /limpieza/ },
  { etiqueta: 'transporte de combustible', patron: /transporte de combustible/ },
  { etiqueta: 'patrocinio legal', patron: /patrocinio legal/ },
  { etiqueta: 'seguros', patron: /\bseguros?\b/ },
];

/** Rangos de valor referencial (doc 09 §2). */
export const MONTO = {
  MIN_FUERTE: 40_000,
  MAX_FUERTE: 1_200_000,
  MAX_AMPLIADO: 1_600_000,
  CONSORCIO: 2_000_000,
};

export type RangoMonto = 'FUERTE' | 'AMPLIADO' | 'ALTO' | 'CONSORCIO' | 'BAJO' | 'SIN_VR';

export function rangoMonto(valor: number | null | undefined): RangoMonto {
  const v = Number(valor) || 0;
  if (v <= 0) return 'SIN_VR';
  if (v < MONTO.MIN_FUERTE) return 'BAJO';
  if (v <= MONTO.MAX_FUERTE) return 'FUERTE';
  if (v <= MONTO.MAX_AMPLIADO) return 'AMPLIADO';
  if (v <= MONTO.CONSORCIO) return 'ALTO';
  return 'CONSORCIO';
}

// ==================== NOMENCLATURA ====================

// NBSP y caracteres de ancho cero (se construye con códigos para no dejar invisibles en el fuente)
const ESPACIOS_RAROS = new RegExp(`[${[0xa0, 0x200b, 0x200c, 0x200d, 0xfeff].map((c) => String.fromCharCode(c)).join('')}]`, 'g');

/**
 * Clave de comparación: mismo proceso aunque cambien espacios, guiones o ceros a la izquierda.
 * "CP SER-SM-7-2026-ELSE-1" y "CP-SER-SM-07-2026-ELSE-1" → "CP-SER-SM-7-2026-ELSE-1".
 * Solo para comparar; en la hoja se guarda la nomenclatura exacta.
 */
export function claveNomenclatura(nom: string | null | undefined): string {
  if (!nom) return '';
  return String(nom)
    .toUpperCase()
    .replace(ESPACIOS_RAROS, ' ')
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map((t) => (/^\d+$/.test(t) ? String(parseInt(t, 10)) : t))
    .join('-');
}

/** Sigla de la entidad: lo que va entre el año y la convocatoria. "AS-SM-5-2024-EO-L-1" → "EO-L". */
export function siglaNomenclatura(nom: string | null | undefined): string {
  const m = String(nom || '').toUpperCase().match(/-20\d{2}-(.+?)(?:-\d+)?\.?$/);
  return m ? m[1].trim() : '';
}

/** Siglas de nomenclatura → EMPRESA_CORTA. Se prueba en orden; la primera que calza gana. */
const SIGLA_A_EMPRESA: Array<{ patron: RegExp; empresa: string }> = [
  { patron: /^ELSE\b/, empresa: 'ELSE' },
  { patron: /^ELPU\b|PUNO/, empresa: 'ELECTRO PUNO' },
  { patron: /UCAYALI/, empresa: 'ELECTRO UCAYALI' },
  { patron: /^EO[\s\-/.]|^EO$|ORIENTE/, empresa: 'ELECTRO ORIENTE' },
  { patron: /ELECTROSUR|^ELS\b|^ES$/, empresa: 'ELECTROSUR' },
  { patron: /^SEAL\b/, empresa: 'SEAL' },
  { patron: /ELCTO|ELECTROCENTRO/, empresa: 'ELECTROCENTRO' },
  { patron: /ENOSA|NOROESTE/, empresa: 'ENOSA' },
  { patron: /HIDRANDINA/, empresa: 'HIDRANDINA' },
  { patron: /ADINELSA/, empresa: 'ADINELSA' },
  { patron: /EGESUR/, empresa: 'EGESUR' },
  { patron: /SEDAPAL/, empresa: 'SEDAPAL' },
  { patron: /OSINERGMIN/, empresa: 'OSINERGMIN' },
  { patron: /TOCACHE/, empresa: 'ELECTRO TOCACHE' },
  { patron: /DUNAS/, empresa: 'ELECTRO DUNAS' },
];

// ==================== COMPETENCIA (vault INGENIERIA TELCOM) ====================
// src/data/competencia.json lo genera scripts/sync_competencia.py desde 01_GERENCIA/experiencia/web.

export interface Rival { ruc: string; nombre: string; procesos: number; ganados: number; pctVr: number | null }
export interface CompetenciaEntidad {
  procesos: number;
  presentados: number;
  ganados: number;
  telcomPctVr: number | null;
  rivales: Rival[];
}

const COMPETENCIA = competencia.entidades as Record<string, CompetenciaEntidad>;

export function competenciaEntidad(empresaCorta: string | null | undefined): CompetenciaEntidad | null {
  return COMPETENCIA[String(empresaCorta || '').toUpperCase()] ?? null;
}

/**
 * Criterio "rival conocido débil/ausente" (10): Telcom ya compitió en la entidad y ganó siempre
 * a los rivales conocidos -> 10; hay rivales conocidos pero sin resultado frente a Telcom -> 5;
 * sin historial -> 0.
 */
export function puntosRival(c: CompetenciaEntidad | null): number {
  if (!c || c.rivales.length === 0) return 0;
  if (c.presentados > 0 && c.ganados === c.presentados) return 10;
  return 5;
}

export function empresaDesdeSigla(nom: string | null | undefined): string | null {
  const sigla = siglaNomenclatura(nom);
  if (!sigla) return null;
  for (const { patron, empresa } of SIGLA_A_EMPRESA) {
    if (patron.test(sigla)) return empresa;
  }
  return null;
}


// ==================== PUNTAJE (0-100, doc 09 §2) ====================

export function nivelEntidad(empresaCorta: string | null | undefined): NivelEntidad {
  const e = String(empresaCorta || '').toUpperCase();
  if (ENTIDADES_NUCLEO.includes(e)) return 'NUCLEO';
  if (ENTIDADES_ANILLO.includes(e)) return 'ANILLO';
  return 'OTRA';
}

export interface EvaluacionTelcom {
  nivel: NivelEntidad;
  lineas: LineaServicio[];
  /** Motivo de exclusión (vigilancia, limpieza…) o null. */
  excluido: string | null;
  monto: RangoMonto;
  /** Del giro = alguna línea con experiencia y sin exclusión. */
  delGiro: boolean;
  puntaje: number;
  desglose: { linea: number; entidad: number; monto: number; plazo: number; rival: number };
  competencia: CompetenciaEntidad | null;
}

/**
 * Puntaje de afinidad 0-100:
 *   línea con experiencia propia 40 · entidad núcleo 20 (anillo 10) ·
 *   VR S/ 40k-1.2M 20 (hasta 1.6M: 10; no publicado: 10) · rival conocido débil 10 (ver
 *   puntosRival) · días para presentar ≥ 10: 10. Un proceso excluido puntúa 0.
 */
export function evaluarProceso(p: Proceso, diasParaPresentar: number | null = null): EvaluacionTelcom {
  const nivel = nivelEntidad(p.EMPRESA_CORTA);
  const t = normalizarTexto(p.DESCRIPCION);
  const lineas = LINEAS_SERVICIO.filter((l) => l.coincide(t));
  const excl = EXCLUSIONES.find((e) => e.patron.test(t));
  const monto = rangoMonto(p.VALOR);
  const comp = competenciaEntidad(p.EMPRESA_CORTA);

  const desglose = {
    linea: lineas.length > 0 ? 40 : 0,
    entidad: nivel === 'NUCLEO' ? 20 : nivel === 'ANILLO' ? 10 : 0,
    monto: monto === 'FUERTE' ? 20 : monto === 'AMPLIADO' || monto === 'SIN_VR' ? 10 : 0,
    plazo: diasParaPresentar !== null && diasParaPresentar >= 10 ? 10 : 0,
    rival: puntosRival(comp),
  };
  const excluido = excl ? excl.etiqueta : null;
  const puntaje = excluido ? 0 : desglose.linea + desglose.entidad + desglose.monto + desglose.plazo + desglose.rival;

  return { nivel, lineas, excluido, monto, delGiro: lineas.length > 0 && !excluido, puntaje, desglose, competencia: comp };
}
