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

// ==================== MAPEOS DE HUMANIZACIÓN ====================

/**
 * Mapeo de siglas de empresa eléctrica a nombre completo + región.
 * Usado para tooltips en badges que muestran EMPRESA_CORTA.
 */
export const EMPRESA_CORTA_MAP: Record<string, string> = {
  'ELSE': 'Electro Sur Este S.A.A. · Cusco',
  'HIDRANDINA': 'Hidrandina S.A. · La Libertad',
  'ELECTRONOROESTE': 'Electronoroeste S.A. · Piura/Tumbes',
  'ENOSA': 'Electronoroeste S.A. · Piura',
  'ELECTROCENTRO': 'Electrocentro S.A. · Junín/Pasco',
  'SEAL': 'Sociedad Eléctrica del Sur Oeste · Arequipa',
  'ELECTROSUR': 'Electro Sur S.A. · Tacna/Moquegua',
  'ELECTRO PUNO': 'Electro Puno S.A.C. · Puno',
  'ELECTRO ORIENTE': 'Electro Oriente S.A. · Loreto',
  'ELECTRO UCAYALI': 'Electro Ucayali S.A. · Ucayali',
  'ADINELSA': 'Administración de Infraestructura Eléctrica S.A. · Nacional',
  'ELECTROPERÚ': 'Electroperú S.A. · Generadora nacional',
  'SAN GABÁN': 'San Gabán S.A. · Generadora Puno',
  'EGASA': 'Empresa de Generación Arequipa S.A.',
  'EGEMSA': 'Empresa de Generación Machupicchu S.A. · Cusco',
  'EGESUR': 'Empresa de Generación Sur S.A. · Tacna',
  'OSINERGMIN': 'Organismo Supervisor de la Inversión en Energía y Minería',
  'COES': 'Comité de Operación Económica del Sistema',
  'MEM': 'Ministerio de Energía y Minas',
  'PROINVERSIÓN': 'Agencia de Promoción de la Inversión Privada',
  'SEDAPAL': 'Servicio de Agua Potable y Alcantarillado de Lima',
};

/**
 * Prefijos de nomenclatura SEACE a descripción humana.
 * Ej: "CP-SM-46-2025-ELSE-1" → CP = Contratación Pública, SM = Suministro Mayor
 */
export const NOMENCLATURA_TAG_MAP: Record<string, string> = {
  'CP': 'Concurso Público',
  'LP': 'Licitación Pública',
  'AS': 'Adjudicación Simplificada',
  'CD': 'Contratación Directa',
  'SIE': 'Subasta Inversa Electrónica',
  'CM': 'Comparación de Precios',
  'SM': 'Suministro Mayor',
  'SO': 'Suministro Ordinario',
  'EO': 'Ejecución de Obra',
  'CO': 'Consultoría de Obra',
  'SER': 'Servicio',
  'BIEN': 'Bien',
};

/**
 * Devuelve el nombre humano de una sigla de empresa si está en el mapeo.
 * Fallback: la sigla original.
 */
export function humanizarEmpresa(sigla: string | null | undefined): string {
  if (!sigla) return '';
  return EMPRESA_CORTA_MAP[sigla] || sigla;
}

/**
 * Genera un tooltip humano para una nomenclatura SEACE.
 * Ej: "CP-SM-46-2025-ELSE-1" → "Concurso Público · Suministro Mayor · 2025 · Electro Sur Este"
 */
export function humanizarNomenclatura(nom: string | null | undefined): string {
  if (!nom) return '';
  const partes = nom.split('-');
  const humanizadas = partes.map((p) => {
    const tag = NOMENCLATURA_TAG_MAP[p.toUpperCase()];
    if (tag) return tag;
    const empresa = EMPRESA_CORTA_MAP[p.toUpperCase()];
    if (empresa) return empresa;
    return p;
  });
  return humanizadas.join(' · ');
}

