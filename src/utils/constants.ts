import type { RegionPeru } from '../types';

// ==================== REGIONES DEL PERÚ ====================

export const REGIONES_PERU: RegionPeru[] = [
  'AMAZONAS', 'ANCASH', 'APURIMAC', 'AREQUIPA', 'AYACUCHO',
  'CAJAMARCA', 'CALLAO', 'CUSCO', 'HUANCAVELICA', 'HUANUCO',
  'ICA', 'JUNIN', 'LA LIBERTAD', 'LAMBAYEQUE', 'LIMA',
  'LORETO', 'MADRE DE DIOS', 'MOQUEGUA', 'PASCO', 'PIURA',
  'PUNO', 'SAN MARTIN', 'TACNA', 'TUMBES', 'UCAYALI'
];

// ==================== TIPOS DE OBJETO ====================

export const TIPOS_OBJETO = [
  'Servicio',
  'Bien',
  'Obra',
  'Consultoría de Obra'
];

// ==================== ESTADOS ====================

export const ESTADOS_INTERES = [
  { valor: 'PENDIENTE', label: 'Pendiente', color: 'gray' },
  { valor: 'INSCRITO', label: 'Inscrito', color: 'green' },
  { valor: 'DESCARTADO', label: 'Descartado', color: 'red' },
];

export const PRIORIDADES = [
  { valor: 'ALTA', label: 'Alta', color: 'red' },
  { valor: 'MEDIA', label: 'Media', color: 'yellow' },
  { valor: 'BAJA', label: 'Baja', color: 'gray' },
];

export const ESTADOS_FASE = [
  { valor: 'EN_PLAZO', label: 'En Plazo', color: 'green' },
  { valor: 'PROXIMO', label: 'Próximo', color: 'yellow' },
  { valor: 'VENCIDO', label: 'Vencido', color: 'red' },
  { valor: 'PENDIENTE', label: 'Pendiente', color: 'gray' },
];

// ==================== FASES DEL PROCESO ====================

export const FASES_PROCESO = [
  'Convocatoria',
  'Registro de participantes(Electronica)',
  'Formulación de consultas y observaciones(Electronica)',
  'Absolución de consultas y observaciones(Electronica)',
  'Integración de las Bases',
  'Presentación de propuestas(Electronica)',
  'Calificación y Evaluación de propuestas',
  'Otorgamiento de la Buena Pro'
];

// ==================== COLORES ====================

export const COLORES_REGION: Record<string, string> = {
  'LIMA': '#3b82f6',
  'AREQUIPA': '#ef4444',
  'CUSCO': '#f59e0b',
  'LA LIBERTAD': '#10b981',
  'PIURA': '#8b5cf6',
  'LAMBAYEQUE': '#ec4899',
  'JUNIN': '#06b6d4',
  'ANCASH': '#84cc16',
  'CAJAMARCA': '#f97316',
  'PUNO': '#6366f1',
};

// ==================== FORMATO MONEDA ====================

export function formatearMoneda(valor: number, moneda: string = 'PEN'): string {
  const simbolo = moneda === 'USD' ? '$' : 'S/';
  return `${simbolo} ${valor.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatearFecha(fecha: string | Date): string {
  if (!fecha) return '-';
  const d = new Date(fecha);
  return d.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

export function formatearFechaHora(fecha: string | Date): string {
  if (!fecha) return '-';
  const d = new Date(fecha);
  return d.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
