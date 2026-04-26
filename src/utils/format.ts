/**
 * src/utils/format.ts
 *
 * Módulo centralizado de formateo para SEACE Intelligence.
 * Fuente única de verdad para: montos (PEN/USD), números, deltas,
 * fechas relativas/cortas/largas, countdowns, truncado, estados
 * humanizados, RUC y porcentajes — todo en convención peruana.
 */

import {
  format,
  formatDistanceToNow,
  differenceInHours,
  differenceInDays,
  isPast,
  parseISO,
  isValid,
} from 'date-fns';
import { es } from 'date-fns/locale';

// ==================== MONEDA ====================

/** Formatea un monto en soles (PEN). Null/undefined/NaN → "No declarado". */
export function formatSoles(
  valor: number | null | undefined,
  opts?: { short?: boolean }
): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) {
    return 'No declarado';
  }
  const abs = Math.abs(valor);
  const signo = valor < 0 ? '-' : '';
  const fmt = (n: number, d = 2) =>
    Math.abs(n).toLocaleString('es-PE', {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });

  if (opts?.short) {
    if (abs >= 1_000_000_000) return `${signo}S/ ${fmt(valor / 1_000_000_000)} mil M`;
    if (abs >= 1_000_000) return `${signo}S/ ${fmt(valor / 1_000_000)} M`;
    if (abs >= 1_000) return `${signo}S/ ${fmt(valor / 1_000)} K`;
  }

  return `S/ ${valor.toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Formatea un monto en dólares (USD). Null/undefined/NaN → "No declarado". */
export function formatDolares(
  valor: number | null | undefined,
  opts?: { short?: boolean }
): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) {
    return 'No declarado';
  }
  const abs = Math.abs(valor);
  const signo = valor < 0 ? '-' : '';
  const fmt = (n: number, d = 2) =>
    Math.abs(n).toLocaleString('es-PE', {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });

  if (opts?.short) {
    if (abs >= 1_000_000_000) return `${signo}US$ ${fmt(valor / 1_000_000_000)} mil M`;
    if (abs >= 1_000_000) return `${signo}US$ ${fmt(valor / 1_000_000)} M`;
    if (abs >= 1_000) return `${signo}US$ ${fmt(valor / 1_000)} K`;
  }

  return `US$ ${valor.toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Enrutador de moneda. Normaliza strings legacy ('SOLES', 'DOLAR'). */
export function formatMoneda(
  valor: number | null | undefined,
  moneda: 'PEN' | 'SOLES' | 'USD' | 'DOLAR' | string = 'PEN',
  opts?: { short?: boolean }
): string {
  const m = String(moneda || '').toUpperCase();
  if (m === 'USD' || m === 'DOLAR' || m === 'DÓLAR') return formatDolares(valor, opts);
  return formatSoles(valor, opts);
}

// ==================== NÚMEROS ====================

/** Número con convención peruana. `short: true` → "42.8 K", "1.2 M", "3.1 mil M". */
export function formatNumero(
  valor: number,
  opts?: { decimales?: number; short?: boolean }
): string {
  if (Number.isNaN(valor)) return '0';
  const d = opts?.decimales ?? 0;
  const abs = Math.abs(valor);
  const signo = valor < 0 ? '-' : '';
  const fmt = (n: number) =>
    Math.abs(n).toLocaleString('es-PE', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });

  if (opts?.short) {
    if (abs >= 1_000_000_000) return `${signo}${fmt(valor / 1_000_000_000)} mil M`;
    if (abs >= 1_000_000) return `${signo}${fmt(valor / 1_000_000)} M`;
    if (abs >= 1_000) return `${signo}${fmt(valor / 1_000)} K`;
  }

  return valor.toLocaleString('es-PE', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

/** Delta entre actual y previo. "+47", "-12", "sin cambios", "+3.1 %". */
export function formatDelta(
  actual: number,
  previo: number,
  opts?: { asPercent?: boolean; prefix?: boolean }
): string {
  const prefix = opts?.prefix !== false;
  const delta = actual - previo;

  if (Math.abs(delta) < 0.01) return 'sin cambios';

  if (opts?.asPercent) {
    if (previo === 0) return prefix ? (delta > 0 ? '+∞ %' : '-∞ %') : '∞ %';
    const pct = (delta / previo) * 100;
    const signo = pct > 0 ? '+' : '';
    return `${prefix ? signo : ''}${pct.toFixed(1)} %`;
  }

  const signo = delta > 0 ? '+' : '';
  return `${prefix ? signo : ''}${Math.round(delta)}`;
}

// ==================== FECHAS ====================

function parseFecha(fecha: Date | string | null | undefined): Date | null {
  if (!fecha) return null;
  try {
    const d = typeof fecha === 'string' ? parseISO(fecha) : fecha;
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
}

/** "hace 4 minutos", "hace 2 horas", "en 3 días". Vacío si null/inválido. */
export function formatFechaRelativa(fecha: Date | string | null | undefined): string {
  const d = parseFecha(fecha);
  if (!d) return '';
  return formatDistanceToNow(d, { locale: es, addSuffix: true });
}

/** "15 abr 2025". Vacío si null/inválido. */
export function formatFechaCorta(fecha: Date | string | null | undefined): string {
  const d = parseFecha(fecha);
  if (!d) return '';
  return format(d, 'd MMM yyyy', { locale: es });
}

/** "15 de abril de 2025". Vacío si null/inválido. */
export function formatFechaLarga(fecha: Date | string | null | undefined): string {
  const d = parseFecha(fecha);
  if (!d) return '';
  return format(d, "d 'de' MMMM 'de' yyyy", { locale: es });
}

// ==================== COUNTDOWN ====================

export type UrgenciaCountdown = 'critico' | 'alto' | 'normal' | 'vencido' | 'sin_fecha';

/**
 * Countdown hacia una fecha límite.
 * - Vencida → 'vencido'
 * - <24h → 'critico' ("Vence en 2h 14m")
 * - <7d  → 'alto'    ("Vence en 3 días")
 * - Resto → 'normal' ("Vence el 18/04")
 * - null → 'sin_fecha'
 */
export function formatCountdown(
  fechaFin: Date | string | null | undefined
): { label: string; urgencia: UrgenciaCountdown } {
  const d = parseFecha(fechaFin);
  if (!d) return { label: '', urgencia: 'sin_fecha' };

  if (isPast(d)) return { label: 'Vencido', urgencia: 'vencido' };

  const now = new Date();
  const horas = differenceInHours(d, now);
  const dias = differenceInDays(d, now);

  if (horas < 24) {
    const h = Math.floor(horas);
    const m = Math.max(0, Math.round((horas - h) * 60));
    return { label: `Vence en ${h}h ${m}m`, urgencia: 'critico' };
  }

  if (dias < 7) {
    return {
      label: `Vence en ${dias} ${dias === 1 ? 'día' : 'días'}`,
      urgencia: 'alto',
    };
  }

  return {
    label: `Vence el ${format(d, 'dd/MM', { locale: es })}`,
    urgencia: 'normal',
  };
}

// ==================== TEXTO ====================

/** Trunca con ellipsis si supera `max`. Default ellipsis: "…". */
export function truncate(
  texto: string | null | undefined,
  max: number,
  opts?: { ellipsis?: string }
): string {
  if (!texto) return '';
  const ellipsis = opts?.ellipsis ?? '…';
  if (texto.length <= max) return texto;
  const cut = Math.max(0, max - ellipsis.length);
  return texto.substring(0, cut) + ellipsis;
}

/** Primera letra mayúscula, resto minúsculas. */
export function capitalize(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
}

/** 'EN_CURSO' → 'En curso', 'BUENA_PRO' → 'Buena pro'. */
export function humanizarEstado(estado: string | null | undefined): string {
  if (!estado) return '';
  return String(estado)
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((w, i) => (i === 0 ? capitalize(w) : w))
    .join(' ');
}

// ==================== RUC ====================

/** '20123456789' → '20-12345678-9'. Retorna original si no tiene 11 dígitos. */
export function formatRUC(ruc: string | null | undefined): string {
  if (!ruc) return '';
  const limpio = String(ruc).replace(/[^0-9]/g, '');
  if (limpio.length !== 11) return String(ruc);
  return `${limpio.substring(0, 2)}-${limpio.substring(2, 10)}-${limpio.substring(10)}`;
}

// ==================== PORCENTAJE ====================

/** 0.45 → '45 %'. Multiplica por 100. */
export function formatPorcentaje(
  valor: number,
  opts?: { decimales?: number }
): string {
  if (Number.isNaN(valor)) return '0 %';
  const d = opts?.decimales ?? 0;
  const pct = valor * 100;
  return `${pct.toLocaleString('es-PE', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  })} %`;
}

// ==================== FECHA RELATIVA CORTA (para headers) ====================

/** "hace 4 min" corto. Útil en headers con poco espacio. */
export function formatFechaRelativaCorta(
  fecha: Date | string | null | undefined
): string {
  const d = parseFecha(fecha);
  if (!d) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const absMs = Math.abs(diffMs);
  const future = diffMs < 0;

  const min = Math.floor(absMs / 60000);
  if (min < 1) return future ? 'en segundos' : 'recién';
  if (min < 60) return future ? `en ${min} min` : `hace ${min} min`;

  const h = Math.floor(min / 60);
  if (h < 24) return future ? `en ${h} h` : `hace ${h} h`;

  const d2 = Math.floor(h / 24);
  if (d2 < 30) return future ? `en ${d2} d` : `hace ${d2} d`;

  const meses = Math.floor(d2 / 30);
  if (meses < 12) return future ? `en ${meses} m` : `hace ${meses} m`;

  const años = Math.floor(meses / 12);
  return future ? `en ${años} a` : `hace ${años} a`;
}
